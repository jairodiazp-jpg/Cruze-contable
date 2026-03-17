package agent

import (
	"context"
	"fmt"
	"time"

	"intelisupp/agents/go-runtime/internal/model"
	"intelisupp/agents/go-runtime/internal/repository"
)

type ExecutionAgent struct {
	repo *repository.Repository
}

func NewExecutionAgent(repo *repository.Repository) *ExecutionAgent {
	return &ExecutionAgent{repo: repo}
}

func (a *ExecutionAgent) Handle(ctx context.Context, task model.QueueTask) (model.TaskExecutionResult, error) {
	objective, _ := task.Payload["objective"].(string)
	if objective == "" {
		objective = task.TaskType
	}

	result := map[string]any{
		"outcome":             "success",
		"objective":           objective,
		"finished_at":         time.Now().UTC().Format(time.RFC3339),
		"generated_artifacts": []string{fmt.Sprintf("artifact_%s", task.ID[:8])},
	}

	if err := a.repo.InsertTaskMessage(ctx, task, nil, "execution_finished", map[string]any{
		"execution_task_id": task.ID,
		"parent_task_id":    task.ParentTaskID,
		"result":            result,
	}); err != nil {
		return model.TaskExecutionResult{}, err
	}

	return model.TaskExecutionResult{
		Output: map[string]any{
			"summary": fmt.Sprintf("Execution completed for %s", objective),
			"result":  result,
		},
	}, nil
}
