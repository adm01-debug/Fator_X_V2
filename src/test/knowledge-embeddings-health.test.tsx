import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import KnowledgeManagementPage from "@/pages/KnowledgeManagementPage";

vi.mock("@/components/ui/tabs", () => {
  return {
    Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
    TabsTrigger: ({ children }: { children: React.ReactNode }) => (
      <button type="button" role="tab">
        {children}
      </button>
    ),
    TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("@/services/workspaceContextService", () => ({
  getCurrentUserWorkspace: vi.fn(async () => ({ id: "ws-1" })),
}));
vi.mock("@/services/knowledgeService", () => ({
  listKnowledgeBases: vi.fn(async () => []),
}));
vi.mock("@/services/knowledgeManagementService", async () => {
  const actual = await vi.importActual<typeof import("@/services/knowledgeManagementService")>(
    "@/services/knowledgeManagementService",
  );
  return {
    ...actual,
    getEmbeddingHealth: vi.fn(async () => ({ pending: 7, failed_retryable: 3, dead_letter: 1 })),
    listDeadLetterChunks: vi.fn(async () => [
      {
        id: "ch-1",
        document_id: "doc-9",
        chunk_index: 4,
        embed_attempts: 5,
        embed_last_error: "provedor sem chave",
        embed_last_attempt_at: null,
        content: "Trecho orfao da busca",
      },
    ]),
    retryDeadLetterChunk: vi.fn(async () => ({})),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe("Embedding health tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra os tres contadores de chunks sem vetor", async () => {
    render(<KnowledgeManagementPage />, { wrapper });
    expect(await screen.findByText(/Sa.de dos embeddings/)).toBeInTheDocument();
    expect(screen.getByText("Na fila")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Travados (dead-letter)")).toBeInTheDocument();
  });

  it("lista o chunk travado e devolve para a fila", async () => {
    const svc = await import("@/services/knowledgeManagementService");
    render(<KnowledgeManagementPage />, { wrapper });
    expect(await screen.findByText(/Trecho orfao da busca/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reprocessar/ }));
    await waitFor(() => expect(svc.retryDeadLetterChunk).toHaveBeenCalledWith("ch-1"));
  });
});