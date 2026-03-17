package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"intelisupp/agents/go-runtime/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) EnqueueWorkflow(ctx context.Context, companyID string, goal string, createdBy string, payload map[string]any) (string, error) {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}
	var workflowID string
	err = r.pool.QueryRow(ctx,
		"select public.enqueue_agent_workflow($1, $2, $3::jsonb, $4)",
		companyID,
		goal,
		string(payloadJSON),
		createdBy,
	).Scan(&workflowID)
	if err != nil {
		return "", fmt.Errorf("enqueue workflow: %w", err)
	}
	return workflowID, nil
}

func (r *Repository) AcquirePendingTasks(ctx context.Context, companyID string, limit int) ([]model.QueueTask, error) {
	if limit < 1 {
		limit = 1
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		with cte as (
			select id
			from public.agent_tasks_queue
			where company_id = $1
			  and status = 'pending'
			  and scheduled_for <= now()
			order by priority asc, created_at asc
			limit $2
			for update skip locked
		)
		update public.agent_tasks_queue q
		set status = 'running', started_at = now(), attempts = q.attempts + 1, updated_at = now()
		from cte
		where q.id = cte.id
		returning q.id, q.company_id, q.workflow_id, q.parent_task_id, q.depends_on_task_id,
		          q.agent_type, q.task_type, q.payload, q.priority, q.attempts, q.max_attempts
	`, companyID, limit)
	if err != nil {
		return nil, fmt.Errorf("acquire tasks query: %w", err)
	}
	defer rows.Close()

	result := make([]model.QueueTask, 0)
	for rows.Next() {
		var task model.QueueTask
		var payloadBytes []byte
		if err := rows.Scan(
			&task.ID,
			&task.CompanyID,
			&task.WorkflowID,
			&task.ParentTaskID,
			&task.DependsOnTaskID,
			&task.AgentType,
			&task.TaskType,
			&payloadBytes,
			&task.Priority,
			&task.Attempts,
			&task.MaxAttempts,
		); err != nil {
			return nil, fmt.Errorf("scan task: %w", err)
		}
		if len(payloadBytes) > 0 {
			if err := json.Unmarshal(payloadBytes, &task.Payload); err != nil {
				return nil, fmt.Errorf("unmarshal payload: %w", err)
			}
		} else {
			task.Payload = map[string]any{}
		}
		result = append(result, task)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit acquire tx: %w", err)
	}
	return result, nil
}

func (r *Repository) CreateRun(ctx context.Context, task model.QueueTask, triggeredBy string) (string, error) {
	payloadJSON, _ := json.Marshal(task.Payload)
	var runID string
	err := r.pool.QueryRow(ctx, `
		insert into public.agent_runs (company_id, task_id, agent_type, run_status, triggered_by, input_payload)
		values ($1, $2, $3, 'running', $4, $5::jsonb)
		returning id
	`, task.CompanyID, task.ID, string(task.AgentType), triggeredBy, string(payloadJSON)).Scan(&runID)
	if err != nil {
		return "", fmt.Errorf("create run: %w", err)
	}
	return runID, nil
}

func (r *Repository) CompleteTaskAndRun(ctx context.Context, task model.QueueTask, runID string, output map[string]any, durationMs int64) error {
	outputJSON, _ := json.Marshal(output)
	batch := &pgx.Batch{}
	batch.Queue(`
		update public.agent_runs
		set run_status='completed', output_payload=$2::jsonb, completed_at=now(), duration_ms=$3
		where id=$1
	`, runID, string(outputJSON), durationMs)
	batch.Queue(`
		update public.agent_tasks_queue
		set status='completed', completed_at=now(), result_payload=$2::jsonb, updated_at=now()
		where id=$1
	`, task.ID, string(outputJSON))
	batch.Queue(`
		insert into public.system_logs (company_id, action, category, severity, message, details)
		values ($1, 'agent_task_completed', 'agents', 'info', $2, $3::jsonb)
	`, task.CompanyID, fmt.Sprintf("%s completed %s", task.AgentType, task.TaskType), fmt.Sprintf(`{"task_id":"%s","run_id":"%s","duration_ms":%d}`, task.ID, runID, durationMs))
	batch.Queue(`
		insert into public.analytics (company_id, metric_name, metric_value, dimensions)
		values ($1, 'agent_task_completed', 1, $2::jsonb)
	`, task.CompanyID, fmt.Sprintf(`{"agent_type":"%s","task_type":"%s","workflow_id":%q}`, task.AgentType, task.TaskType, nullable(task.WorkflowID)))

	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()
	for i := 0; i < 4; i++ {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("complete batch step %d: %w", i, err)
		}
	}
	return nil
}

func (r *Repository) DeferTask(ctx context.Context, task model.QueueTask, runID string, output map[string]any, next time.Time, durationMs int64) error {
	outputJSON, _ := json.Marshal(output)
	batch := &pgx.Batch{}
	batch.Queue(`
		update public.agent_runs
		set run_status='completed', output_payload=$2::jsonb, completed_at=now(), duration_ms=$3
		where id=$1
	`, runID, string(outputJSON), durationMs)
	batch.Queue(`
		update public.agent_tasks_queue
		set status='pending', started_at=null, completed_at=null, result_payload=$2::jsonb, scheduled_for=$3, updated_at=now()
		where id=$1
	`, task.ID, string(outputJSON), next)
	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()
	for i := 0; i < 2; i++ {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("defer batch step %d: %w", i, err)
		}
	}
	return nil
}

func (r *Repository) FailTaskAndRun(ctx context.Context, task model.QueueTask, runID string, errMsg string, shouldRetry bool, durationMs int64) error {
	status := "failed"
	if shouldRetry {
		status = "pending"
	}
	batch := &pgx.Batch{}
	batch.Queue(`
		update public.agent_runs
		set run_status='failed', error_message=$2, completed_at=now(), duration_ms=$3
		where id=$1
	`, runID, errMsg, durationMs)
	batch.Queue(`
		update public.agent_tasks_queue
		set status=$2, started_at=null, completed_at=case when $2='failed' then now() else null end,
		    last_error=$3, updated_at=now()
		where id=$1
	`, task.ID, status, errMsg)
	batch.Queue(`
		insert into public.system_logs (company_id, action, category, severity, message, details)
		values ($1, 'agent_task_failed', 'agents', 'error', $2, $3::jsonb)
	`, task.CompanyID, fmt.Sprintf("%s failed %s", task.AgentType, task.TaskType), fmt.Sprintf(`{"task_id":"%s","run_id":"%s","error":%q}`, task.ID, runID, errMsg))
	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()
	for i := 0; i < 3; i++ {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("fail batch step %d: %w", i, err)
		}
	}
	return nil
}

func (r *Repository) UpdateWorkflowStatus(ctx context.Context, workflowID *string, status model.WorkflowStatus, errMsg string) error {
	if workflowID == nil || *workflowID == "" {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		update public.agent_workflows
		set status=$2,
		    started_at=case when $2='running' then now() else started_at end,
		    completed_at=case when $2 in ('completed','failed') then now() else completed_at end,
		    last_error=case when $3='' then null else $3 end,
		    updated_at=now()
		where id=$1
	`, *workflowID, string(status), errMsg)
	if err != nil {
		return fmt.Errorf("update workflow status: %w", err)
	}
	return nil
}

func (r *Repository) InsertTaskMessage(ctx context.Context, task model.QueueTask, toTaskID *string, messageType string, payload map[string]any) error {
	if task.WorkflowID == nil || *task.WorkflowID == "" {
		return nil
	}
	payloadJSON, _ := json.Marshal(payload)
	_, err := r.pool.Exec(ctx, `
		insert into public.agent_task_messages (company_id, workflow_id, from_task_id, to_task_id, message_type, payload)
		values ($1, $2, $3, $4, $5, $6::jsonb)
	`, task.CompanyID, *task.WorkflowID, task.ID, nullablePtr(toTaskID), messageType, string(payloadJSON))
	if err != nil {
		return fmt.Errorf("insert task message: %w", err)
	}
	return nil
}

func (r *Repository) EnqueueExecutionTasks(ctx context.Context, task model.QueueTask, objectives []string) ([]string, error) {
	ids := make([]string, 0, len(objectives))
	for idx, objective := range objectives {
		payloadJSON, _ := json.Marshal(map[string]any{
			"objective":        objective,
			"step_index":       idx + 1,
			"planning_task_id": task.ID,
			"shared_context":   task.Payload["context"],
		})
		var id string
		err := r.pool.QueryRow(ctx, `
			insert into public.agent_tasks_queue (
				company_id, workflow_id, parent_task_id, agent_type, task_type, payload,
				priority, status, max_attempts, scheduled_for, updated_at
			)
			values ($1,$2,$3,'execution-agent',$4,$5::jsonb,$6,'pending',$7,now(),now())
			returning id
		`, task.CompanyID, nullable(task.WorkflowID), task.ID, fmt.Sprintf("execute_step_%d", idx+1), string(payloadJSON), task.Priority+idx, task.MaxAttempts).Scan(&id)
		if err != nil {
			return nil, fmt.Errorf("enqueue execution task %d: %w", idx, err)
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (r *Repository) EnqueueEvaluationTask(ctx context.Context, task model.QueueTask, executionTaskIDs []string) (string, error) {
	payloadJSON, _ := json.Marshal(map[string]any{
		"planning_task_id":           task.ID,
		"expected_execution_task_ids": executionTaskIDs,
	})
	var id string
	err := r.pool.QueryRow(ctx, `
		insert into public.agent_tasks_queue (
			company_id, workflow_id, parent_task_id, agent_type, task_type, payload,
			priority, status, max_attempts, scheduled_for, updated_at
		)
		values ($1,$2,$3,'evaluation-agent','evaluate_workflow',$4::jsonb,$5,'pending',$6,now(),now())
		returning id
	`, task.CompanyID, nullable(task.WorkflowID), task.ID, string(payloadJSON), task.Priority+100, task.MaxAttempts).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("enqueue evaluation task: %w", err)
	}
	return id, nil
}

func (r *Repository) GetExecutionChildren(ctx context.Context, task model.QueueTask, planningTaskID string) ([]struct {
	ID       string
	Status   string
	LastError *string
}, error) {
	rows, err := r.pool.Query(ctx, `
		select id, status, last_error
		from public.agent_tasks_queue
		where company_id=$1 and workflow_id=$2 and parent_task_id=$3 and agent_type in ('execution-agent','automation-agent','scraping-agent','analysis-agent','notification-agent')
	`, task.CompanyID, nullable(task.WorkflowID), planningTaskID)
	if err != nil {
		return nil, fmt.Errorf("query execution children: %w", err)
	}
	defer rows.Close()

	result := make([]struct {
		ID        string
		Status    string
		LastError *string
	}, 0)
	for rows.Next() {
		item := struct {
			ID        string
			Status    string
			LastError *string
		}{}
		if err := rows.Scan(&item.ID, &item.Status, &item.LastError); err != nil {
			return nil, fmt.Errorf("scan execution child: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("execution children rows: %w", err)
	}
	return result, nil
}

func nullable(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullablePtr(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	return *value
}
