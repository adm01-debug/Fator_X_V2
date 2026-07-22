import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlackOnboardingWizard } from "../SlackOnboardingWizard";

const verifyMutate = vi.fn();

vi.mock("@/hooks/useSlackConfig", () => ({
  useSlackConfig: () => ({
    verifyConnection: { mutate: verifyMutate, isPending: false },
    isConfigured: false,
  }),
}));

describe("SlackOnboardingWizard", () => {
  beforeEach(() => {
    verifyMutate.mockClear();
    window.localStorage.clear();
  });

  it("renderiza passo 1 por padrão", () => {
    render(<SlackOnboardingWizard />);
    expect(screen.getByText(/Onboarding Slack/i)).toBeInTheDocument();
    expect(screen.getByText(/Escopos mínimos/i)).toBeInTheDocument();
  });

  it("avança e volta entre passos", () => {
    render(<SlackOnboardingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(screen.getByText(/SLACK_BOT_TOKEN/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));
    expect(screen.getByText(/Escopos mínimos/i)).toBeInTheDocument();
  });

  it("dispara verifyConnection no passo 3", () => {
    render(<SlackOnboardingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Verificar conexão/i }));
    expect(verifyMutate).toHaveBeenCalledTimes(1);
  });
});
