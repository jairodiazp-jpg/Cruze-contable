# Go Autonomous Agent Runtime

Runtime de agentes autonomos en Go para orchestration, planning, execution y evaluation con auditoria en Postgres/Supabase.

## Arquitectura

- Agent Orchestrator: coordina workers concurrentes.
- Planning Agent: descompone un goal en multiples execution tasks.
- Execution Agents: ejecutan pasos en paralelo.
- Evaluation Agent: espera completion/failure de ejecucion y cierra workflow.
- Audit Trail: cada run se registra en agent_runs, system_logs y analytics.
- Inter-agent Messaging: usa agent_task_messages.

## Requisitos

- Go 1.22+
- Base de datos Postgres/Supabase con migraciones aplicadas

## Variables de entorno

Tomar como base [agents/go-runtime/.env.example](agents/go-runtime/.env.example).

Variables clave:

- DATABASE_URL
- AGENT_RUNTIME_ADDR
- WORKER_COUNT
- POLL_INTERVAL_SECONDS
- MAX_TASKS_PER_CYCLE
- DEFAULT_COMPANY_ID (opcional, para ciclo continuo)

## Ejecutar local

```bash
cd agents/go-runtime
go mod tidy
go run ./cmd/agent-runtime
```

## Endpoints

- GET /health
- POST /v1/workflows/start
- POST /v1/orchestrator/run

### Crear workflow

```json
{
  "company_id": "<uuid>",
  "goal": "Desplegar configuracion base",
  "created_by": "<uuid-opcional>",
  "payload": {
    "context": {
      "env": "prod"
    },
    "objectives": [
      "validar precondiciones",
      "ejecutar despliegue",
      "confirmar estado"
    ]
  }
}
```

### Ejecutar un ciclo de orquestacion

```json
{
  "company_id": "<uuid>",
  "triggered_by": "<uuid-opcional>"
}
```

## Notas

- El runtime no reemplaza automaticamente las edge functions actuales; convive con ellas.
- Para migracion completa, enrutar la ejecucion de workflows desde frontend/backend hacia este servicio.
