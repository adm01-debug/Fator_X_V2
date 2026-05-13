# Contributing to Nexus

## Development Workflow
1. **Branching**: Use feature branches (`feat/`, `fix/`, `refactor/`).
2. **Pull Requests**:
   - Must pass linting (`npm run lint`).
   - Must pass tests (`npm run test`).
   - Must include an ADR if architectural changes are made.
3. **Code Style**: We enforce standard Prettier and ESLint rules. `no-console` is prohibited in production code.

## Security Standards
- Never hardcode API keys.
- Always use `supabaseExternal` for data.
- Ensure every new table has RLS enabled with granular policies.
- HMAC signature verification is required for all new webhooks.

## Review SLA
- PRs should be reviewed within 24 hours.
- Security-critical PRs require at least 2 approvals.
