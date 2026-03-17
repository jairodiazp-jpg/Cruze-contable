package agent

import (
	"context"

	"intelisupp/agents/go-runtime/internal/model"
)

type Handler interface {
	Handle(ctx context.Context, task model.QueueTask) (model.TaskExecutionResult, error)
}
