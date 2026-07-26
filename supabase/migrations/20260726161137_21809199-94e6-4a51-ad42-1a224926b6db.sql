-- Garante o schema dedicado de extensões
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Move pg_trgm para fora do schema public (lint 0014_extension_in_public).
-- O índice GIN existente (idx_notebook_notes_title_trgm) referencia a operator
-- class por OID, portanto permanece válido após a mudança de schema.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;