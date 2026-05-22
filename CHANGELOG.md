# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-22

### Added
- **Security Monitoring Dashboard**: Implementado painel centralizado para alertas de segurança (RLS, RBAC, Auth) com monitoramento em tempo real.
- **Contract Versioning (v1/v2)**: Introduzido versionamento de contratos em Edge Functions com suporte a compatibilidade retroativa.
- **Contract Tests**: Suíte de testes automatizados para validação de payloads e esquemas de API.

### Fixed
- **SECURITY DEFINER Protection**: Corrigido `search_path` em 33 funções do banco de dados para prevenir ataques de interceptação de esquema.
- **Database Linter**: Resolvidos todos os avisos críticos relacionados a políticas RLS e proteção de colunas sensíveis.

## [1.0.1] - 2026-05-13

### Added
- **Auditoria 10/10**: Avanço nas ondas de Quick Wins e Sprint 1.
- **Security**: Implementada validação HMAC obrigatória em webhooks via `_shared/webhookSignature.ts` e integração com `security.ts`.
- **Deno Compliance**: Ajustados logs em Edge Functions para garantir visibilidade no Supabase Dashboard sem violar `no-console`.

### Fixed
- **Type Safety**: Refatorado `billingService.ts` eliminando casts `as any[]` em favor de tipagem automática do Supabase Client.
- **HMAC Enforcement**: Centralizada lógica de verificação de assinatura em `verifyHmac`.

### Changed
- **Logging**: Ativada regra `no-console: error` no ESLint e limpos logs residuais em serviços frontend.
- **Test Infrastructure**: Reforçado threshold de 80% de cobertura no `vitest.config.ts`.

## [1.0.0] - 2026-05-13

### Added
- **Auditoria 10/10**: Iniciada execução do plano de excelência enterprise.
- **Dual-Client Architecture**: Implementado isolamento entre Auth (local) e Data (external) via ADR-006.
- **Partitioning**: Tabelas `audit_log_v2` e `trace_events_v2` agora utilizam particionamento mensal por `created_at`.
- **Cost Calculator**: Centralizada lógica de precificação em Edge Function para garantir precisão e consistência.
- **MFA Enforcement**: Implementada obrigatoriedade de AAL2 para usuários com role 'admin'.
- **Rate Limiting**: Adicionado limitador de taxa para tentativas de login e endpoints críticos.
- **Governança**: Criados guias de `ONBOARDING.md`, `CONTRIBUTING.md` e `DATA-DICTIONARY.md`.

### Fixed
- **HMR Auth Crash**: Corrigido erro `useAuth must be used within AuthProvider` durante recarregamento de módulos.
- **Type Safety**: Iniciada campanha "Zero Any", refatorando serviços críticos para usar tipos estritos do Supabase.
- **Security**: Blindagem de webhooks (WhatsApp/Bitrix) com validação HMAC.

### Changed
- **Logging**: Removidos todos os `console.log` residuais e ativada regra de ESLint `no-console: error`.
- **Test Infrastructure**: Definido threshold de 80% de cobertura obrigatória no CI.

---
*Gerado automaticamente pelo Nexus Agents Studio.*
