# GO RUST MIGRATION MAP

Fecha: 2026-03-14
Estrategia: incremental, compatible hacia atrás, sin interrupción de producción.

## 1) Principios

1. No romper contratos actuales de `agent-api` y tablas existentes en la primera etapa.
2. Introducir capas nuevas en paralelo y desactivar rutas legacy por feature flags.
3. Medir equivalencia funcional y seguridad antes de cada corte.

## 2) Módulos Actuales y Destino

| Módulo actual | Estado | Destino recomendado | Prioridad | Riesgo | Complejidad | Beneficio |
|---|---|---|---|---|---|---|
| Agente PowerShell loop (`agent.ps1`) | Productivo, inseguro en scripts libres | Go (`agent-core`) | Alta | Alto | Media | Estabilidad + control |
| Ejecución script libre (`script_content`) | Productivo, crítico | Go dispatcher + Rust validator | Crítica | Crítico | Alta | Mitiga RCE |
| Orquestador de workflows (`agent-orchestrator`) | Funcional | Mantener TS corto plazo, mover worker a Go | Media | Medio | Media | Rendimiento |
| Validación de políticas host/firewall | Parcial | Rust policy engine | Alta | Alto | Alta | Seguridad determinística |
| Verificación hash/firma paquetes | Ausente | Rust crypto/verification | Alta | Alto | Media | Cadena de confianza |
| API runtime Go (`agents/go-runtime`) | Base creada | Endurecer auth y contratos | Alta | Medio | Media | Escala y mantenibilidad |
| Recolección de diagnósticos | Funcional | Go collector | Media | Bajo | Baja | Rendimiento |
| Gestión de secretos licencia | Débil | Rust/Go secure secret module | Alta | Alto | Media | Cumplimiento y hardening |

## 3) Roadmap Incremental

## Etapa 1 (sin ruptura)

1. Introducir `automation_actions` (tipadas) y `action_executions`.
2. Habilitar dispatcher tipado en paralelo al modelo legacy.
3. Bloquear alta de scripts arbitrarios en UI para nuevos casos.

## Etapa 2 (coexistencia controlada)

1. Agente Go consume acciones tipadas firmadas.
2. Rust valida firma, expiración, nonce y allowlist.
3. Mantener PowerShell solo como adaptador temporal de acciones permitidas.

## Etapa 3 (hardening completo)

1. Desactivar `custom/powershell` remotos.
2. Obligar aprobación para acciones sensibles.
3. Encriptar secretos y claves de licencia.

## Etapa 4 (optimización y retiro legacy)

1. Retirar rutas de ejecución libre.
2. Consolidar métricas/auditoría sobre nuevo pipeline.
3. Migrar cargas de alto volumen de worker a Go.

## 4) Criterios de Corte por Etapa

1. Cobertura de acciones tipadas >= 95% de casos operativos.
2. Tasa de error no superior al baseline histórico.
3. Auditoría completa por acción (`who/what/when/tenant/ticket/device`).
4. No existencia de ejecución arbitraria remota en producción.
