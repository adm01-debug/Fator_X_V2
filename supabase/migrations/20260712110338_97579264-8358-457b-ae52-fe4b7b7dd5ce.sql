
-- Helper function first (top-level), then DO block that uses it, then drop the helper.
CREATE OR REPLACE FUNCTION pg_temp.wrap_auth(expr TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE s TEXT := expr;
BEGIN
  IF s IS NULL THEN RETURN NULL; END IF;
  s := regexp_replace(s, '\(\s*select\s+auth\.uid\(\)\s*\)',  '@@AUID@@',  'gi');
  s := regexp_replace(s, '\(\s*select\s+auth\.jwt\(\)\s*\)',  '@@AJWT@@',  'gi');
  s := regexp_replace(s, '\(\s*select\s+auth\.role\(\)\s*\)', '@@AROLE@@', 'gi');
  s := regexp_replace(s, 'auth\.uid\(\)',  '(SELECT auth.uid())',  'g');
  s := regexp_replace(s, 'auth\.jwt\(\)',  '(SELECT auth.jwt())',  'g');
  s := regexp_replace(s, 'auth\.role\(\)', '(SELECT auth.role())', 'g');
  s := replace(s, '@@AUID@@',  '(SELECT auth.uid())');
  s := replace(s, '@@AJWT@@',  '(SELECT auth.jwt())');
  s := replace(s, '@@AROLE@@', '(SELECT auth.role())');
  RETURN s;
END;
$f$;

DO $mig$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_check TEXT;
  roles_csv TEXT;
  ddl TEXT;
  rewritten_count INT := 0;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND (
        (p.qual       ~ 'auth\.(uid|jwt|role)\(\)' AND p.qual       !~* '\(\s*select\s+auth\.(uid|jwt|role)\(\)\s*\)')
        OR
        (p.with_check ~ 'auth\.(uid|jwt|role)\(\)' AND p.with_check !~* '\(\s*select\s+auth\.(uid|jwt|role)\(\)\s*\)')
      )
  LOOP
    new_qual  := pg_temp.wrap_auth(r.qual);
    new_check := pg_temp.wrap_auth(r.with_check);

    IF new_qual IS NOT DISTINCT FROM r.qual AND new_check IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;
    END IF;

    roles_csv := array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) x), ', ');

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    ddl := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.policyname, r.schemaname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      COALESCE(NULLIF(roles_csv, ''), 'public')
    );
    IF new_qual  IS NOT NULL THEN ddl := ddl || format(' USING (%s)',      new_qual);  END IF;
    IF new_check IS NOT NULL THEN ddl := ddl || format(' WITH CHECK (%s)', new_check); END IF;

    EXECUTE ddl;
    rewritten_count := rewritten_count + 1;
  END LOOP;

  RAISE NOTICE 'RLS initplan optimization: % policies rewritten', rewritten_count;
END
$mig$;
