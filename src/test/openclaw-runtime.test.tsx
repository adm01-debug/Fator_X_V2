import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import OpenclawDeployPage from "@/pages/OpenclawDeployPage";
import * as openclawService from "@/services/openclawDeployService";

vi.mock("@/services/openclawDeployService", () => ({
  getOpenclawHealth: vi.fn().mockResolvedValue({ status: "ok", version: "1.2.3", uptime: 42 }),
  listOpenclawAgents: vi.fn().mockResolvedValue([
    { id: "a1", name: "Nexus", description: "Agente principal", status: "active" },
  ]),
  listOpenclawSkills: vi.fn().mockResolvedValue([
    { id: "s1", name: "bitrix24", version: "1.0.0", description: "CRM" },
  ]),
  deploySkillToOpenclaw: vi.fn(),
  chatWithOpenclawAgent: vi.fn().mockResolvedValue({ data: { reply: "olá" } }),
}));


function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <OpenclawDeployPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OpenclawDeployPage (Runtime OpenClaw)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o título Runtime OpenClaw", async () => {
    renderPage();
    expect(await screen.findByText(/Runtime OpenClaw/i)).toBeInTheDocument();
  });

  it("mostra saúde do runtime após carregar", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/ok/i).length).toBeGreaterThan(0);
    });
  });

  it("lista agents retornados pelo service", async () => {
    renderPage();
    // Abrir a aba Agents (label contém "Agents (1)")
    expect(await screen.findByText(/Agents \(1\)/i)).toBeInTheDocument();
  });

  it("expõe a aba Console de teste", async () => {
    renderPage();
    expect(await screen.findByRole("tab", { name: /Console/i })).toBeInTheDocument();
  });
});
