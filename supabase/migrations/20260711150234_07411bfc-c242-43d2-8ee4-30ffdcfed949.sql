
CREATE OR REPLACE FUNCTION public.pg_net_smoke_post(_url text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  req_id bigint;
BEGIN
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
  RETURN QUERY
  SELECT r.status_code, r.error_msg, coalesce(length(r.content), 0)
  FROM net._http_response r
  WHERE r.id = _request_id
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pg_net_smoke_post(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pg_net_smoke_response(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pg_net_smoke_post(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pg_net_smoke_response(bigint) TO service_role;
