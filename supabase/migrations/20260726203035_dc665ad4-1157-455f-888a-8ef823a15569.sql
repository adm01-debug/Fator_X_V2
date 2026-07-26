-- Token de cron guardado no banco (e não como secret de função) porque quem
-- precisa apresentá-lo é o próprio pg_cron: um secret de Edge Function não é
-- legível pelo agendador, e `app.settings.service_role_key` não está definido
-- neste projeto — o padrão anterior enviaria "Bearer " vazio.
CREATE TABLE IF NOT EXISTS internal.cron_tokens (
  name        TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sem GRANT para anon/authenticated: a tabela vive fora da Data API por estar
-- no schema `internal`, e o acesso legítimo é exclusivamente via função abaixo.
REVOKE ALL ON internal.cron_tokens FROM PUBLIC;

INSERT INTO internal.cron_tokens (name, token)
VALUES ('crm-cadence-runner', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- Comparação feita dentro do banco: o token nunca sai daqui, nem para o
-- verificador. `hashtext` não serve — precisa ser igualdade exata.
CREATE OR REPLACE FUNCTION public.verify_cron_token(_name TEXT, _token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = internal, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal.cron_tokens
    WHERE name = _name AND token = _token AND length(_token) >= 32
  );
$$;

REVOKE ALL ON FUNCTION public.verify_cron_token(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(TEXT, TEXT) TO service_role;