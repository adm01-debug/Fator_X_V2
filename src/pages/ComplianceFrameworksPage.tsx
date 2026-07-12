/**
 * Compliance Frameworks & Controls — catálogo de frameworks (SOC2, ISO27001, LGPD…),
 * seus controles associados e evidências coletadas.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ShieldCheck, ListChecks, Loader2, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Framework = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  version: string | null;
  created_at: string;
};

type Control = {
  id: string;
  framework_id: string;
  code: string;
  category: string;
  title: string;
  description: string | null;
  evidence_type: string;
  auto_check_query: string | null;
  created_at: string;
};

export default function ComplianceFrameworksPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fwOpen, setFwOpen] = useState(false);
  const [ctrlOpen, setCtrlOpen] = useState(false);

  const { data: frameworks, isLoading } = useQuery({
    queryKey: ["compliance_frameworks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_frameworks")
        .select("*")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Framework[];
    },
  });

  const selected = useMemo(
    () => frameworks?.find((f) => f.id === selectedId) ?? frameworks?.[0] ?? null,
    [frameworks, selectedId],
  );

  const { data: controls } = useQuery({
    queryKey: ["compliance_controls", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_controls")
        .select("*")
        .eq("framework_id", selected!.id)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Control[];
    },
  });

  const createFramework = useMutation({
    mutationFn: async (input: Omit<Framework, "id" | "created_at">) => {
      const { error } = await supabase.from("compliance_frameworks").insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Framework criado");
      qc.invalidateQueries({ queryKey: ["compliance_frameworks"] });
      setFwOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createControl = useMutation({
    mutationFn: async (input: Omit<Control, "id" | "created_at">) => {
      const { error } = await supabase.from("compliance_controls").insert([input]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Controle adicionado");
      qc.invalidateQueries({ queryKey: ["compliance_controls", selected?.id] });
      setCtrlOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteControl = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("compliance_controls").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Controle removido");
      qc.invalidateQueries({ queryKey: ["compliance_controls", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    controls?.forEach((c) => c.category && set.add(c.category));
    return Array.from(set).sort();
  }, [controls]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Frameworks de Compliance"
        description="Catálogo de frameworks regulatórios, controles e evidências (SOC2, ISO27001, LGPD, HIPAA)."
        
        actions={
          <Dialog open={fwOpen} onOpenChange={setFwOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo Framework</Button>
            </DialogTrigger>
            <FrameworkDialog onSubmit={(v) => createFramework.mutate(v)} pending={createFramework.isPending} />
          </Dialog>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !frameworks || frameworks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum framework cadastrado ainda.</p>
            <Button onClick={() => setFwOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Criar primeiro framework
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <Card>
            <CardHeader><CardTitle className="text-body">Frameworks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {frameworks.map((fw) => (
                <button
                  key={fw.id}
                  onClick={() => setSelectedId(fw.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected?.id === fw.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-body-sm">{fw.code}</span>
                    {fw.version && <Badge variant="outline" className="text-meta">v{fw.version}</Badge>}
                  </div>
                  <p className="text-meta text-muted-foreground mt-1 line-clamp-2">{fw.name}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selected.name}</CardTitle>
                    {selected.description && (
                      <p className="text-body-sm text-muted-foreground mt-1">{selected.description}</p>
                    )}
                  </div>
                  <Dialog open={ctrlOpen} onOpenChange={setCtrlOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="mr-2 h-4 w-4" />Controle</Button>
                    </DialogTrigger>
                    <ControlDialog
                      frameworkId={selected.id}
                      categories={categories}
                      onSubmit={(v) => createControl.mutate(v)}
                      pending={createControl.isPending}
                    />
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="controls">
                  <TabsList>
                    <TabsTrigger value="controls">
                      <ListChecks className="mr-2 h-4 w-4" />
                      Controles ({controls?.length ?? 0})
                    </TabsTrigger>
                    <TabsTrigger value="meta"><FileText className="mr-2 h-4 w-4" />Detalhes</TabsTrigger>
                  </TabsList>
                  <TabsContent value="controls" className="mt-4">
                    {!controls || controls.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground text-body-sm">
                        Nenhum controle mapeado para este framework.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Título</TableHead>
                            <TableHead>Evidência</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {controls.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono text-meta">{c.code}</TableCell>
                              <TableCell>
                                {c.category ? <Badge variant="secondary">{c.category}</Badge> : "—"}
                              </TableCell>
                              <TableCell className="max-w-md">
                                <div className="font-medium text-body-sm">{c.title}</div>
                                {c.description && (
                                  <div className="text-meta text-muted-foreground line-clamp-2 mt-0.5">
                                    {c.description}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {c.evidence_type ? (
                                  <Badge variant="outline" className="text-meta">{c.evidence_type}</Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteControl.mutate(c.id)}
                                  disabled={deleteControl.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                  <TabsContent value="meta" className="mt-4 space-y-2 text-body-sm">
                    <div><span className="text-muted-foreground">Código:</span> <span className="font-mono">{selected.code}</span></div>
                    <div><span className="text-muted-foreground">Versão:</span> {selected.version ?? "—"}</div>
                    <div><span className="text-muted-foreground">Criado em:</span> {format(new Date(selected.created_at), "PPP", { locale: ptBR })}</div>
                    <div><span className="text-muted-foreground">Categorias detectadas:</span> {categories.length ? categories.join(", ") : "—"}</div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FrameworkDialog({
  onSubmit, pending,
}: {
  onSubmit: (v: { code: string; name: string; description: string | null; version: string | null }) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo Framework</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Código *</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SOC2, ISO27001, LGPD" />
        </div>
        <div>
          <Label>Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SOC 2 Type II" />
        </div>
        <div>
          <Label>Versão</Label>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2017" />
        </div>
        <div>
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!code || !name || pending}
          onClick={() => onSubmit({
            code, name,
            description: description || null,
            version: version || null,
          })}
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ControlDialog({
  frameworkId, categories, onSubmit, pending,
}: {
  frameworkId: string;
  categories: string[];
  onSubmit: (v: Omit<Control, "id" | "created_at">) => void;
  pending: boolean;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceType, setEvidenceType] = useState<string>("manual");

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo Controle</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Código *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CC6.1" />
          </div>
          <div>
            <Label>Tipo de Evidência</Label>
            <Select value={evidenceType} onValueChange={setEvidenceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="auto_query">Auto (SQL)</SelectItem>
                <SelectItem value="document">Documento</SelectItem>
                <SelectItem value="screenshot">Screenshot</SelectItem>
                <SelectItem value="log">Log</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Controle de acesso lógico" />
        </div>
        <div>
          <Label>Categoria</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Acesso, Criptografia, Backup…"
            list="cat-suggestions"
          />
          <datalist id="cat-suggestions">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!code || !title || pending}
          onClick={() => onSubmit({
            framework_id: frameworkId,
            code, title,
            category: category || "",
            description: description || null,
            evidence_type: evidenceType,
            auto_check_query: null,
          })}
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Adicionar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
