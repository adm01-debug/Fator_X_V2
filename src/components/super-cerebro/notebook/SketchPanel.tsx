/**
 * SketchPanel — canvas de desenho livre (Excalidraw-lite) por nota.
 * Suporta pointer events (mouse/touch/pen), undo/redo, limpar e export PNG.
 * Persistência local via sketchService.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Undo2, Redo2, Trash2, Download, Palette } from "lucide-react";
import {
  loadSketch,
  saveSketch,
  clearSketch,
  type SketchStroke,
} from "@/services/sketchService";
import { toast } from "sonner";

interface Props {
  noteId: string | null;
}

const COLORS = ["#0f172a", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];

export function SketchPanel({ noteId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<SketchStroke[]>([]);
  const [redoStack, setRedoStack] = useState<SketchStroke[]>([]);
  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState<number>(2.5);
  const drawingRef = useRef<SketchStroke | null>(null);

  // Carregar sketch ao trocar de nota
  useEffect(() => {
    if (!noteId) {
      setStrokes([]);
      setRedoStack([]);
      return;
    }
    const data = loadSketch(noteId);
    setStrokes(data.strokes);
    setRedoStack([]);
  }, [noteId]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = drawingRef.current ? [...strokes, drawingRef.current] : strokes;
    for (const s of all) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.stroke();
    }
  }, [strokes]);

  // Resize responsivo do canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!noteId) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = { color, width, points: [getPos(e)] };
    setRedoStack([]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(getPos(e));
    redraw();
  };

  const finishStroke = () => {
    const s = drawingRef.current;
    drawingRef.current = null;
    if (!s || s.points.length < 2) {
      redraw();
      return;
    }
    setStrokes((prev) => {
      const next = [...prev, s];
      if (noteId) saveSketch(noteId, { version: 1, strokes: next, updatedAt: new Date().toISOString() });
      return next;
    });
  };

  const undo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      setRedoStack((r) => [...r, last]);
      if (noteId) saveSketch(noteId, { version: 1, strokes: next, updatedAt: new Date().toISOString() });
      return next;
    });
  };

  const redo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      const nextRedo = r.slice(0, -1);
      setStrokes((prev) => {
        const next = [...prev, last];
        if (noteId) saveSketch(noteId, { version: 1, strokes: next, updatedAt: new Date().toISOString() });
        return next;
      });
      return nextRedo;
    });
  };

  const clearAll = () => {
    if (!noteId) return;
    if (strokes.length === 0) return;
    if (!window.confirm("Limpar o desenho desta nota?")) return;
    setStrokes([]);
    setRedoStack([]);
    clearSketch(noteId);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Renderiza contra fundo branco para PNG opaco
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      const url = out.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `sketch-${noteId ?? "nota"}.png`;
      a.click();
    } catch {
      toast.error("Falha ao exportar PNG");
    }
  };

  if (!noteId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Selecione uma nota para começar a desenhar.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 h-full">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={undo} disabled={strokes.length === 0} aria-label="Desfazer">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={redo} disabled={redoStack.length === 0} aria-label="Refazer">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={clearAll} disabled={strokes.length === 0} aria-label="Limpar">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportPng} aria-label="Exportar PNG">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1 pl-2 border-l border-border/50">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 pl-2 border-l border-border/50 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground">Espessura</span>
          <Slider
            value={[width]}
            onValueChange={(v) => setWidth(v[0] ?? 2)}
            min={1}
            max={10}
            step={0.5}
            className="w-24"
          />
          <span className="text-[10px] tabular-nums w-6">{width.toFixed(1)}</span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-[280px] rounded-md border border-border/60 bg-background overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerLeave={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Salvamento automático local · {strokes.length} traço{strokes.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
