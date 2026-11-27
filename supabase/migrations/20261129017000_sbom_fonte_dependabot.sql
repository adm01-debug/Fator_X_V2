-- A tela /security/vulnerabilities le public.vulnerability_findings, mas o
-- sincronizador automatico (scripts/sync-dependabot-findings.mjs) nao
-- conseguia criar o snapshot pai: sbom_snapshots_source_check aceitava
-- apenas 'package.json', 'manual' e 'upload'. Toda execucao morria com
-- ERROR 23514 e a tela ficava vazia com os alertas abertos no GitHub.
--
-- 'dependabot' e a origem real dos dados (varredura automatica de
-- seguranca) e precisa ser distinguivel de um envio manual.

ALTER TABLE public.sbom_snapshots
  DROP CONSTRAINT IF EXISTS sbom_snapshots_source_check;

ALTER TABLE public.sbom_snapshots
  ADD CONSTRAINT sbom_snapshots_source_check
  CHECK (source = ANY (ARRAY['package.json'::text, 'manual'::text, 'upload'::text, 'dependabot'::text]));
