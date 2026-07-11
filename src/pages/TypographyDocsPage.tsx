/**
 * TypographyDocsPage — documentação interna da escala tipográfica canônica.
 *
 * Fonte da verdade das classes: src/index.css (@layer components).
 * Regra ESLint que bloqueia tokens ad-hoc: eslint.config.js
 *   (no-restricted-syntax → text-xs / text-sm / text-[10px] / text-[11px]).
 */
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TokenRow {
  token: string;
  size: string;
  lineHeight: string;
  usage: string;
  example: string;
}

const TOKENS: TokenRow[] = [
  { token: 'text-meta',      size: '11px', lineHeight: '1.4',  usage: 'Labels, timestamps, badges, meta em tabelas',      example: 'CRIADO EM · 12/04/2026' },
  { token: 'text-caption',   size: '12px', lineHeight: '1.45', usage: 'Legendas, hints de formulário, footnotes',          example: 'Máximo 280 caracteres' },
  { token: 'text-body-sm',   size: '13px', lineHeight: '1.55', usage: 'Corpo de tabelas, listas densas, células',          example: 'Cliente Aurora — R$ 12.400,00' },
  { token: 'text-body',      size: '14px', lineHeight: '1.6',  usage: 'Texto padrão de parágrafo em dialogs e cards',      example: 'Este agente processa 1.2k requisições/dia.' },
  { token: 'text-ui',        size: '14px', lineHeight: '1.5',  usage: 'Rótulos de botões, inputs, menus (peso 500)',       example: 'Salvar alterações' },
  { token: 'text-title-sm',  size: '16px', lineHeight: '1.4',  usage: 'Títulos de cards e seções secundárias',              example: 'Uso por modelo' },
  { token: 'text-title',     size: '20px', lineHeight: '1.3',  usage: 'Títulos de cards principais e headers de dialog',    example: 'Configuração do agente' },
  { token: 'text-title-lg',  size: '24px', lineHeight: '1.25', usage: 'Títulos de sub-página / seção destaque',              example: 'Trilhas de execução' },
  { token: 'text-hero',      size: '32px', lineHeight: '1.15', usage: 'KPIs grandes, números principais do dashboard',      example: '1.284' },
  { token: 'text-hero-lg',   size: '40px', lineHeight: '1.1',  usage: 'Hero de página (PageHeader com gradiente)',           example: 'Fator X' },
  { token: 'text-numeric',   size: '—',    lineHeight: '—',    usage: 'Modificador — tabular-nums para colunas numéricas',   example: '$0.0421' },
];

const DEPRECATED = [
  { bad: 'text-xs',       good: 'text-meta',      why: 'Ambíguo entre 11 e 12px em contextos diferentes.' },
  { bad: 'text-sm',       good: 'text-body-sm',   why: 'Não distingue corpo denso de rótulo de UI.' },
  { bad: 'text-[10px]',   good: 'text-meta',      why: '10px falha WCAG em telas retina; padronizamos em 11px.' },
  { bad: 'text-[11px]',   good: 'text-meta',      why: 'Substituído pelo token semântico.' },
];

export default function TypographyDocsPage() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Tipografia"
        subtitle="Escala semântica oficial — use estes tokens em todo componente novo."
      />

      {/* Escala */}
      <Card className="nexus-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm text-numeric">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Token</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Tamanho</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Line-height</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Uso recomendado</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Exemplo</th>
                </tr>
              </thead>
              <tbody>
                {TOKENS.map((t) => (
                  <tr key={t.token} className="border-t border-border/40 hover:bg-secondary/20">
                    <td className="p-3"><code className="text-meta font-mono text-primary">{t.token}</code></td>
                    <td className="p-3">{t.size}</td>
                    <td className="p-3">{t.lineHeight}</td>
                    <td className="p-3 text-muted-foreground">{t.usage}</td>
                    <td className="p-3"><span className={t.token === 'text-numeric' ? 'text-body text-numeric' : t.token}>{t.example}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tokens depreciados */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-title-sm font-heading">Tokens bloqueados</h2>
            <Badge variant="destructive" className="text-meta">ESLint enforce</Badge>
          </div>
          <p className="text-body-sm text-muted-foreground">
            O ESLint bloqueia estes tokens em novos commits. Use sempre a coluna “Substituir por”.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">❌ Não use</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">✅ Substituir por</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {DEPRECATED.map((d) => (
                  <tr key={d.bad} className="border-t border-border/40">
                    <td className="p-3"><code className="text-meta font-mono text-destructive">{d.bad}</code></td>
                    <td className="p-3"><code className="text-meta font-mono text-primary">{d.good}</code></td>
                    <td className="p-3 text-muted-foreground">{d.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Padrões de uso */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-title-sm font-heading">Padrões de uso</h2>

          <div className="space-y-2">
            <p className="text-meta uppercase tracking-wide text-muted-foreground">KPI card</p>
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-meta uppercase tracking-wide text-muted-foreground">Custo hoje</p>
              <p className="text-hero text-numeric font-heading">$12.48</p>
              <p className="text-caption text-muted-foreground">+8% vs ontem</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-meta uppercase tracking-wide text-muted-foreground">Linha de tabela</p>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between">
                <span className="text-body-sm">Agente Aurora</span>
                <span className="text-body-sm text-numeric text-muted-foreground">$0.0421</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-meta uppercase tracking-wide text-muted-foreground">Formulário</p>
            <div className="p-4 rounded-lg border border-border bg-card space-y-1.5">
              <label className="text-ui font-medium">Nome do agente</label>
              <div className="h-8 rounded border border-border bg-muted/30" />
              <p className="text-caption text-muted-foreground">Entre 3 e 60 caracteres.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
