-- 1) Remove o gatilho incompatível: skill_registry.version é semver TEXT.
DROP TRIGGER IF EXISTS increment_skill_registry_version ON public.skill_registry;

-- 2) Endurece a função para nunca quebrar em colunas não numéricas.
CREATE OR REPLACE FUNCTION public.increment_version_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = TG_TABLE_SCHEMA
    AND table_name = TG_TABLE_NAME
    AND column_name = 'version';

  -- Só incrementa quando a coluna é numérica; caso contrário mantém o valor.
  IF v_type IN ('integer', 'bigint', 'smallint', 'numeric') THEN
    NEW.version := (OLD.version::bigint + 1)::text::int;
  END IF;

  RETURN NEW;
END;
$$;