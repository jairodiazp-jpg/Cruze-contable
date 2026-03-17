package agent

import (
	"context"
	"time"

	"intelisupp/agents/go-runtime/internal/model"
	"intelisupp/agents/go-runtime/internal/repository"
)

type EvaluationAgent struct {
	repo *repository.Repository
}

func NewEvaluationAgent(repo *repository.Repository) *EvaluationAgent {
	return &EvaluationAgent{repo: repo}
}

func (a *EvaluationAgent) Handle(ctx context.Context, task model.QueueTask) (model.TaskExecutionResult, error) {
	planningTaskID := ""
	if value, ok := task.Payload["planning_task_id"].(string); ok {
		planningTaskID = value
	}
	if planningTaskID == "" && task.ParentTaskID != nil {
		planningTaskID = *task.ParentTaskID
	}
	if planningTaskID == "" {
		return model.TaskExecutionResult{
			Output: map[string]any{
				"summary": "Evaluation skipped: planning task not found",
			},
		}, nil
	}

	executionRows, err := a.repo.GetExecutionChildren(ctx, task, planningTaskID)
	if err != nil {
		return model.TaskExecutionResult{}, err
	}

	pendingCount := 0
	failedCount := 0
	completedCount := 0
	firstFailure := ""

	for _, row := range executionRows {
		switch row.Status {
		case string(model.TaskPending), string(model.TaskRunning):
			pendingCount++
		case string(model.TaskFailed):
			failedCount++
			if firstFailure == "" && row.LastError != nil {
				firstFailure = *row.LastError
			}
		case string(model.TaskCompleted):
			completedCount++
		}
	}

	if pendingCount > 0 {
		next := time.Now().UTC().Add(15 * time.Second)
		return model.TaskExecutionResult{
			Deferred:     true,
			NextSchedule: &next,
			Output: map[string]any{
				"summary":       "Evaluation deferred until all execution tasks finish",
				"pending_count": pendingCount,
			},
		}, nil
	}

	workflowStatus := model.WorkflowCompleted
	if failedCount > 0 {
		workflowStatus = model.WorkflowFailed
	}

	if err := a.repo.UpdateWorkflowStatus(ctx, task.WorkflowID, workflowStatus, firstFailure); err != nil {
		return model.TaskExecutionResult{}, err
	}

	if err := a.repo.InsertTaskMessage(ctx, task, task.ParentTaskID, "evaluation_finished", map[string]any{
		"workflow_status":    workflowStatus,
		"execution_total":    len(executionRows),
		"execution_completed": completedCount,
		"execution_failed":   failedCount,
	}); err != nil {
		return model.TaskExecutionResult{}, err
	}

	return model.TaskExecutionResult{
		Output: map[string]any{
			"summary":             "Evaluation finished",
			"workflow_status":      workflowStatus,
			"execution_total":      len(executionRows),
			"execution_completed":  completedCount,
			"execution_failed":     failedCount,
			"first_failure_message": firstFailure,
		},
	}, nil
}
