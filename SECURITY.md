# Política de Segurança — Nexus Agents Studio

## Versões Suportadas

Apenas a versão mais recente publicada em `main` recebe patches de segurança.
Releases marcadas como `deprecated` no CHANGELOG não recebem correções.

| Versão      | Suporte de segurança |
| ----------- | -------------------- |
| `main` / latest | ✅ Ativo         |
| Anteriores  | ❌ Sem suporte       |

## Reportando uma Vulnerabilidade

**Nunca abra uma issue pública para vulnerabilidades.**

Utilize um dos canais privados abaixo:

1. **GitHub Security Advisories** (preferido): use o botão _Report a vulnerability_ na aba **Security** do repositório. Isso cria um advisory privado onde discutimos, validamos e coordenamos a divulgação.
2. **E-mail**: `security@nexus-agents.io` — cifre com nossa chave PGP quando o payload contiver PoC sensível (chave publicada em `/.well-known/security.txt`).

Inclua no relatório, sempre que possível:

- Descrição do impacto e do vetor de exploração.
- Passos reproduzíveis (PoC minimal).
- Versão/commit afetado.
- Configuração relevante (RLS, edge functions, chaves envolvidas).
- Sugestão de mitigação, se houver.

## SLA de Resposta

| Fase                    | Prazo alvo             |
| ----------------------- | ---------------------- |
| Confirmação de recebimento | 48h úteis           |
| Triage inicial + severidade CVSS | 5 dias úteis  |
| Patch para crítico (CVSS ≥ 9.0) | 7 dias corridos |
| Patch para alto (CVSS 7.0–8.9) | 30 dias corridos |
| Patch para médio/baixo | próxima release planejada |

## Divulgação Responsável

- Coordenamos a data de disclosure com quem reportou.
- Créditos públicos no `SECURITY.md` e no advisory (opt-out disponível).
- Solicitamos **não divulgação pública** enquanto o patch não estiver disponível a 100% dos tenants em produção.
- Não iniciamos ações legais contra pesquisadores que sigam esta política (safe harbor).

## Escopo

**Em escopo:**
- Código deste repositório (frontend + edge functions + migrations).
- Políticas RLS, funções `SECURITY DEFINER` e superfícies de auth.
- Endpoints públicos da aplicação hospedada em produção.

**Fora de escopo:**
- Ataques de engenharia social contra funcionários.
- DoS/volumetria sem PoC de amplificação.
- Vulnerabilidades em serviços de terceiros (Supabase infra, Lovable Cloud) — reporte diretamente ao fornecedor.
- Findings automatizados sem PoC (relatórios crus de scanners).

## Práticas de Segurança do Projeto

- RLS habilitada em 100% das tabelas públicas (verificado por `supabase--linter` no CI).
- `SECURITY DEFINER` com `search_path = public` fixado.
- Segredos nunca versionados — gerenciados via Lovable Cloud secrets.
- Dependências monitoradas por Renovate + OSV alerts + `npm audit --audit-level=high` bloqueante no CI.
- CodeQL executado em todo PR e semanalmente na branch `main`.
- Sanitização de HTML de usuário via `DOMPurify` em `src/lib/sanitize.ts`.
- Retenção de logs auditáveis por 90 dias com watchdog automatizado.

## Contato

Coordenação de segurança: **@nexus/security** (CODEOWNERS).
