# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
