/**
 * VaultSyncPanel — exporta o notebook ativo como zip compatível com Obsidian
 * e importa vaults (.zip com arquivos .md + frontmatter) para dentro do
 * notebook selecionado.
 */
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Loader2, FileArchive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  exportNotebookToVault,
  importVaultZip,
  downloadBlob,
} from "@/services/vaultSyncService";

export function VaultSyncPanel() {
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const { workspaceId } = useCurrentWorkspace();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "export" | "import">("idle");

  async function handleExport() {
    if (!activeNotebookId) return toast.error("Selecione um notebook.");
    setBusy("export");
    try {
      const { data: col } = await supabaseExternal
        .from("collections")
        .select("name")
        .eq("id", activeNotebookId)
        .maybeSingle();
      const name = (col?.name as string) ?? "vault";
      const blob = await exportNotebookToVault(activeNotebookId, name);
      const ts = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `${name}-${ts}.zip`);
      toast.success("Vault exportado com sucesso");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setBusy("idle");
    }
  }

  async function handleImport(file: File) {
    if (!activeNotebookId || !workspaceId) return toast.error("Selecione um notebook.");
    setBusy("import");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      const r = await importVaultZip(file, workspaceId, activeNotebookId, uid);
      qc.invalidateQueries({ queryKey: ["notes", activeNotebookId] });
      if (r.errors.length) {
        toast.warning(`Importadas ${r.imported}, puladas ${r.skipped}`, {
          description: r.errors.slice(0, 3).join(" · "),
        });
      } else {
        toast.success(`${r.imported} nota(s) importada(s)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setBusy("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-body">
          <FileArchive className="h-4 w-4" /> Sincronização com Obsidian Vault
          <Badge variant="outline" className="ml-2 font-normal">.md + frontmatter</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-sm text-muted-foreground">
          Exporta o notebook ativo como um <code>.zip</code> de arquivos <code>.md</code>
          {" "}compatíveis com Obsidian (wikilinks, tags e frontmatter preservados). Ou
          importa um vault existente para dentro deste notebook.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport} disabled={busy !== "idle" || !activeNotebookId}>
            {busy === "export" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Exportar notebook
          </Button>

          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== "idle" || !activeNotebookId}
          >
            {busy === "import" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Importar .zip
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
        </div>

        <ul className="text-meta text-muted-foreground space-y-1 pt-2 border-t border-border/40">
          <li>• Nomes de arquivo sanitizados; colisões recebem sufixo <code>(2)</code>, <code>(3)</code>…</li>
          <li>• Frontmatter YAML preserva tags, datas e propriedades customizadas</li>
          <li>• Import ignora arquivos fora de <code>.md</code> ou maiores que 2 MB</li>
          <li>• Inserção em lotes de 100 respeitando limites do PostgREST</li>
        </ul>
      </CardContent>
    </Card>
  );
}
