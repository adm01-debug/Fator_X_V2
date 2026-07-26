-- A rotação é transparente porque o agendador lê o token da tabela em tempo de
-- execução: trocar o valor não exige reagendar o job nem redeploy da função.
CREATE OR REPLACE FUNCTION internal.rotate_cron_token(_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public
AS $$
BEGIN
  UPDATE internal.cron_tokens
     SET token = encode(gen_random_bytes(32), 'hex'),
         rotated_at = now()
   WHERE name = _name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de cron desconhecido: %', _name;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION internal.rotate_cron_token(TEXT) FROM PUBLIC, anon, authenticated;