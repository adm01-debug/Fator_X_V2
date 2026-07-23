/**
 * E2EESyncPanel — UI para Wave M (sync criptografado ponta-a-ponta por notebook).
 *
 * Fluxo:
 *  1. Usuário define/confirma uma passphrase (fica somente na sessionStorage).
 *  2. "Exportar bundle" → decripta notas do notebook, cifra AES-GCM, baixa .json.
 *  3. "Importar bundle" → seleciona arquivo, decripta, mostra plano (insert/update/skip/conflict).
 *  4. Usuário marca quais conflitos sobrescrever; aplica reconciliação.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Lock, Unlock, Download, Upload, ShieldCheck, KeyRound, AlertTriangle } from "lucide-react";
import { ConflictResolver, type ResolvedConflict } from "@/components/super-cerebro/notebook/ConflictResolver";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useNotes } from "@/services/notesService";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildBundleFromNotebook,
  encryptBundle,
  decryptBundle,
  downloadBundle,
  readBundleFile,
  planReconciliation,
  applyReconciliation,
  getSessionPassphrase,
  setSessionPassphrase,
  clearSessionPassphrase,
  type BundlePayload,
  type ReconciliationPlan,
} from "@/services/e2eeService";
import { logger } from "@/lib/logger";

export function E2EESyncPanel() {
  const { workspaceId } = useCurrentWorkspace();
  const notebookId = useCerebroStore((s) => s.activeNotebookId);
  const { data: localNotes = [] } = useNotes(notebookId);
  const qc = useQueryClient();

  const [pass, setPass] = useState<string>(() => (notebookId ? getSessionPassphrase(notebookId) ?? "" : ""));
  const [confirmPass, setConfirmPass] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState<BundlePayload | null>(null);
  const [plan, setPlan] = useState<ReconciliationPlan | null>(null);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());

  const unlocked = notebookId ? !!getSessionPassphrase(notebookId) : false;

  if (!notebookId || !workspaceId) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Sync E2EE</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Selecione um notebook para gerenciar o sync criptografado.</p></CardContent>
      </Card>
    );
  }

  const savePassphrase = () => {
    if (pass.length < 8) { toast.error("A passphrase precisa ter ao menos 8 caracteres."); return; }
    if (pass !== confirmPass) { toast.error("As passphrases não conferem."); return; }
    setSessionPassphrase(notebookId, pass);
    setConfirmPass("");
    toast.success("Passphrase carregada na sessão. Nunca deixa este navegador.");
  };

  const forget = () => {
    clearSessionPassphrase(notebookId);
    setPass("");
    setConfirmPass("");
    setIncoming(null);
    setPlan(null);
    toast.success("Passphrase esquecida.");
  };

  const doExport = async () => {
    const secret = getSessionPassphrase(notebookId);
    if (!secret) { toast.error("Defina uma passphrase primeiro."); return; }
    setBusy(true);
    try {
      const payload = await buildBundleFromNotebook(notebookId);
      const bundle = await encryptBundle(payload, secret);
      downloadBundle(bundle);
      toast.success(`Bundle cifrado exportado (${payload.notes.length} notas).`);
    } catch (e) {
      logger.error("e2ee.export.failed", { error: e instanceof Error ? e.message : String(e) });
      toast.error(e instanceof Error ? e.message : "Falha ao exportar bundle.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const secret = getSessionPassphrase(notebookId);
    if (!secret) { toast.error("Defina a passphrase antes de importar."); return; }
    setBusy(true);
    try {
      const bundle = await readBundleFile(file);
      if (bundle.notebook_id !== notebookId) {
        toast.warning("Bundle foi exportado de outro notebook. Prosseguindo mesmo assim.");
      }
      const payload = await decryptBundle(bundle, secret);
      const localSlim = localNotes.map((n) => ({
        id: n.id, title: n.title, body_md: n.body_md, tags: n.tags ?? [], updated_at: n.updated_at, is_archived: n.is_archived,
      }));
      const rec = planReconciliation(payload, localSlim);
      setIncoming(payload);
      setPlan(rec);
      setOverwrite(new Set());
      toast.success(`Bundle decifrado: ${payload.notes.length} notas recebidas.`);
    } catch (e) {
      logger.error("e2ee.import.failed", { error: e instanceof Error ? e.message : String(e) });
      toast.error(e instanceof Error ? e.message : "Falha ao decifrar bundle.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!incoming || !plan) return;
    setBusy(true);
    try {
      const res = await applyReconciliation(incoming, plan, workspaceId, { overwriteConflictIds: overwrite });
      toast.success(`Sync aplicado: +${res.inserted} novas, ~${res.updated} atualizadas, ${res.skipped} mantidas.`);
      await qc.invalidateQueries({ queryKey: ["notes", notebookId] });
      setIncoming(null);
      setPlan(null);
      setOverwrite(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar reconciliação.");
    } finally {
      setBusy(false);
    }
  };

  const toggleOverwrite = (id: string) => {
    setOverwrite((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Sync E2EE por notebook</AlertTitle>
        <AlertDescription>
          O bundle é cifrado no seu navegador com AES-GCM 256 derivado por PBKDF2-SHA256 (250k iterações).
          A passphrase <strong>nunca</strong> sai desta máquina — se você a esquecer, o bundle é irrecuperável.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Passphrase da sessão
            {unlocked ? (
              <Badge variant="default" className="ml-2 gap-1"><Unlock className="h-3 w-3" /> Ativa</Badge>
            ) : (
              <Badge variant="outline" className="ml-2 gap-1"><Lock className="h-3 w-3" /> Bloqueado</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e2ee-pass" className="text-xs">Passphrase</Label>
              <Input id="e2ee-pass" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="mínimo 8 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e2ee-confirm" className="text-xs">Confirmar</Label>
              <Input id="e2ee-confirm" type="password" autoComplete="off" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="repita" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={savePassphrase} disabled={busy}>Carregar na sessão</Button>
            <Button size="sm" variant="outline" onClick={forget} disabled={busy || !unlocked}>Esquecer</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Exportar bundle cifrado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Empacota <strong>{localNotes.length}</strong> nota{localNotes.length === 1 ? "" : "s"} deste notebook em um arquivo JSON cifrado.
            </p>
            <Button size="sm" onClick={doExport} disabled={!unlocked || busy}>Exportar agora</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Importar bundle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} disabled={!unlocked || busy} />
            <p className="text-xs text-muted-foreground">
              O arquivo é decifrado localmente. Você revisa o plano antes de aplicar.
            </p>
          </CardContent>
        </Card>
      </div>

      {plan && incoming && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plano de reconciliação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="default">Inserir: {plan.toInsert.length}</Badge>
              <Badge variant="secondary">Atualizar: {plan.toUpdate.length}</Badge>
              <Badge variant="outline">Manter local: {plan.toKeep.length}</Badge>
              <Badge variant="destructive">Conflitos: {plan.conflicts.length}</Badge>
            </div>

            {plan.conflicts.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-nexus-amber" />
                    Conflitos — marque para sobrescrever com a versão recebida
                  </div>
                  <div className="space-y-1 max-h-72 overflow-auto pr-1">
                    {plan.conflicts.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 rounded border border-border/50 p-2 text-xs hover:bg-secondary/30 cursor-pointer">
                        <Checkbox checked={overwrite.has(c.id)} onCheckedChange={() => toggleOverwrite(c.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{c.title_local}</div>
                          <div className="text-muted-foreground">
                            local: {new Date(c.updated_local).toLocaleString()} · recebida: {new Date(c.updated_incoming).toLocaleString()}
                          </div>
                          {c.title_incoming !== c.title_local && (
                            <div className="text-muted-foreground truncate">título recebido: <em>{c.title_incoming}</em></div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={apply} disabled={busy}>Aplicar reconciliação</Button>
              <Button size="sm" variant="outline" onClick={() => { setPlan(null); setIncoming(null); setOverwrite(new Set()); }} disabled={busy}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
