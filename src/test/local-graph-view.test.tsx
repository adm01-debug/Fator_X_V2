/**
 * LocalGraphView — testes de render, empty state, cap visual e clique.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocalGraphView } from "@/components/super-cerebro/notebook/LocalGraphView";

const setActiveNote = vi.fn();

vi.mock("@/stores/cerebroStore", () => ({
  useCerebroStore: (selector: (s: { setActiveNote: typeof setActiveNote }) => unknown) =>
    selector({ setActiveNote }),
}));

const backlinksMock = vi.fn();
const outgoingMock = vi.fn();
const noteMock = vi.fn();

vi.mock("@/services/notesService", () => ({
  useNote: (id: string) => noteMock(id),
  useBacklinks: (t: string, id: string) => backlinksMock(t, id),
  useOutgoingLinks: (id: string) => outgoingMock(id),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  noteMock.mockReturnValue({ data: { id: "n1", title: "Nota Central" } });
});

describe("LocalGraphView", () => {
  it("mostra empty state quando não há links", () => {
    backlinksMock.mockReturnValue({ data: [] });
    outgoingMock.mockReturnValue({ data: [] });
    wrap(<LocalGraphView noteId="n1" />);
    expect(screen.getByText(/Sem links ainda/i)).toBeInTheDocument();
  });

  it("renderiza nó central e periféricos in/out", () => {
    backlinksMock.mockReturnValue({
      data: [{ id: "b1", source_id: "src1", source_type: "note", source_title: "Backlink A" }],
    });
    outgoingMock.mockReturnValue({
      data: [{ id: "o1", target_id: "tgt1", target_type: "note", target_label: "Out A" }],
    });
    wrap(<LocalGraphView noteId="n1" />);
    expect(screen.getByText("Nota Central")).toBeInTheDocument();
    expect(screen.getByText("Backlink A")).toBeInTheDocument();
    expect(screen.getByText("Out A")).toBeInTheDocument();
  });

  it("clique em nó backlink chama setActiveNote com source_id", () => {
    backlinksMock.mockReturnValue({
      data: [{ id: "b1", source_id: "src1", source_type: "note", source_title: "Backlink A" }],
    });
    outgoingMock.mockReturnValue({ data: [] });
    const { container } = wrap(<LocalGraphView noteId="n1" />);
    const circles = container.querySelectorAll("circle.cursor-pointer");
    expect(circles.length).toBe(1);
    fireEvent.click(circles[0]);
    expect(setActiveNote).toHaveBeenCalledWith("src1");
  });

  it("respeita cap visual de 25 nós", () => {
    backlinksMock.mockReturnValue({
      data: Array.from({ length: 100 }, (_, i) => ({
        id: `b${i}`,
        source_id: `src${i}`,
        source_type: "note",
        source_title: `Nó ${i}`,
      })),
    });
    outgoingMock.mockReturnValue({ data: [] });
    const { container } = wrap(<LocalGraphView noteId="n1" />);
    const circles = container.querySelectorAll("circle");
    // até 25 periféricos + 1 central
    expect(circles.length).toBeLessThanOrEqual(26);
  });

  it("trunca labels longos", () => {
    backlinksMock.mockReturnValue({
      data: [{
        id: "b1",
        source_id: "s1",
        source_type: "note",
        source_title: "Este é um título extremamente longo",
      }],
    });
    outgoingMock.mockReturnValue({ data: [] });
    wrap(<LocalGraphView noteId="n1" />);
    expect(screen.getByText(/…/)).toBeInTheDocument();
  });
});
