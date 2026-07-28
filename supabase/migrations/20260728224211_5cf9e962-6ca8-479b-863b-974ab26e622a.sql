-- Confiança graduada do tier de plataforma.
--
-- Antes: todo veredito do tier recebia 0.15 fixo, então `gstack` ("Router for
-- the gstack skill suite", zero tópicos) e `fastmcp` (MCP, Python, servidores,
-- clientes, 9 tópicos) chegavam idênticos à fila de revisão. O curador gastava
-- a mesma atenção no caso óbvio e no caso genuinamente ambíguo.
--
-- Agora a confiança escala com a evidência: 0.15 de base, +0.03 por termo de
-- plataforma DISTINTO, teto 0.40, e teto rebaixado a 0.17 quando toda a
-- evidência vem de um único campo (tópicos inflados não são corroboração).
-- Os valores abaixo vieram da simulação do classificador sobre as 142 skills
-- reais do catálogo — nenhuma delas conflita com curadoria humana existente.
UPDATE public.skill_registry AS s
SET department_confidence = v.conf,
    updated_at = now()
FROM (VALUES
  ('leon-drq-openagentskill',              0.40),
  ('khazp-vibe-coding-prompt-template',    0.39),
  ('farion1231-cc-switch',                 0.36),
  ('ar9av-obsidian-wiki',                  0.33),
  ('nextlevelbuilder-ui-ux-pro-max-skill', 0.33),
  ('tadata-org-fastapi-mcp',               0.33),
  ('wednesday-solutions-ai-agent-skills',  0.30),
  ('prefecthq-fastmcp',                    0.27),
  ('msitarzewski-agency-agents',           0.17)
) AS v(slug, conf)
WHERE s.slug = v.slug
  AND s.department_source = 'platform_heuristic';