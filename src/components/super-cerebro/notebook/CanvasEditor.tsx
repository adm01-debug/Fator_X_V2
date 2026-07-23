/**
 * CanvasEditor — whiteboard freeform (estilo Obsidian Canvas) construído em
 * cima de reactflow. Persiste nodes/edges/viewport em `notebook_canvases`
 * com autosave debounced. Suporta 3 tipos de nó (nota linkada, texto livre,
 * imagem) e atalhos Del/Ctrl+D/Esc.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
  ReactFlowProvider,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, StickyNote, Type, Image as ImageIcon, Save, Trash2, FileText } from "lucide-react";
import { useCanvas, useUpdateCanvas, type CanvasNodeData, type CanvasEdgeData } from "@/services/canvasesService";
import { useNotes } from "@/services/notesService";
import { useCerebroStore } from "@/stores/cerebroStore";

interface Props {
  canvasId: string;
  notebookId: string;
}

const AUTOSAVE_MS = 900;

function nodeStyle(type: string): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    fontSize: 12,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--card-foreground))",
    minWidth: 160,
    maxWidth: 260,
    boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,.06))",
  };
  if (type === "note") return { ...base, borderColor: "hsl(var(--nexus-primary))" };
  if (type === "image") return { ...base, padding: 4 };
  return base;
}

function InnerCanvas({ canvasId, notebookId }: Props) {
  const { data: canvas, isLoading } = useCanvas(canvasId);
  const { data: notes = [] } = useNotes(notebookId);
  const updateCanvas = useUpdateCanvas();
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [name, setName] = useState("");
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  // Hidrata do servidor
  useEffect(() => {
    if (!canvas) return;
    setName(canvas.name);
    setNodes(
      (canvas.nodes ?? []).map((n) => ({
        id: n.id,
        type: "default",
        position: n.position,
        data: { ...n.data, kind: n.type },
        style: nodeStyle(n.type),
      })),
    );
    setEdges(
      (canvas.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    );
    setViewport(canvas.viewport ?? { x: 0, y: 0, zoom: 1 });
    dirtyRef.current = false;
  }, [canvas]);

  const persist = useCallback(async () => {
    if (!canvas || savingRef.current) return;
    savingRef.current = true;
    try {
      const nodesPayload: CanvasNodeData[] = nodes.map((n) => ({
        id: n.id,
        type: (n.data?.kind as CanvasNodeData["type"]) ?? "text",
        position: n.position,
        data: {
          label: n.data?.label,
          body: n.data?.body,
          noteId: n.data?.noteId ?? null,
          imageUrl: n.data?.imageUrl ?? null,
          color: n.data?.color,
        },
      }));
      const edgesPayload: CanvasEdgeData[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === "string" ? e.label : undefined,
      }));
      await updateCanvas.mutateAsync({
        id: canvas.id,
        patch: { name, nodes: nodesPayload, edges: edgesPayload, viewport },
      });
      dirtyRef.current = false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar canvas");
    } finally {
      savingRef.current = false;
    }
  }, [canvas, nodes, edges, viewport, name, updateCanvas]);

  // Autosave debounced
  useEffect(() => {
    if (!canvas) return;
    if (!dirtyRef.current) return;
    const t = setTimeout(() => { void persist(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [canvas, nodes, edges, viewport, name, persist]);

  const markDirty = () => { dirtyRef.current = true; };

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    markDirty();
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    markDirty();
  }, []);
  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) =>
      addEdge({ ...c, id: crypto.randomUUID(), markerEnd: { type: MarkerType.ArrowClosed } }, eds),
    );
    markDirty();
  }, []);

  const addNode = (kind: CanvasNodeData["type"], extra?: Partial<CanvasNodeData["data"]>) => {
    const center = rfRef.current?.project({
      x: (window.innerWidth ?? 800) / 2 - 200,
      y: 200,
    }) ?? { x: 100, y: 100 };
    const label =
      kind === "note"
        ? (extra?.label ?? "Nota linkada")
        : kind === "image"
          ? "Imagem"
          : "Texto";
    const node: Node = {
      id: crypto.randomUUID(),
      type: "default",
      position: center,
      data: { kind, label, ...extra },
      style: nodeStyle(kind),
    };
    setNodes((nds) => [...nds, node]);
    markDirty();
  };

  const duplicateSelection = useCallback(() => {
    setNodes((nds) => {
      const selected = nds.filter((n) => n.selected);
      if (selected.length === 0) return nds;
      const clones: Node[] = selected.map((n) => ({
        ...n,
        id: crypto.randomUUID(),
        position: { x: n.position.x + 24, y: n.position.y + 24 },
        selected: false,
      }));
      markDirty();
      return [...nds.map((n) => ({ ...n, selected: false })), ...clones];
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicateSelection]);

  const noteOptions = useMemo(
    () => notes.map((n) => ({ id: n.id, title: n.title || "(sem título)" })),
    [notes],
  );

  if (isLoading || !canvas) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-border/50 bg-secondary/30">
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          className="h-8 text-xs max-w-[280px]"
          placeholder="Nome do canvas"
        />
        <div className="flex items-center gap-1 ml-2">
          <Button size="sm" variant="outline" onClick={() => addNode("text", { body: "" })} className="h-7 gap-1 text-xs">
            <Type className="h-3 w-3" /> Texto
          </Button>
          <Button size="sm" variant="outline" onClick={() => addNode("image", { imageUrl: "" })} className="h-7 gap-1 text-xs">
            <ImageIcon className="h-3 w-3" /> Imagem
          </Button>
          <select
            className="h-7 text-xs rounded-md border border-input bg-background px-2"
            onChange={(e) => {
              const noteId = e.target.value;
              if (!noteId) return;
              const n = noteOptions.find((x) => x.id === noteId);
              addNode("note", { noteId, label: n?.title ?? "Nota" });
              e.currentTarget.value = "";
            }}
            defaultValue=""
            aria-label="Adicionar nota como nó"
          >
            <option value="">+ Nota linkada…</option>
            {noteOptions.map((n) => (
              <option key={n.id} value={n.id}>{n.title}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {savingRef.current ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Salvando…</span>
          ) : dirtyRef.current ? (
            <span>Modificado</span>
          ) : (
            <span>Salvo</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => void persist()} className="h-7 gap-1 text-xs">
            <Save className="h-3 w-3" /> Salvar
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => { rfRef.current = inst; }}
          defaultViewport={viewport}
          onMoveEnd={(_, v) => { setViewport(v); markDirty(); }}
          onNodeDoubleClick={(_, node) => {
            const noteId = node.data?.noteId as string | undefined;
            if (noteId) setActiveNote(noteId);
          }}
          fitView={nodes.length > 0}
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[16, 16]}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <MiniMap pannable zoomable className="!bg-secondary/50" />
          <Controls className="!bg-card !border-border" />
        </ReactFlow>
      </div>

      {nodes.length === 0 && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="text-center max-w-sm p-6 rounded-lg bg-card/60 backdrop-blur border border-border/50 pointer-events-auto">
            <Plus className="h-6 w-6 mx-auto mb-2 text-nexus-primary" />
            <p className="text-xs text-muted-foreground">
              Canvas vazio. Use os botões acima para adicionar <StickyNote className="inline h-3 w-3" /> notas,{" "}
              <Type className="inline h-3 w-3" /> textos ou <ImageIcon className="inline h-3 w-3" /> imagens.
              Arraste para conectar; duplo-clique numa nota linkada abre-a no editor.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <div className="relative h-full">
        <InnerCanvas {...props} />
      </div>
    </ReactFlowProvider>
  );
}

export function CanvasEmpty() {
  return (
    <div className="h-full flex items-center justify-center text-center p-6">
      <div className="max-w-sm space-y-2">
        <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Selecione um canvas ao lado ou crie um novo. <Trash2 className="inline h-3 w-3" /> deleta a seleção,{" "}
          <code>Ctrl/⌘ + D</code> duplica.
        </p>
      </div>
    </div>
  );
}
