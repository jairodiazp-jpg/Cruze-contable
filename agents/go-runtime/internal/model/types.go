package model

import "time"

type AgentType string

const (
	AgentPlanning   AgentType = "planning-agent"
	AgentExecution  AgentType = "execution-agent"
	AgentEvaluation AgentType = "evaluation-agent"
)

type TaskStatus string

const (
	TaskPending   TaskStatus = "pending"
	TaskRunning   TaskStatus = "running"
	TaskCompleted TaskStatus = "completed"
	TaskFailed    TaskStatus = "failed"
)

type QueueTask struct {
	ID              string
	CompanyID       string
	WorkflowID      *string
	ParentTaskID    *string
	DependsOnTaskID *string
	AgentType       AgentType
	TaskType        string
	Payload         map[string]any
	Priority        int
	Attempts        int
	MaxAttempts     int
}

type TaskExecutionResult struct {
	Output        map[string]any
	Deferred      bool
	NextSchedule  *time.Time
	FailureReason string
}

type WorkflowStatus string

const (
	WorkflowPending   WorkflowStatus = "pending"
	WorkflowRunning   WorkflowStatus = "running"
	WorkflowCompleted WorkflowStatus = "completed"
	WorkflowFailed    WorkflowStatus = "failed"
)
