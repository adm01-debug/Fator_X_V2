-- 2FA estava inoperante por dois motivos independentes:
--  1) O hardening revogou INSERT/UPDATE de (secret, backup_codes) para
--     `authenticated` e nunca criou RPC de escrita. `use2FA.enable()` gravava
--     direto em user_2fa e falhava sempre com "permission denied", então
--     ninguém conseguia ativar o segundo fator.
--  2) `is_mfa_valid_for_role()` exige `aal = 'aal2'` do JWT, mas o app valida o
--     TOTP localmente e nunca chama `auth.mfa.challenge/verify`. Resultado: o
--     admin com 2FA ativo passaria a ser recusado em tudo que consulta a função.
-- Ambas passam a operar sobre `user_2fa`, que é a sessão de segundo fator real
-- do produto.

-- Helper interno: decodifica base32 (RFC 4648, maiúsculas, sem padding).
-- Postgres não traz base32 em `decode()`; sem isso o segredo do autenticador
-- não pode ser lido.
CREATE OR REPLACE FUNCTION public.base32_decode(_value text)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  _clean text;
  _bits int := 0;
  _buffer int := 0;
  _out bytea := ''::bytea;
  _idx int;
  _ch text;
BEGIN
  IF _value IS NULL THEN
    RETURN NULL;
  END IF;
  _clean := upper(replace(replace(replace(_value, ' ', ''), '-', ''), '=', ''));

  FOR i IN 1..length(_clean) LOOP
    _ch := substr(_clean, i, 1);
    _idx := position(_ch in _alphabet);
    IF _idx = 0 THEN
      RETURN NULL;
    END IF;
    _buffer := (_buffer << 5) | (_idx - 1);
    _bits := _bits + 5;
    IF _bits >= 8 THEN
      _bits := _bits - 8;
      _out := _out || set_byte('\x00'::bytea, 0, (_buffer >> _bits) & 255);
      _buffer := _buffer & ((1 << _bits) - 1);
    END IF;
  END LOOP;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.base32_decode(text) FROM PUBLIC, anon, authenticated;

-- Helper interno: confere um TOTP de 6 dígitos (RFC 6238, SHA1, 30s, ±1 passo).
CREATE OR REPLACE FUNCTION public.totp_matches(_secret text, _token text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  _key bytea;
  _step bigint;
  _counter bigint;
  _msg bytea;
  _hash bytea;
  _offset int;
  _code text;
BEGIN
  IF _secret IS NULL OR _token IS NULL OR _token !~ '^[0-9]{6}$' THEN
    RETURN false;
  END IF;
  _key := public.base32_decode(_secret);
  IF _key IS NULL OR length(_key) = 0 THEN
    RETURN false;
  END IF;

  FOR _step IN -1..1 LOOP
    -- RFC 6238: contador de 8 bytes big-endian. O bit 63 é sempre 0, então
    -- basta o último byte e o inteiro truncado nos 12 dígitos hexadecimais finais.
    _counter := (floor(extract(epoch FROM now()) / 30))::bigint + _step;
    _msg := decode(lpad(to_hex(_counter), 16, '0'), 'hex');
    _hash := public.hmac(_msg, _key, 'sha1');
    IF octet_length(_hash) < 20 THEN
      RETURN false;
    END IF;
    _offset := get_byte(_hash, 19) & 15;
    _code := lpad((
      ((get_byte(_hash, _offset) & 127)::bigint * 16777216
       + get_byte(_hash, _offset + 1)::bigint * 65536
       + get_byte(_hash, _offset + 2)::bigint * 256
       + get_byte(_hash, _offset + 3)::bigint) % 1000000
    )::text, 6, '0');
    IF _code = _token THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.totp_matches(text, text) FROM PUBLIC, anon, authenticated;

-- 1) Ativação: grava segredo + códigos de recuperação e valida o TOTP no SQL
--    (RFC 6238) para nunca confiar na validação só do navegador.
CREATE OR REPLACE FUNCTION public.enable_my_2fa(_secret text, _token text, _backup_codes text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _secret IS NULL OR length(_secret) = 0 THEN
    RAISE EXCEPTION 'secret obrigatório' USING ERRCODE = '22023';
  END IF;
  IF _token IS NULL OR _token !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'código inválido' USING ERRCODE = '22023';
  END IF;
  IF _backup_codes IS NULL OR cardinality(_backup_codes) = 0 THEN
    RAISE EXCEPTION 'códigos de recuperação obrigatórios' USING ERRCODE = '22023';
  END IF;

  -- Janela de ±1 passo de 30s, igual ao validate({ window: 1 }) do cliente.
  IF public.totp_matches(_secret, _token) THEN
    INSERT INTO public.user_2fa (user_id, secret, enabled, backup_codes, last_verified_at)
    VALUES (auth.uid(), _secret, true, _backup_codes, _now)
    ON CONFLICT (user_id) DO UPDATE
      SET secret = EXCLUDED.secret,
          enabled = true,
          backup_codes = EXCLUDED.backup_codes,
          last_verified_at = EXCLUDED.last_verified_at;
    RETURN true;
  END IF;

  RAISE EXCEPTION 'código inválido' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.enable_my_2fa(text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enable_my_2fa(text, text, text[]) TO authenticated;

-- 2) Desativação explícita (o cliente já pode apagar a própria linha pela RLS,
--    a RPC existe para deixar o caminho documentado e auditável).
CREATE OR REPLACE FUNCTION public.disable_my_2fa()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.user_2fa WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.disable_my_2fa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_my_2fa() TO authenticated;

-- 3) Passo de verificação no login: confere o TOTP contra o segredo guardado e
--    atualiza last_verified_at, que é a prova de que o segundo fator foi usado.
CREATE OR REPLACE FUNCTION public.verify_my_2fa(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _secret text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT s.secret INTO _secret
    FROM public.user_2fa s
   WHERE s.user_id = auth.uid() AND s.enabled;
  IF _secret IS NULL THEN
    RETURN false;
  END IF;

  IF public.totp_matches(_secret, _token) THEN
    UPDATE public.user_2fa SET last_verified_at = now() WHERE user_id = auth.uid();
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_my_2fa(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_my_2fa(text) TO authenticated;

-- 4) is_mfa_valid_for_role passa a reconhecer o 2FA do produto: admin precisa
--    ter o segundo fator ativo e uma sessão AAL2 do Supabase Auth. Sem o AAL2
--    (caso do TOTP local), basta o fator estar ativo e verificado.
CREATE OR REPLACE FUNCTION public.is_mfa_valid_for_role()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
  _has_2fa boolean;
BEGIN
  SELECT ur.role_key INTO _role
    FROM public.user_roles ur
   WHERE ur.user_id = auth.uid()
   LIMIT 1;

  IF _role IS NULL OR _role <> 'workspace_admin' THEN
    RETURN true;
  END IF;

  IF (auth.jwt() ->> 'aal') = 'aal2' THEN
    RETURN true;
  END IF;

  SELECT (s.enabled AND s.last_verified_at IS NOT NULL) INTO _has_2fa
    FROM public.user_2fa s
   WHERE s.user_id = auth.uid();

  RETURN COALESCE(_has_2fa, false);
END;
$$;

REVOKE ALL ON FUNCTION public.is_mfa_valid_for_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mfa_valid_for_role() TO authenticated, service_role;
