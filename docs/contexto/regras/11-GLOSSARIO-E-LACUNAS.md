# 11 · GLOSSÁRIO, DADOS DE REFERÊNCIA E LACUNAS

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `26d3bba4e5` · branch `main` · 2026-11-27 02:57 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## Glossário do domínio (entidades do sistema)

| Termo | Significado / valores | Tamanho | Origem |
|---|---|---|---|
| `access_blocked_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `account_lockouts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `agent_daily_metrics` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | types.ts |
| `agent_eval_datasets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `agent_eval_results` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `agent_eval_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `agent_experiment_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `agent_experiments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `agent_graphs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `agent_installed_skills` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `agent_memories` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `agent_memories_v2` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `agent_permissions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `agent_routing_config` | Maps external event sources (bitrix24, slack, gmail, ...) and event types to agents that should handle them. | 9 colunas | migration |
| `agent_skills` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `agent_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `agent_traces` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `agent_traces_v2` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `agent_traces_v2_2026_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_08` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_09` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_10` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_11` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2026_12` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_01` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_02` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_03` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_traces_v2_2027_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `agent_usage` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `agent_versions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `agent_workflow_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `agent_workflows` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `agents` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `alert_rules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `api_keys` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `asset_audits` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `assets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 28 colunas | migration |
| `audit_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `audit_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `audit_log_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | types.ts |
| `audit_log_v2` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `audit_log_v2_2026_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | types.ts |
| `audit_log_v2_2026_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_08` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_09` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_10` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_11` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2026_12` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_01` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_02` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_03` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `audit_log_v2_2027_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `auth_attempts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `automation_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `automation_rules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `automation_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 23 colunas | migration |
| `batch_jobs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 27 colunas | migration |
| `bcp_test_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `bitrix24_webhook_events` | Append-only audit log of every Bitrix24 webhook received, with HMAC validation result and routing outcome. | 13 colunas | migration |
| `browser_sessions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `budget_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `budgets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `business_systems` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `change_approvals` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `change_requests` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `chaos_experiments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `chat_messages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `chat_threads` | Conversas do AgentTalk. Um agente pode ter N threads por usuário. | 10 colunas | migration |
| `chunks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `citation_telemetry` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `code_executions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `collections` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `compliance_controls` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `compliance_evidence` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `compliance_frameworks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `compliance_reports` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `connector_instances` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `connector_registry` | _(sem COMMENT ON TABLE — significado não documentado)_ | 22 colunas | migration |
| `consent_records` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `cost_alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `cost_baselines` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `creator_payouts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `credential_audit_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `credential_vault` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `crm_activities` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `crm_cadence_enrollments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `crm_cadence_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `crm_cadence_steps` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `crm_cadences` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `crm_companies` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `crm_contacts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `crm_deals` | _(sem COMMENT ON TABLE — significado não documentado)_ | 23 colunas | migration |
| `crm_icp_profiles` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `crm_pipelines` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `crm_stages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `cron_schedule_executions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `cron_schedules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 21 colunas | migration |
| `data_breach_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 21 colunas | migration |
| `data_deletion_requests` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `data_processing_register` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `data_retention_policies` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `data_subject_requests` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `dead_letter_queue` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `deploy_connections` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `document_ingestion_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `document_ingestions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `documents` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `dr_drills` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `dr_restore_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `dr_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `entity_resolution_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `environments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `eval_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `evaluation_datasets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `evaluation_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `execution_history` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `finetune_jobs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `forensic_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `forum_posts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `forum_posts_public` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `forum_posts_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | types.ts |
| `forum_threads` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `forum_threads_public` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `forum_threads_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | types.ts |
| `freeze_windows` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `game_day_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `game_day_scorecards` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `game_days` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `geo_allowed_countries` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `graph_executions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `guardrail_policies` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `help_centers` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `hf_config` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `idempotency_keys` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `incident_playbooks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `incident_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `installed_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `internal.cron_tokens` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `internal.db_health_samples` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `internal.detector_slo_state` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `internal.index_usage_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `internal.partitioned_families` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `internal.query_perf_baseline` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `internal.query_perf_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `internal.query_stats_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `internal.rollback_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `internal.table_activity_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `internal.wal_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `ip_rate_limits` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `ip_whitelist` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `ir_playbook_steps` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `ir_playbooks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `ir_tabletop_exercises` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `kb_article_versions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `kb_articles` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `kb_query_gaps` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `kb_translations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `knowledge_bases` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `knowledge_entities` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `knowledge_graph_health` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | types.ts |
| `knowledge_links` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `knowledge_relations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `lgpd_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 22 colunas | migration |
| `llm_cost_by_caller` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | types.ts |
| `managed_secrets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `mcp_servers` | _(sem COMMENT ON TABLE — significado não documentado)_ | 29 colunas | migration |
| `mcp_tools` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `model_pricing` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `notebook_canvases` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `notebook_note_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `notebook_note_versions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `notebook_notes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `notebook_podcasts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `notification_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `notifications` | _(sem COMMENT ON TABLE — significado não documentado)_ | 24 colunas | migration |
| `oncall_schedule` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `oncall_schedule_emails` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `oncall_schedule_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | types.ts |
| `openclaw_agent_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `openclaw_deployments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `openclaw_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `openclaw_whatsapp_instances` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `openclaw_whatsapp_messages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `oracle_history` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `pentest_engagements` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `pentest_findings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 21 colunas | migration |
| `permissions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `personal_data_inventory` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `pg_net_smoke_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `postmortem_action_items` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `postmortems` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `prompt_ab_tests` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `prompt_experiment_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `prompt_experiments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 19 colunas | migration |
| `prompt_versions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `queue_items` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `rate_limit_entries` | Armazena timestamps de requests para rate limiting distribuído | 4 colunas | migration |
| `rate_limit_logs` | Rate limit events for abuse detection. Auto-cleanup recommended after 30 days. | 11 colunas | migration |
| `replay_forks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `restore_field_presets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `retention_job_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `risk_register` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `risk_review_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `role_permissions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `roles` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `sbom_components` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `sbom_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `secret_rotation_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `security_alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `security_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `session_traces` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `sessions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `skill_harvest_candidates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 31 colunas | migration |
| `skill_harvest_checkpoints` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `skill_harvest_runs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `skill_marketplace_meta` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `skill_purchases` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `skill_reclassification_reviews` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `skill_registry` | _(sem COMMENT ON TABLE — significado não documentado)_ | 32 colunas | migration |
| `skill_registry_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | types.ts |
| `skill_reviews` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `slack_agent_notifications` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `slack_bot_bindings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `slack_channel_routes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `slack_dispatch_dlq` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `slack_dispatch_health` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | types.ts |
| `slack_dlq_stats` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | types.ts |
| `slack_event_dedupe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `slack_rag_sources` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `slack_user_cache` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `slack_workspace_config` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `spans` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `spans_2026_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_08` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_09` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_10` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_11` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2026_12` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_01` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_02` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_03` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `spans_2027_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | types.ts |
| `synthetic_checks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `synthetic_results` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `task_queues` | _(sem COMMENT ON TABLE — significado não documentado)_ | 18 colunas | migration |
| `template_skill_links` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `test_cases` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `tool_integrations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `tool_policies` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `trace_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `trace_events_v2` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `trace_events_v2_2026_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_08` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_09` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_10` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_11` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2026_12` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_01` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_02` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_03` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `trace_events_v2_2027_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `traces` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `traces_2026_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_06` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_07` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_08` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_09` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_10` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_11` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2026_12` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2027_01` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2027_02` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2027_03` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2027_04` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `traces_2027_05` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| … +308 linhas — lista completa em `context.json` | | | |

## Dados de referência (seed — planos, categorias, perfis fixos)

_nenhum item encontrado_

## Auditoria de consistência (código × schema) — trate como NÃO VERIFICADO

> `status`: inclui estados só de UI/realtime (ex.: `uploading`, `SUBSCRIBED`) que nunca vão ao banco — confira o arquivo antes de concluir que falta valor no enum.

| Tipo | Problema | Onde |
|---|---|---|
| status | valor `passed` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/agent-builder/modules/TestingModule.tsx`<br>`compara:src/pages/ComplianceReportsPage.tsx` |
| status | valor `only-a` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/agents/traces/CompareTracesSheet.tsx`<br>`escreve:src/components/agents/traces/CompareTracesSheet.tsx` |
| status | valor `only-b` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/agents/traces/CompareTracesSheet.tsx` |
| status | valor `kept` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/agents/versioning/GuardrailsDiffPanel.tsx`<br>`compara:src/components/agents/versioning/VersionComparePanel.tsx` |
| status | valor `syncing` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/datahub/DataHubSyncTab.tsx`<br>`escreve:src/components/agents/wizard/WizardStepComponents.tsx` |
| status | valor `others` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx`<br>`escreve:src/components/agents/wizard/quickSteps/PromptSectionUsage.tsx` |
| status | valor `processed` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/automation/WebhookManagerPanel.tsx`<br>`escreve:supabase/functions/webhook-receiver/index.ts` |
| status | valor `SUBSCRIBED` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/billing/RealTimeCostStream.tsx` |
| status | valor `hibernated` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/datahub/ConnectionCard.tsx`<br>`compara:src/pages/DataHubPage.tsx`<br>`escreve:src/components/datahub/ConnectionCard.tsx` |
| status | valor `Passou` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/deployments/DeploymentWizard.tsx` |
| status | valor `Ok` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/deployments/DeploymentWizard.tsx` |
| status | valor `err` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/integrations/Bitrix24ApiTester.tsx` |
| status | valor `compliant` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/security/ComplianceFrameworks.tsx` |
| status | valor `CHANNEL_ERROR` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/shared/IncidentRunsMounter.tsx`<br>`compara:src/hooks/useCurationRealtime.ts` |
| status | valor `fulfilled` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/skills/SkillClassificationEfficacyCard.tsx`<br>`compara:src/hooks/useAutomation.ts`<br>`compara:supabase/functions/doc-parse/index.ts`<br>`compara:supabase/functions/oracle-council/index.ts` |
| status | valor `noop` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/super-cerebro/DocumentChunkingDialog.tsx`<br>`escreve:supabase/functions/doc-rechunk/index.ts` |
| status | valor `string` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/skills/observability.ts` |
| status | valor `erro` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/skills/observability.ts` |
| status | valor `vazio` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/lib/skills/promptEvidenceLedger.ts` |
| status | valor `breakpoint` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/AgentDebuggerPage.tsx`<br>`escreve:src/pages/AgentDebuggerPage.tsx` |
| status | valor `current` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/AgentDebuggerPage.tsx`<br>`escreve:src/pages/AgentDebuggerPage.tsx` |
| status | valor `stable` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/CanaryDeploymentsPage.tsx`<br>`escreve:src/pages/CanaryDeploymentsPage.tsx` |
| status | valor `canary` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/CanaryDeploymentsPage.tsx`<br>`escreve:src/pages/CanaryDeploymentsPage.tsx` |
| status | valor `Nominal` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/SettingsPage.tsx`<br>`escreve:src/pages/DashboardPage.tsx`<br>`escreve:src/pages/SettingsPage.tsx` |
| status | valor `Online` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DashboardPage.tsx` |
| status | valor `Optimized` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DashboardPage.tsx` |
| status | valor `planned` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DataStoragePage.tsx` |
| status | valor `P95` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DeploymentsPage.tsx` |
| status | valor `Throughput` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DeploymentsPage.tsx` |
| status | valor `FinOps` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DeploymentsPage.tsx` |
| status | valor `Incidents` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/DeploymentsPage.tsx` |
| status | valor `Active` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/ObservabilityOTelPage.tsx`<br>`escreve:src/pages/ObservabilityOTelPage.tsx` |
| status | valor `Paused` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/ObservabilityOTelPage.tsx` |
| status | valor `Inactive` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/ObservabilityOTelPage.tsx` |
| status | valor `Aviso` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/pages/SettingsPage.tsx` |
| status | valor `awaiting_approval` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/workflow-engine-v2/index.ts`<br>`filtra:src/services/approvalService.ts` |
| status | valor `no_budget` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/services/billingService.ts` |
| status | valor `misconfigured` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/services/openclawDeployService.ts` |
| status | valor `number` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/services/skillEnrichmentService.ts`<br>`compara:src/services/skillReclassificationService.ts` |
| status | valor `todos` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/services/skillReclassificationReviewService.ts` |
| status | valor `submitted` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/a2a-server/index.ts` |
| status | valor `sql_generated` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/datahub-query/index.ts` |
| status | valor `OK` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/geo-code/geo.ts` |
| status | valor `repo_created` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/hf-autotrain/index.ts` |
| status | valor `granted` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/lgpd-manager/index.ts` |
| status | valor `thinking` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/smolagent-runtime/index.ts` |
| status | valor `acting` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/smolagent-runtime/index.ts` |
| status | valor `shipped` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/test-runner/versioning_contract_test.ts` |
| status | valor `new` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/test-runner/versioning_contract_test.ts` |
| status | valor `routing` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/whatsapp-router/index.ts` |
| status | valor `sending` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/whatsapp-router/index.ts` |
| status | valor `answered` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/whatsapp-router/index.ts` |
| status | valor `collapsed` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/layout/AppSidebar.tsx`<br>`compara:src/components/ui/sidebar.tsx` |
| status | valor `expanded` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/ui/sidebar.tsx` |
| status | valor `recording` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/VoiceAgentsPage.tsx` |
| status | valor `listening` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/pages/VoiceAgentsPage.tsx` |
| status | valor `half-open` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/_shared/circuitBreaker.ts` |
| status | valor `background_removal` para `step` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/product-mockup/index.ts` |
| status | valor `background_generation` para `step` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/product-mockup/index.ts` |
| status | valor `Parsing` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/knowledge/IngestionLogsPanel.tsx` |
| status | valor `Chunking` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/knowledge/IngestionLogsPanel.tsx` |
| status | valor `Metadata` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/knowledge/IngestionLogsPanel.tsx` |
| status | valor `Embeddings` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/knowledge/IngestionLogsPanel.tsx` |
| status | valor `Indexing` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/knowledge/IngestionLogsPanel.tsx` |
| status | valor `NEW` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/services/automationTemplateService.ts` |
| status | valor `WON` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:src/services/automationTemplateService.ts` |
| status | valor `start` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/agent-workflow-runner/index.ts`<br>`escreve:supabase/functions/rag-ingest/index.ts` |
| status | valor `init` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/computer-use-execute/index.ts` |
| status | valor `browser` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/computer-use-execute/index.ts` |
| status | valor `db_insert` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/rag-ingest/index.ts` |
| status | valor `complete` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/rag-ingest/index.ts` |
| status | valor `dispatch` para `phase` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/pg-net-smoke-test/index.ts` |
| coluna | coluna `event_type` usada no código não existe no schema de `agent_traces` |  |
| coluna | coluna `knowledge_base_id` usada no código não existe no schema de `documents` |  |
| coluna | coluna `summary` usada no código não existe no schema de `document_ingestions` |  |
| coluna | coluna `title` usada no código não existe no schema de `document_ingestions` |  |
| coluna | coluna `knowledge_base_id` usada no código não existe no schema de `chunks` |  |
| coluna | coluna `user_id` usada no código não existe no schema de `agent_eval_runs` |  |
| coluna | coluna `avg_latency_ms` usada no código não existe no schema de `model_pricing` |  |
| coluna | coluna `context_window` usada no código não existe no schema de `model_pricing` |  |
| coluna | coluna `label` usada no código não existe no schema de `model_pricing` |  |
| tabela | tabela `a` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `contacts` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs`<br>`scripts/ci/gerar-matriz-edge-tabela.unit.mjs` |
| tabela | tabela `contatos` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-banco.unit.mjs` |
| tabela | tabela `dashboard_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `emails` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `fantasma` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `fixture_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `ghost_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `ignorada` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.unit.mjs` |
| tabela | tabela `outra` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-banco.unit.mjs` |
| tabela | tabela `payments` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `profiles` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.unit.mjs` |
| tabela | tabela `runtime_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `shared_nao_conta` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.unit.mjs` |
| tabela | tabela `so_teste` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `t` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `t1` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `tabela` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.mjs`<br>`scripts/inventario/gerar-banco.mjs`<br>`scripts/inventario/gerar-repo.mjs`<br>`src/test/schema-contract.test.ts` |
| tabela | tabela `tools_runtime` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `tx` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| rls | `agent_daily_metrics`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/agentDailyMetricsService.ts` |
| rls | `agent_usage`: acessada do front (4 arquivo(s)) sem RLS (não encontrado) | `src/services/agentsService.ts`<br>`src/services/billingService.ts`<br>`src/services/dashboardService.ts`<br>`src/services/skillbookAuditService.ts` |
| rls | `agents`: acessada do front (26 arquivo(s)) sem RLS (não encontrado) | `src/components/agent-builder/HandoffPanel.tsx`<br>`src/components/agents/VersionDiffDialog.tsx`<br>`src/components/agents/wizard/QuickCreateWizard.tsx`<br>`src/components/billing/CostOptimizationPanel.tsx` |
| rls | `compliance_controls`: front faz INSERT mas nenhuma política RLS permite INSERT → vai falhar/retornar vazio para usuários | `src/pages/ComplianceFrameworksPage.tsx` |
| rls | `compliance_controls`: front faz DELETE mas nenhuma política RLS permite DELETE → vai falhar/retornar vazio para usuários | `src/pages/ComplianceFrameworksPage.tsx` |
| rls | `compliance_frameworks`: front faz INSERT mas nenhuma política RLS permite INSERT → vai falhar/retornar vazio para usuários | `src/pages/ComplianceFrameworksPage.tsx` |
| rls | `forum_posts_safe`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/knowledgeManagementService.ts` |
| rls | `forum_threads_safe`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/knowledgeManagementService.ts` |
| rls | `oncall_schedule_safe`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/incidentService.ts` |
| rls | `prompt_versions`: acessada do front (3 arquivo(s)) sem RLS (não encontrado) | `src/services/knowledgeService.ts`<br>`src/services/promptVersionService.ts`<br>`src/stores/agentBuilderStore.ts` |
| rls | `usage_records_cost_safe`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/billingService.ts` |
| rls | `workspace_members_safe`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/services/teamsService.ts` |
| edge | edge function `dashboard-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `fixture-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `ghost-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `inexistente` invocada mas não existe em supabase/functions/ | `scripts/ai-context/cenarios.mjs` |
| edge | edge function `orphan-fn` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `other` invocada mas não existe em supabase/functions/ | `scripts/ai-context/cenarios.mjs` |
| edge | edge function `runtime-fn` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `runtime-missing` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `send-email` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `tools-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `dashboard_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `demo` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/test_snapshot.py` |
| rpc | RPC `exec_sql` chamada mas não definida nas migrations/types | `supabase/functions/datahub-query/index.ts` |
| rpc | RPC `fixture_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `fn` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/snapshot.py` |
| rpc | RPC `ghost_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `is_admin` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `nome` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/snapshot.py`<br>`src/test/schema-contract.test.ts` |
| rpc | RPC `r1` chamada mas não definida nas migrations/types | `scripts/ai-context/cenarios.mjs` |
| rpc | RPC `runtime_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `tools_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/inventario/gerar-banco.mjs` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/regras_negocio/generate.py` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/use-paginated-query.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/lib/signedUrlCache.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/lib/supabaseExtended.ts` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/services/adminCrudService.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/test/crm-scoring-service.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/test/crm-service.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/test/fine-tuning-jobs.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/test/hf-config.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/test/lgpd-governance.test.ts` |
| dinâmico | 4 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/_shared/crmNormalize.ts` |
| dinâmico | 4 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/datahub-mcp-server/index.ts` |
| dinâmico | 17 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/datahub-query/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/dr-orchestrator/index.ts` |
| segurança | função `is_user_locked_out` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260513175210_4dba7ebe-924a-4906-af1c-31e94145799f.sql` |
| segurança | função `update_budget_on_usage` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20261126230000_recuperar_funcoes_e_triggers.sql` |
| segurança | função `check_budget_alert` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20261126230000_recuperar_funcoes_e_triggers.sql` |
| segurança | função `audit_trigger_fn` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260420000002_fix_audit_trigger_fn_v2.sql` |
| segurança | função `user_has_permission` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260405000002_rbac_system.sql` |
| segurança | função `auto_assign_admin_role` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260405000002_rbac_system.sql` |
| segurança | função `increment_skill_installs` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20261126230000_recuperar_funcoes_e_triggers.sql` |
| segurança | função `create_partition_if_not_exists` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20261126230000_recuperar_funcoes_e_triggers.sql` |
| segurança | função `is_mfa_valid_for_role` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20261126230000_recuperar_funcoes_e_triggers.sql` |
| webhook | edge function `skill-harvester` processa eventos de webhook sem sinal de idempotência (evento duplicado = efeito duplicado) | `supabase/functions/skill-harvester/index.ts` |

## Lacunas — o que este contexto NÃO consegue responder (perguntas para o dono do negócio)

- Nenhuma regra manual em `manual/`: prazos, limites, exceções comerciais, quem aprova o quê — só o negócio sabe.
- `agents.status` tem valores ['draft', 'configured', 'testing', 'staging', 'review', 'production', 'monitoring', 'deprecated', 'archived'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `notifications.status` tem valores ['failed', 'pending', 'sent'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `chunks.embedding_status` tem valores ['done', 'failed', 'pending', 'processing'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `vector_indexes.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `knowledge_bases.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `evaluation_runs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `documents.status` tem valores ['failed', 'indexed', 'pending', 'processing'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `workflows.status` tem valores ['active', 'archived', 'draft'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `workflow_steps.step_order` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `sessions.status` tem valores ['active', 'ended', 'error'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `workflow_runs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `workflow_runs.current_step` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `workflow_step_runs.step_order` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `workflow_step_runs.status` tem valores ['completed', 'failed', 'pending', 'running', 'skipped'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `deploy_connections.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `prompt_ab_tests.status` tem valores ['cancelled', 'completed', 'draft', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `data_deletion_requests.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `finetune_jobs.status` tem valores ['cancelled', 'completed', 'failed', 'preparing', 'training', 'uploading'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `mcp_servers.status` tem valores ['connected', 'disconnected', 'error'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `workflow_executions.status` tem valores ['cancelled', 'completed', 'failed', 'paused', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `workflow_checkpoints.step_index` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `workflow_checkpoints.state` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `workflow_checkpoints.status` tem valores ['completed', 'failed', 'pending', 'running', 'skipped'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `workflow_handoffs.status` tem valores ['completed', 'failed', 'pending', 'rejected'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `cron_schedules.status` tem valores ['active', 'completed', 'failed', 'paused'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `cron_schedule_executions.status` tem valores ['failed', 'skipped', 'success'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `webhook_endpoints.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `webhook_events.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `dead_letter_queue.status` tem valores ['discarded', 'pending', 'resolved', 'retried'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `credential_vault.status` tem valores ['active', 'expired', 'revoked', 'rotating'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `installed_templates.status` tem valores ['configured', 'error', 'installed', 'paused', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `execution_history.status` tem valores ['cancelled', 'failed', 'running', 'success', 'timeout', 'waiting'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `connector_registry.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `connector_instances.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `queue_items.status` tem valores ['completed', 'dead_letter', 'failed', 'pending', 'processing'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `batch_jobs.status` tem valores ['cancelled', 'completed', 'failed', 'partial', 'paused', 'pending', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `bitrix24_webhook_events.routing_status` tem valores ['failed', 'invalid_signature', 'no_route', 'pending', 'routed'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `whatsapp_webhook_events.routing_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `kb_articles.status` tem valores ['archived', 'draft', 'published'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `kb_query_gaps.status` tem valores ['dismissed', 'in_progress', 'open', 'resolved'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `automation_logs.status` tem valores ['failed', 'running', 'skipped', 'success'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `agent_experiments.status` tem valores ['completed', 'draft', 'paused', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `agent_eval_runs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `agent_workflows.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `agent_workflow_runs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `replay_forks.fork_step_index` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `replay_forks.state_snapshot` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `replay_forks.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `code_executions.status` tem valores ['completed', 'failed', 'pending', 'running', 'timeout'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `skill_purchases.status` tem valores ['completed', 'failed', 'pending', 'refunded'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `creator_payouts.status` tem valores ['failed', 'paid', 'pending', 'processing'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `prompt_experiments.status` tem valores ['completed', 'draft', 'paused', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `voice_sessions.status` tem valores ['active', 'ended', 'error'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `browser_sessions.status` tem valores ['cancelled', 'completed', 'failed', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `graph_executions.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `synthetic_checks.expected_status_max_ms` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `game_days.status` tem valores ['aborted', 'completed', 'running', 'scheduled'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `incident_runs.status` tem valores ['failed', 'partial', 'running', 'succeeded'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `dr_drills.status` tem valores ['cancelled', 'completed', 'failed', 'restoring', 'scheduled', 'snapshotting', 'validating'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `dr_restore_logs.step` tem valores ['cleanup', 'isolate', 'restore', 'snapshot', 'validate'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `dr_restore_logs.status` tem valores ['failed', 'skipped', 'started', 'succeeded'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `postmortems.status` tem valores ['draft', 'published', 'review'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `postmortem_action_items.status` tem valores ['cancelled', 'done', 'in_progress', 'open'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `compliance_reports.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `compliance_evidence.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `vulnerability_findings.status` tem valores ['accepted_risk', 'acknowledged', 'fixed', 'open'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `managed_secrets.status` tem valores ['active', 'overdue', 'pending_rotation', 'retired'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `pentest_engagements.status` tem valores ['cancelled', 'completed', 'in_progress', 'reporting', 'scoping'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `pentest_findings.status` tem valores ['accepted_risk', 'false_positive', 'fixed', 'in_remediation', 'open'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `risk_register.status` tem valores ['assessed', 'closed', 'identified', 'monitored', 'treated'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `vendors.status` tem valores ['active', 'offboarded', 'suspended', 'under_review'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `business_systems.status` tem valores ['operational', 'degraded', 'down', 'retired'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `change_requests.status` tem valores ['draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'in_progress', 'completed', 'rolled_back', 'failed'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `ir_playbooks.status` tem valores ['draft', 'active', 'archived'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `ir_playbook_steps.step_order` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `ir_playbook_steps.phase` tem valores ['detect', 'contain', 'eradicate', 'recover', 'postmortem'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `assets.status` tem valores ['active', 'maintenance', 'decommissioned', 'lost'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `asset_audits.status_after` tem valores ['active', 'maintenance', 'decommissioned', 'lost'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `audit_log_v2.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `retention_job_runs.status` tem valores ['failed', 'running', 'success'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `openclaw_deployments.status` tem valores ['deployed', 'failed', 'pending', 'rolled_back'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `openclaw_whatsapp_instances.status` tem valores ['connected', 'disconnected', 'error', 'expired', 'pending'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `openclaw_whatsapp_messages.status` tem valores ['failed', 'human_takeover', 'received', 'sent'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `slack_rag_sources.last_sync_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `document_ingestions.status` tem valores ['cancelled', 'chunking', 'embedding', 'error', 'ocr', 'parsing', 'pending', 'ready', 'uploading'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `document_ingestion_events.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `notebook_podcasts.status` tem valores ['canceled', 'failed', 'generating', 'queued', 'ready'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `data_subject_requests.status` tem valores ['completed', 'denied', 'partial', 'processing', 'received'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `data_breach_log.status` tem valores ['contained', 'investigating', 'open', 'resolved'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `crm_deals.status` tem valores ['lost', 'open', 'won'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `crm_cadence_enrollments.status` tem valores ['active', 'completed', 'failed', 'stopped'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `crm_cadence_enrollments.current_step` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `webhook_delivery_logs.status` tem valores ['delivered', 'failed'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `traces.status` tem valores ['cancelled', 'error', 'ok', 'running'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `spans.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `skill_harvest_runs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `skill_harvest_candidates.status` tem valores ['accepted', 'auto_rejected', 'pending', 'promoted', 'rejected'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `skill_reclassification_reviews.status` tem valores ['aprovado', 'pendente', 'rejeitado'] mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.
- `forensic_snapshots.step_index` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `forensic_snapshots.state_before` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `forensic_snapshots.state_after` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_08.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_09.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_10.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_11.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2026_12.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_01.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_02.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_03.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `audit_log_v2_2027_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_08.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_09.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_10.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_11.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2026_12.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_01.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_02.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_03.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `spans_2027_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_08.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_09.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_10.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_11.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2026_12.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_01.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_02.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_03.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `trace_events_v2_2027_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_08.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_09.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_10.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_11.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2026_12.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_01.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_02.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_03.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_04.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_05.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_06.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `traces_2027_07.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- 327/333 tabelas sem `COMMENT ON TABLE` — o significado de negócio não está no schema: `agents`, `agent_usage`, `prompt_versions`, `notifications`, `user_roles`, `auth_attempts`, `chunks`, `vector_indexes`, `workspaces`, `workspace_members`, `knowledge_bases`, `agent_templates` …
- Há tabelas usadas no código sem migration no repo — o schema real pode ter sido alterado pelo painel.

## Regras manuais presentes

_nenhuma — copie `manual/TEMPLATE-regras-de-negocio.md`_
