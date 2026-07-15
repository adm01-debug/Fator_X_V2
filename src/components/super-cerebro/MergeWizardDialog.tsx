/**
 * Merge Wizard — permite ao usuário revisar um cluster de duplicatas,
 * escolher qual entrada será a canônica, desmarcar falsos positivos
 * e editar o conteúdo final antes de aplicar o merge.
 */
import { useMemo, useState } from "react";
import { Loader2, GitMerge, Crown, ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  mergeEntitiesManually,
  type EntityCluster,
  type EntityCandidate,
} from "@/services/entityResolutionService";

interface MergeWizardDialogProps {
  cluster: EntityCluster | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

type Step = 1 | 2 | 3;

export function MergeWizardDialog({ cluster, open, onOpenChange, onCompleted }: MergeWizardDialogProps) {
  const allEntries = useMemo<EntityCandidate[]>(
    () => (cluster ? [cluster.canonical, ...cluster.duplicates] : []),
    [cluster]
  );

  const [step, setStep] = useState<Step>(1);
  const [canonicalId, setCanonicalId] = useState<string>("");
  const [selectedDupIds, setSelectedDupIds] = useState<Set<string>>(new Set());
  const [canonicalContent, setCanonicalContent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Reinicia estado quando um novo cluster é aberto
  useMemo(() => {
    if (open && cluster) {
      const initialCanonical = cluster.canonical.id;
      setStep(1);
      setCanonicalId(initialCanonical);
      setSelectedDupIds(new Set(cluster.duplicates.map((d) => d.id)));
      setCanonicalContent(cluster.canonical.content);
    }
  }, [open, cluster]);

  if (!cluster) return null;

  const canonical = allEntries.find((e) => e.id === canonicalId) ?? cluster.canonical;
  const originalCanonicalContent = canonical.content;
  const duplicatesToDelete = allEntries.filter(
    (e) => e.id !== canonicalId && selectedDupIds.has(e.id)
  );
  const keptAsOther = allEntries.filter(
    (e) => e.id !== canonicalId && !selectedDupIds.has(e.id)
  );

  const toggleDup = (id: string) => {
    setSelectedDupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCanonicalChange = (id: string) => {
    setCanonicalId(id);
    const entry = allEntries.find((e) => e.id === id);
    if (entry) setCanonicalContent(entry.content);
    // Todo mundo exceto o novo canônico volta a ser candidato a duplicata
    setSelectedDupIds(new Set(allEntries.filter((e) => e.id !== id).map((e) => e.id)));
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const { updated, deleted } = await mergeEntitiesManually({
        canonicalId,
        canonicalContent: canonicalContent.trim(),
        duplicateIds: Array.from(selectedDupIds),
        originalContent: originalCanonicalContent,
      });
      toast.success(
        `Merge concluído — ${deleted} duplicata(s) removida(s)${updated ? " • canônica atualizada" : ""}`
      );
      onOpenChange(false);
      onCompleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao mesclar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            Merge Wizard — Passo {step} de 3
          </DialogTitle>
          <DialogDescription className="text-meta">
            {step === 1 && "Escolha qual entrada será mantida como canônica."}
            {step === 2 && "Marque quais entradas são realmente duplicatas. Desmarque falsos positivos."}
            {step === 3 && "Revise e edite o conteúdo final antes de aplicar o merge."}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1 — escolha do canônico */}
        {step === 1 && (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {allEntries.map((entry) => {
                const isSelected = entry.id === canonicalId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleCanonicalChange(entry.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? "bg-nexus-emerald/10 border-nexus-emerald/50"
                        : "bg-secondary/20 border-border/40 hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isSelected ? (
                        <Badge className="text-[9px] bg-nexus-emerald/20 text-nexus-emerald border-nexus-emerald/50">
                          <Crown className="h-2.5 w-2.5 mr-1" /> Canônica
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px]">
                          Candidata
                        </Badge>
                      )}
                      {entry.source && (
                        <span className="text-meta text-muted-foreground">{entry.source}</span>
                      )}
                      <span className="text-meta text-muted-foreground ml-auto">
                        {entry.content.length} chars
                      </span>
                    </div>
                    <p className="text-meta text-foreground whitespace-pre-wrap line-clamp-3">
                      {entry.content}
                    </p>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* STEP 2 — seleção de duplicatas */}
        {step === 2 && (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {allEntries
                .filter((e) => e.id !== canonicalId)
                .map((entry) => {
                  const checked = selectedDupIds.has(entry.id);
                  return (
                    <label htmlFor="mergewizarddialog-field-8ebad0"
                      key={entry.id}
                      className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? "bg-destructive/5 border-destructive/40"
                          : "bg-secondary/20 border-border/40 hover:bg-secondary/40"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleDup(entry.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              checked ? "border-destructive/50 text-destructive" : ""
                            }`}
                          >
                            {checked ? "Será apagada" : "Mantida separada"}
                          </Badge>
                          {entry.source && (
                            <span className="text-meta text-muted-foreground">{entry.source}</span>
                          )}
                        </div>
                        <p className="text-meta text-foreground whitespace-pre-wrap line-clamp-3">
                          {entry.content}
                        </p>
                      </div>
                    </label>
                  );
                })}
            </div>
          </ScrollArea>
        )}

        {/* STEP 3 — revisão e edição */}
        {step === 3 && (
          <div className="space-y-3">
            <div>
              <p className="text-meta font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <Crown className="h-3 w-3 text-nexus-emerald" /> Conteúdo canônico (editável)
              </p>
              <Textarea id="mergewizarddialog-field-8ebad0"
                value={canonicalContent}
                onChange={(e) => setCanonicalContent(e.target.value)}
                rows={8}
                className="text-body-sm font-mono"
              />
              <p className="text-meta text-muted-foreground mt-1">
                {canonicalContent.length} caracteres •{" "}
                {canonicalContent === originalCanonicalContent
                  ? "sem alterações"
                  : "conteúdo será atualizado"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="nexus-card py-2 px-3">
                <p className="text-meta text-muted-foreground uppercase tracking-wider">
                  Serão apagadas
                </p>
                <p className="text-title-sm font-bold text-destructive mt-0.5">
                  {duplicatesToDelete.length}
                </p>
              </div>
              <div className="nexus-card py-2 px-3">
                <p className="text-meta text-muted-foreground uppercase tracking-wider">
                  Mantidas separadas
                </p>
                <p className="text-title-sm font-bold text-nexus-amber mt-0.5">{keptAsOther.length}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          <div>
            {step > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as Step)}
                disabled={saving}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            {step < 3 ? (
              <Button
                size="sm"
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="gap-1.5"
              >
                Próximo <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={saving || duplicatesToDelete.length === 0}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Aplicar Merge
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
