# Codex CLI neste repositorio

Suplemento ao `AGENTS.md` da raiz — as regras de trabalho (banco, fluxo Git, PR, comunicacao) estao la e
valem igual aqui. Este arquivo so diz o que e especifico do Codex CLI.

## Skill do repo

- Skill para o Codex: `.agents/skills/fator-x-v2/SKILL.md`
- Copia para o Claude Code: `.claude/skills/fator-x-v2/SKILL.md` (os dois arquivos sao identicos — mude os dois)
- Credencial pessoal e MCP privado ficam em `~/.codex/config.toml`, nunca neste repo.

## Baseline de MCP

`.codex/config.toml` e o baseline do repo: GitHub, Context7, Exa, Memory, Playwright e Sequential Thinking.
Escrita no GitHub em repos `adm01-debug` continua pelo MCP `GITHUB - MCP - FOREVER` (ver `AGENTS.md`).

## Multi-agente

- `explorer`: coleta de evidencia, somente leitura
- `reviewer`: correcao, seguranca e regressao
- `docs_researcher`: verificacao de API e release notes

## Referencia longa

`docs/agentes/`: `banco.md`, `github-ci.md`, `deploy.md`, `integracoes.md`, `regras-dominio.md`, `mapa-repo.md`.
