package agent

import (
	"context"
	"fmt"

	"intelisupp/agents/go-runtime/internal/model"
	"intelisupp/agents/go-runtime/internal/repository"
)

type PlanningAgent struct {
	repo *repository.Repository
}

func NewPlanningAgent(repo *repository.Repository) *PlanningAgent {
	return &PlanningAgent{repo: repo}
}

func (a *PlanningAgent) Handle(ctx context.Context, task model.QueueTask) (model.TaskExecutionResult, error) {
	goal, _ := task.Payload["goal"].(string)
	if goal == "" {
		goal = task.TaskType
	}

	objectives := extractObjectives(task, goal)
	executionTaskIDs, err := a.repo.EnqueueExecutionTasks(ctx, task, objectives)
	if err != nil {
		return model.TaskExecutionResult{}, err
	}
	evalTaskID, err := a.repo.EnqueueEvaluationTask(ctx, task, executionTaskIDs)
	if err != nil {
		return model.TaskExecutionResult{}, err
	}

	if err := a.repo.UpdateWorkflowStatus(ctx, task.WorkflowID, model.WorkflowRunning, ""); err != nil {
		return model.TaskExecutionResult{}, err
	}

	if err := a.repo.InsertTaskMessage(ctx, task, &evalTaskID, "plan_created", map[string]any{
		"planning_task_id":   task.ID,
		"planned_step_count": len(executionTaskIDs),
		"execution_task_ids": executionTaskIDs,
	}); err != nil {
		return model.TaskExecutionResult{}, err
	}

	return model.TaskExecutionResult{
		Output: map[string]any{
			"summary":            fmt.Sprintf("Planning completed with %d execution tasks", len(executionTaskIDs)),
			"execution_task_ids": executionTaskIDs,
			"evaluation_task_id": evalTaskID,
		},
	}, nil
}

func extractObjectives(task model.QueueTask, fallback string) []string {
	raw, ok := task.Payload["objectives"].([]any)
	if !ok {
		return []string{fallback}
	}
	result := make([]string, 0, len(raw))
	for _, item := range raw {
		value, ok := item.(string)
		if ok && value != "" {
			result = append(result, value)
		}
	}
	if len(result) == 0 {
		result = append(result, fallback)
	}
	if len(result) > 8 {
		result = result[:8]
	}
	return result
}
