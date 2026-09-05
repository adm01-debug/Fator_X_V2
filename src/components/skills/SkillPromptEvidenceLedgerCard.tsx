/**
 * SkillPromptEvidenceLedgerCard — histórico das evidências de prompt
 * exportadas e verificador de autenticidade por checksum.
 *
 * Duas perguntas que a trilha crua não responde bem: "o que já foi exportado
 * e para quais agentes?" e "este arquivo que me mandaram é mesmo o que saiu
 * do sistema?". O card resolve ambas sem expor o prompt em si.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, ShieldAlert, ShieldCheck, HelpCircle, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchPromptEvidenceLedger } from '@/services/promptEvidenceLedgerService';
import {
  summarizeEvidenceLedger,
  verifyArtifactContent,
  VERIFICATION_LABEL,
  type VerificationStatus,
} from '@/lib/skills/promptEvidenceLedger';

const STATUS_ICON: Record<VerificationStatus, typeof ShieldCheck> = {
  vazio: HelpCircle,
  autentico: ShieldCheck,
  divergente: ShieldAlert,
  desconhecido: ShieldAlert,
};

const STATUS_TONE: Record<VerificationStatus, string> = {
  vazio: 'text-muted-foreground',
  autentico: 'text-nexus-green',
  divergente: 'text-nexus-amber',
  desconhecido: 'text-destructive',
};

/** Data curta pt-BR; entradas sem data não inventam valor. */
function formatDate(iso: string): string {
  if (iso === '') return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const MAX_LISTED = 8;

export function SkillPromptEvidenceLedgerCard() {
  const [conteudo, setConteudo] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['prompt_evidence_ledger'],
    queryFn: fetchPromptEvidenceLedger,
    staleTime: 120_000,
  });

  const entries = useMemo(() => data ?? [], [data]);
  const resumo = useMemo(() => summarizeEvidenceLedger(entries), [entries]);
  const verificacao = useMemo(() => verifyArtifactContent(conteudo, entries), [conteudo, entries]);

  const StatusIcon = STATUS_ICON[verificacao.status];

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-body">
          <FileCheck2 className="h-4 w-4 text-primary" aria-hidden />
          Evidências de prompt exportadas
        </CardTitle>
        <p className="text-meta text-muted-foreground">
          A trilha guarda apenas a impressão digital do artefato — nunca o prompt. Cole o arquivo
          abaixo para confirmar que ele corresponde a uma exportação registrada.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar a trilha de evidências. Tente novamente em instantes.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Exportações', value: resumo.total },
                { label: 'Agentes', value: resumo.agents },
                { label: 'Com overflow', value: resumo.withOverflow },
                { label: 'Sintéticas', value: resumo.synthetic },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border/60 p-3">
                  <p className="text-meta text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-title-sm font-semibold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>

            {resumo.lastExportAt !== null && (
              <p className="text-meta text-muted-foreground">
                Última exportação: {formatDate(resumo.lastExportAt)}
              </p>
            )}

            {resumo.duplicates.length > 0 && (
              <Alert>
                <AlertDescription className="text-meta">
                  {resumo.duplicates.length} artefato(s) exportado(s) mais de uma vez com conteúdo
                  idêntico — nada mudou entre as revisões.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label htmlFor="evidence-verify" className="text-meta font-medium">
                Verificar artefato
              </label>
              <Textarea
                id="evidence-verify"
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Cole aqui o conteúdo integral do arquivo .md exportado…"
                className="min-h-[120px] font-mono text-meta"
              />
              <div className="flex flex-wrap items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${STATUS_TONE[verificacao.status]}`} aria-hidden />
                <span className={`text-meta font-medium ${STATUS_TONE[verificacao.status]}`}>
                  {VERIFICATION_LABEL[verificacao.status]}
                </span>
                {verificacao.checksum !== '' && (
                  <Badge variant="outline" className="font-mono text-meta">
                    {verificacao.checksum}
                  </Badge>
                )}
                {conteudo !== '' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() => setConteudo('')}
                  >
                    <Copy className="h-3 w-3" aria-hidden /> Limpar
                  </Button>
                )}
              </div>
              {verificacao.matches.length > 0 && (
                <p className="text-meta text-muted-foreground">
                  Corresponde a {verificacao.matches.length} registro(s) — agente{' '}
                  <strong>{verificacao.matches[0].agentName}</strong>, exportado em{' '}
                  {formatDate(verificacao.matches[0].createdAt)}.
                </p>
              )}
            </div>

            {entries.length === 0 ? (
              <p className="text-meta text-muted-foreground">
                Nenhuma evidência exportada ainda. Use o simulador de prompt para gerar a primeira.
              </p>
            ) : (
              <ul className="space-y-2">
                {entries.slice(0, MAX_LISTED).map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium">{e.agentName}</p>
                      <p className="truncate text-meta text-muted-foreground">
                        {e.filename} · {formatDate(e.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {e.synthetic && <Badge variant="secondary">sintética</Badge>}
                      {e.skillsOverflow > 0 && (
                        <Badge variant="destructive">{e.skillsOverflow} cortadas</Badge>
                      )}
                      <Badge variant="outline" className="font-mono text-meta">
                        {e.checksum}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
