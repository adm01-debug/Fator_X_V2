/**
 * SlackOnboardingWizard — Fase 5
 * Wizard 3 passos: (1) criar app Slack, (2) configurar secrets, (3) verificar.
 * Persistência do passo em localStorage para sobreviver a refresh.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSlackConfig } from "@/hooks/useSlackConfig";

const STORAGE_KEY = "slack.onboarding.step";
const STEPS = [
  { id: 1, label: "Criar app Slack" },
  { id: 2, label: "Configurar secrets" },
  { id: 3, label: "Verificar conexão" },
] as const;

export function SlackOnboardingWizard() {
  const { verifyConnection, isConfigured } = useSlackConfig();
  const [step, setStep] = useState<number>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const n = saved ? Number(saved) : 1;
    return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 1;
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(step));
  }, [step]);

  useEffect(() => {
    if (isConfigured) window.localStorage.removeItem(STORAGE_KEY);
  }, [isConfigured]);

  const go = (n: number) => setStep(Math.max(1, Math.min(3, n)));

  return (
    <Card className="border-nexus-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-nexus-primary" />
          Onboarding Slack
        </CardTitle>
        <CardDescription>
          Siga os 3 passos para conectar seu workspace Slack ao Nexus.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Stepper */}
        <ol
          className="grid grid-cols-3 gap-2"
          aria-label="Progresso do onboarding"
        >
          {STEPS.map((s) => {
            const active = s.id === step;
            const done = s.id < step;
            return (
              <li
                key={s.id}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "rounded-md border p-3 text-center text-meta sm:text-body-sm transition-colors",
                  active && "border-nexus-primary bg-nexus-primary/10",
                  done && "border-nexus-emerald/60 bg-nexus-emerald/5",
                  !active && !done && "border-border"
                )}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-nexus-emerald" />
                  ) : (
                    <Badge variant={active ? "default" : "outline"} className="h-5 w-5 rounded-full p-0 justify-center text-meta">
                      {s.id}
                    </Badge>
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Corpo do passo */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-body-sm text-muted-foreground">
              Acesse o painel do Slack e crie um novo app a partir do manifest fornecido pela documentação.
            </p>
            <Alert>
              <AlertTitle>Escopos mínimos</AlertTitle>
              <AlertDescription className="text-meta">
                <code>chat:write</code>, <code>channels:read</code>, <code>channels:history</code>, <code>users:read</code>, <code>app_mentions:read</code>, <code>im:history</code>
              </AlertDescription>
            </Alert>
            <Button asChild size="sm" variant="outline">
              <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">
                Abrir Slack API Console
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-body-sm text-muted-foreground">
              Copie o <b>Bot User OAuth Token</b> (começa com <code>xoxb-</code>) e o <b>Signing Secret</b> do painel do Slack e salve-os nos secrets do backend:
            </p>
            <ul className="text-body-sm space-y-1 list-disc pl-5">
              <li><code>SLACK_BOT_TOKEN</code></li>
              <li><code>SLACK_SIGNING_SECRET</code></li>
            </ul>
            <Alert>
              <AlertDescription className="text-meta">
                Se ainda não configurou, peça ao agente para abrir o formulário de secrets ou vá em <b>Backend → Edge Function Secrets</b>.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-body-sm text-muted-foreground">
              Clique em verificar. O Nexus chama <code>auth.test</code> no Slack e valida o token.
            </p>
            <Button
              onClick={() => verifyConnection.mutate()}
              disabled={verifyConnection.isPending}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", verifyConnection.isPending && "animate-spin")} />
              {verifyConnection.isPending ? "Verificando…" : "Verificar conexão"}
            </Button>
          </div>
        )}

        {/* Navegação */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go(step - 1)}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div className="text-meta text-muted-foreground">Passo {step} de 3</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go(step + 1)}
            disabled={step === 3}
          >
            Próximo
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
