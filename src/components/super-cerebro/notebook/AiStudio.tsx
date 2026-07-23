/**
 * AiStudio — Resumo IA + Perguntas sugeridas para a nota ativa, usando
 * a Edge Function `cerebro-query` já existente (com citações [n]).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, HelpCircle, Loader2 } from "lucide-react";
import { CitedMarkdown } from "@/components/super-cerebro/CitedMarkdown";
import { supabase } from "@/integrations/supabase/client";
import { useNote } from "@/services/notesService";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface Citation {
  n: number;
  chunk_id: string;
  document_id: string | null;
  document_title: string;
  page: number | null;
  section: string | null;
  snippet: string;
  notebook_id: string | null;
  notebook_name: string | null;
}

interface CerebroResult {
  answer: string;
  citations: Citation[];
}

async function askCerebro(query: string, notebookId: string | null, sourceIds: string[]): Promise<CerebroResult> {
  const { data, error } = await supabase.functions.invoke("cerebro-query", {
    body: { query, notebook_id: notebookId, source_ids: sourceIds, stream: false },
  });
  if (error) throw error;
  return data as CerebroResult;
}

export function AiStudio({ noteId, notebookId }: { noteId: string; notebookId: string }) {
  const { data: note } = useNote(noteId);
  const [summary, setSummary] = useState<CerebroResult | null>(null);
  const [questions, setQuestions] = useState<CerebroResult | null>(null);
  const [loading, setLoading] = useState<"summary" | "questions" | null>(null);

  const run = async (kind: "summary" | "questions") => {
    if (!note) return;
    // Guard: exige conteúdo mínimo para evitar chamadas caras em notas vazias.
    if (!note.body_md || note.body_md.trim().length < 20) {
      toast.error("A nota precisa ter ao menos 20 caracteres para gerar resumo/perguntas.");
      return;
    }
    setLoading(kind);
    try {
      const query =
        kind === "summary"
          ? `Gere um resumo executivo em português (5-8 bullets) da nota "${note.title}", usando SOMENTE as fontes selecionadas. Cite trechos com [n] quando aplicável.`
          : `Liste 5 perguntas relevantes que ainda não têm resposta clara no material da nota "${note.title}". Use as fontes disponíveis e cite [n] quando referenciar algo.`;
      const result = await askCerebro(query, notebookId, [noteId]);
      if (kind === "summary") setSummary(result);
      else setQuestions(result);
    } catch (e) {
      logger.warn("aistudio.failed", { kind, error: e instanceof Error ? e.message : String(e) });
      toast.error("Falha ao consultar o Super Cérebro");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-3 space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-nexus-primary" /> Resumo IA
          </h4>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={loading === "summary"} onClick={() => run("summary")}>
            {loading === "summary" ? <Loader2 className="h-3 w-3 animate-spin" /> : summary ? "Regenerar" : "Gerar"}
          </Button>
        </div>
        {summary ? (
          <div className="text-xs bg-secondary/30 p-2 rounded border border-border/40">
            <CitedMarkdown text={summary.answer} citations={summary.citations} />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Gere um resumo executivo com citações da própria nota.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-nexus-secondary" /> Perguntas sugeridas
          </h4>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={loading === "questions"} onClick={() => run("questions")}>
            {loading === "questions" ? <Loader2 className="h-3 w-3 animate-spin" /> : questions ? "Regenerar" : "Gerar"}
          </Button>
        </div>
        {questions ? (
          <div className="text-xs bg-secondary/30 p-2 rounded border border-border/40">
            <CitedMarkdown text={questions.answer} citations={questions.citations} />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Descubra gaps e próximas perguntas de pesquisa.</p>
        )}
      </section>
    </div>
  );
}
