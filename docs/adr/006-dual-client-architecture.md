# ADR 006: Dual-Client Architecture (Internal Auth + External Data)

## Status
Proposed

## Context
The Nexus Agents Studio requires a robust separation between user authentication and application data. We use a "Dual-Client" architecture where:
1. The primary `supabase` client (local) handles authentication, session management, and project-specific configuration.
2. The secondary `supabaseExternal` client handles all application data (agents, traces, workflows) stored in a dedicated high-performance database.

## Decision
We will formalize the usage of two distinct Supabase clients:
- **`src/integrations/supabase/client.ts`**: Used ONLY for `auth` operations.
- **`src/integrations/supabase/externalClient.ts`**: Used for all `from()` operations and data-heavy RPCs.

### Synchronization
To ensure RLS works on the external client, the `AuthContext` must call `syncExternalAuth(session.access_token)` whenever the session changes.

## Consequences
- **Pros**: Better scalability, isolation of user credentials from business data, ability to use dedicated DB resources for intensive operations.
- **Cons**: Requires explicit token synchronization, slightly more complex service layer.
