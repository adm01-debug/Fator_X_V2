/**
 * sketchService — persistência local de sketches (Excalidraw-lite) por nota.
 * Uma sketch é um array de strokes; cada stroke = pontos + cor + espessura.
 */
export interface SketchPoint { x: number; y: number }
export interface SketchStroke {
  color: string;
  width: number;
  points: SketchPoint[];
}
export interface SketchData {
  version: 1;
  strokes: SketchStroke[];
  updatedAt: string;
}

const KEY_PREFIX = "sc.sketch.";
export const SKETCH_EVENT = "cerebro:sketch-changed";

function keyOf(noteId: string) {
  return `${KEY_PREFIX}${noteId}`;
}

export function loadSketch(noteId: string): SketchData {
  if (!noteId) return { version: 1, strokes: [], updatedAt: new Date().toISOString() };
  try {
    const raw = localStorage.getItem(keyOf(noteId));
    if (!raw) return { version: 1, strokes: [], updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as SketchData;
    if (parsed && Array.isArray(parsed.strokes)) return parsed;
  } catch {
    /* corrupt payload — start fresh */
  }
  return { version: 1, strokes: [], updatedAt: new Date().toISOString() };
}

export function saveSketch(noteId: string, data: SketchData) {
  if (!noteId) return;
  try {
    const payload: SketchData = { ...data, version: 1, updatedAt: new Date().toISOString() };
    localStorage.setItem(keyOf(noteId), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(SKETCH_EVENT, { detail: { noteId } }));
  } catch {
    /* quota / privacy mode — ignora silenciosamente */
  }
}

export function clearSketch(noteId: string) {
  if (!noteId) return;
  try {
    localStorage.removeItem(keyOf(noteId));
    window.dispatchEvent(new CustomEvent(SKETCH_EVENT, { detail: { noteId } }));
  } catch {
    /* noop */
  }
}
