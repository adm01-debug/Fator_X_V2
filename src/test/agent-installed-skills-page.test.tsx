import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AgentInstalledSkillsPage from "@/pages/AgentInstalledSkillsPage";

const getSkillbook = vi.fn();
const reflectAndEvolve = vi.fn();
const pruneWeakSkills = vi.fn();

vi.mock("@/services/agentEvolutionService", () => ({
  getSkillbook: (id: string) => getSkillbook(id),
  reflectAndEvolve: (id: string) => reflectAndEvolve(id),
  pruneWeakSkills: (id: string) => pruneWeakSkills(id),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

// Radix Select depende de APIs de ponteiro que o jsdom não implementa.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type Kid = { children?: React.ReactNode };
  type Item = Kid & { value: string };
  type Sel = Kid & { value?: string; onValueChange?: (v: string) => void };
  const frag = ({ children }: Kid) => React.createElement(React.Fragment, null, children);
  return {
    Select: ({ value, onValueChange, children }: Sel) =>
      React.createElement(
        "select",
        {
          value,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value),
        },
        children,
      ),
    SelectTrigger: frag,
    SelectValue: ({ placeholder }: { placeholder?: string }) =>
      React.createElement("option", { value: "" }, placeholder ?? ""),
    SelectContent: frag,
    SelectItem: ({ value, children }: Item) =>
      React.createElement("option", { value }, children),
  };
});

function chain(result: unknown) {
  const p = Promise.resolve(result);
  const o: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "update", "delete"]) o[m] = () => o;
  o.then = p.then.bind(p);
  return o;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "agents") return chain({ data: [{ id: "ag-1", name: "Agente Um", avatar_emoji: null }], error: null });
      return chain({ data: [], error: null });
    },
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/agents/installed-skills"]}>
        <AgentInstalledSkillsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const skill = {
  id: "s1",
  agent_id: "ag-1",
  skill_name: "busca_web",
  description: "Buscar na web",
  pattern: "use duckduckgo",
  success_count: 8,
  failure_count: 2,
  confidence: 0.8,
  created_at: "",
  updated_at: "",
};

describe("AgentInstalledSkillsPage — skills aprendidas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSkillbook.mockResolvedValue([skill]);
    reflectAndEvolve.mockResolvedValue({
      agent_id: "ag-1",
      total_skills: 1,
      avg_confidence: 0.8,
      skills_discovered: [{ id: "s2" }],
      improvements_suggested: [],
      failure_patterns: [],
    });
    pruneWeakSkills.mockResolvedValue(2);
  });

  it("mostra o skillbook do agente escolhido, com confiança e taxa de acerto", async () => {
    renderPage();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "ag-1" } });

    expect(await screen.findByText("busca_web")).toBeInTheDocument();
    expect(screen.getByText(/confiança 80%/)).toBeInTheDocument();
    expect(screen.getByText("8/10 acertos")).toBeInTheDocument();
    expect(getSkillbook).toHaveBeenCalledWith("ag-1");
  });

  it("'Aprender agora' dispara a evolução e reporta quantas skills vieram", async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "ag-1" } });

    await user.click(await screen.findByRole("button", { name: /Aprender agora/ }));

    await waitFor(() => expect(reflectAndEvolve).toHaveBeenCalledWith("ag-1"));
    expect(toastSuccess).toHaveBeenCalledWith("1 skill(s) nova(s) aprendida(s)");
  });

  it("'Expurgar fracas' remove as skills de baixa confiança e reporta o total", async () => {
    const user = userEvent.setup();
    renderPage();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "ag-1" } });

    await user.click(await screen.findByRole("button", { name: /Expurgar fracas/ }));

    await waitFor(() => expect(pruneWeakSkills).toHaveBeenCalledWith("ag-1"));
    expect(toastSuccess).toHaveBeenCalledWith("2 skill(s) fraca(s) removida(s)");
  });

  it("mostra o erro do skillbook em vez de tela vazia", async () => {
    getSkillbook.mockRejectedValue(new Error("permission denied"));
    renderPage();

    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "ag-1" } });

    expect(await screen.findByText(/permission denied/)).toBeInTheDocument();
  });
});
