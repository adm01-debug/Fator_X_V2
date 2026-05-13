# Data Dictionary (Core Tables)

## `agents`
Primary table for agent definitions.
- `id`: UUID (Primary Key)
- `name`: TEXT
- `mission`: TEXT
- `config`: JSONB (Model parameters, tool config)
- `version`: INT (Auto-incrementing on save)

## `audit_log_v2`
Partitioned audit trail for all destructive or sensitive actions.
- `user_id`: UUID
- `action`: TEXT (create, delete, update, etc.)
- `resource_type`: TEXT
- `created_at`: TIMESTAMPTZ (Partition Key)

## `trace_events_v2`
Partitioned execution traces for monitoring and observability.
- `trace_id`: TEXT
- `event_type`: TEXT
- `data`: JSONB
- `duration_ms`: INT
