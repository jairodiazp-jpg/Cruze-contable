package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"intelisupp/agents/go-runtime/internal/agent"
	"intelisupp/agents/go-runtime/internal/config"
	"intelisupp/agents/go-runtime/internal/model"
	"intelisupp/agents/go-runtime/internal/repository"
)

type Orchestrator struct {
	cfg             config.Config
	repo            *repository.Repository
	planningAgent   agent.Handler
	executionAgent  agent.Handler
	evaluationAgent agent.Handler
}

func New(cfg config.Config, repo *repository.Repository) *Orchestrator {
	return &Orchestrator{
		cfg:             cfg,
		repo:            repo,
		planningAgent:   agent.NewPlanningAgent(repo),
		executionAgent:  agent.NewExecutionAgent(repo),
		evaluationAgent: agent.NewEvaluationAgent(repo),
	}
}

func (o *Orchestrator) RunContinuous(ctx context.Context, companyID string, triggeredBy string) {
	ticker := time.NewTicker(o.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := o.RunCycle(ctx, companyID, triggeredBy); err != nil {
				log.Printf("orchestrator cycle error: %v", err)
			}
		}
	}
}

func (o *Orchestrator) RunCycle(ctx context.Context, companyID string, triggeredBy string) error {
	tasks, err := o.repo.AcquirePendingTasks(ctx, companyID, o.cfg.MaxTasksPerPoll)
	if err != nil {
		return err
	}
	if len(tasks) == 0 {
		return nil
	}

	workerCount := o.cfg.WorkerCount
	if workerCount > len(tasks) {
		workerCount = len(tasks)
	}

	taskCh := make(chan model.QueueTask)
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range taskCh {
				o.processTask(ctx, task, triggeredBy)
			}
		}()
	}

	for _, task := range tasks {
		select {
		case <-ctx.Done():
			close(taskCh)
			wg.Wait()
			return ctx.Err()
		case taskCh <- task:
		}
	}

	close(taskCh)
	wg.Wait()
	return nil
}

func (o *Orchestrator) processTask(ctx context.Context, task model.QueueTask, triggeredBy string) {
	start := time.Now()
	runID, err := o.repo.CreateRun(ctx, task, triggeredBy)
	if err != nil {
		log.Printf("create run failed for task %s: %v", task.ID, err)
		return
	}

	result, execErr := o.dispatchTask(ctx, task)
	durationMs := time.Since(start).Milliseconds()

	if execErr != nil {
		shouldRetry := task.Attempts < task.MaxAttempts
		if err := o.repo.FailTaskAndRun(ctx, task, runID, execErr.Error(), shouldRetry, durationMs); err != nil {
			log.Printf("fail task update failed for task %s: %v", task.ID, err)
		}
		if !shouldRetry {
			if err := o.repo.UpdateWorkflowStatus(ctx, task.WorkflowID, model.WorkflowFailed, execErr.Error()); err != nil {
				log.Printf("workflow fail update error for task %s: %v", task.ID, err)
			}
		}
		return
	}

	if result.Deferred {
		next := time.Now().UTC().Add(15 * time.Second)
		if result.NextSchedule != nil {
			next = *result.NextSchedule
		}
		if err := o.repo.DeferTask(ctx, task, runID, result.Output, next, durationMs); err != nil {
			log.Printf("defer task failed for task %s: %v", task.ID, err)
		}
		return
	}

	if err := o.repo.CompleteTaskAndRun(ctx, task, runID, result.Output, durationMs); err != nil {
		log.Printf("complete task failed for task %s: %v", task.ID, err)
	}
}

func (o *Orchestrator) dispatchTask(ctx context.Context, task model.QueueTask) (model.TaskExecutionResult, error) {
	normalized := normalizeAgentType(task.AgentType)
	switch normalized {
	case model.AgentPlanning:
		return o.planningAgent.Handle(ctx, task)
	case model.AgentExecution:
		return o.executionAgent.Handle(ctx, task)
	case model.AgentEvaluation:
		return o.evaluationAgent.Handle(ctx, task)
	default:
		return model.TaskExecutionResult{}, errors.New("unsupported agent type")
	}
}

func normalizeAgentType(agentType model.AgentType) model.AgentType {
	switch agentType {
	case "automation-agent", "scraping-agent", "analysis-agent", "notification-agent":
		return model.AgentExecution
	default:
		return agentType
	}
}

func (o *Orchestrator) StartWorkflow(ctx context.Context, companyID string, goal string, createdBy string, payload map[string]any) (string, error) {
	if companyID == "" {
		return "", fmt.Errorf("company_id is required")
	}
	if goal == "" {
		return "", fmt.Errorf("goal is required")
	}
	return o.repo.EnqueueWorkflow(ctx, companyID, goal, createdBy, payload)
}
