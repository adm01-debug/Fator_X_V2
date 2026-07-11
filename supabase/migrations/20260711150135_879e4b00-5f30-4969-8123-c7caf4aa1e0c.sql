
-- 1) Mover pg_net para o schema `extensions` (tentativa não-destrutiva primeiro).
DO $$
DECLARE
  current_schema_name text;
BEGIN
  SELECT extnamespace::regnamespace::text INTO current_schema_name
  FROM pg_extension WHERE extname = 'pg_net';

  IF current_schema_name = 'public' THEN
    BEGIN
      ALTER EXTENSION pg_net SET SCHEMA extensions;
      RAISE NOTICE 'pg_net moved from public to extensions via ALTER EXTENSION';
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: drop e recria no schema correto (pg_net não suporta SET SCHEMA em algumas versões)
      RAISE NOTICE 'ALTER EXTENSION SET SCHEMA failed (%). Falling back to DROP/CREATE.', SQLERRM;
      DROP EXTENSION pg_net CASCADE;
      CREATE EXTENSION pg_net WITH SCHEMA extensions;
    END;
  ELSE
    RAISE NOTICE 'pg_net already in schema %, no move needed', current_schema_name;
  END IF;
END $$;

-- 2) Garante search_path para código legado que ainda chama net.http_post sem qualificar.
-- (o schema `net` é criado pela extensão; se ficou em `extensions`, `net` continua sendo o schema lógico das funções)

-- 3) Helpers para o smoke test (SECURITY DEFINER, restrito a platform_admin).
CREATE OR REPLACE FUNCTION public.pg_net_schema()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pg_net';
$$;

CREATE OR REPLACE FUNCTION public.pg_net_smoke_post(_url text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  req_id bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'permission denied: platform_admin required';
  END IF;

  SELECT net.http_post(
    url := _url,
    headers := '{"Content-Type":"application/json","X-Smoke-Test":"pg-net"}'::jsonb,
    body := _body,
    timeout_milliseconds := 8000
  ) INTO req_id;

  RETURN req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pg_net_smoke_response(_request_id bigint)
RETURNS TABLE (status_code int, error_msg text, content_length int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'permission denied: platform_admin required';
  END IF;

  RETURN QUERY
  SELECT r.status_code, r.error_msg, coalesce(length(r.content), 0)
  FROM net._http_response r
  WHERE r.id = _request_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.pg_net_schema() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pg_net_smoke_post(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pg_net_smoke_response(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.pg_net_schema() TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_net_smoke_post(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_net_smoke_response(bigint) TO service_role;
