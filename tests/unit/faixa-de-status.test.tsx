import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cancelMutate = vi.fn();
vi.mock("@/hooks/inbox/useSnoozeConversation", () => ({
  useSnoozeConversation: () => ({
    snooze: { mutate: vi.fn(), isPending: false },
    cancel: { mutate: cancelMutate, isPending: false },
  }),
}));

import { FaixaDeStatus } from "@/components/inbox/cabecalho/FaixaDeStatus";

/**
 * A FAIXA abaixo do cabeçalho: o tom da espera (régua 10/30 min de
 * `tom-da-espera`), o chip do lembrete e a origem. Relógio falso só no `Date`:
 * a régua é de minutos, e o teste não pode depender da hora em que roda.
 */
const AGORA = new Date(2026, 9, 6, 14, 0);
const menos = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();

function faixa(props: Partial<React.ComponentProps<typeof FaixaDeStatus>> = {}) {
  return render(
    <FaixaDeStatus
      janela={null}
      conversationId="conv-1"
      esperandoDesde={null}
      snoozeUntil={null}
      motivo={null}
      instagramEntrada={null}
      leitura={false}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  cancelMutate.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("FaixaDeStatus: espera", () => {
  it.each([
    [5, "info", "Esperando há 5m"],
    [12, "warn", "Esperando há 12m"],
    [45, "crit", "Esperando há 45m"],
  ])("%i min de espera tem tom %s", (min, tom, texto) => {
    faixa({ esperandoDesde: menos(min) });
    const pilula = screen.getByTestId("faixa-espera");
    expect(pilula).toHaveAttribute("data-tom", tom);
    expect(pilula.textContent).toBe(texto);
  });

  it("menos de um minuto não vira 'há agora mesmo'", () => {
    faixa({ esperandoDesde: new Date(AGORA.getTime() - 20_000).toISOString() });
    expect(screen.getByTestId("faixa-espera").textContent).toBe("Esperando agora");
  });

  it("ninguém esperando, nenhuma pílula", () => {
    faixa();
    expect(screen.queryByTestId("faixa-espera")).toBeNull();
  });
});

describe("FaixaDeStatus: lembrete", () => {
  it("lembrete ativo vira chip com o horário e o X cancela pela rota", () => {
    faixa({ snoozeUntil: new Date(2026, 9, 6, 18, 0).toISOString() });
    const chip = screen.getByTestId("faixa-lembrete");
    expect(chip.textContent).toMatch(/Lembrete:\s*Hoje 18:00/);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar lembrete" }));
    expect(cancelMutate).toHaveBeenCalledWith({ conversation_id: "conv-1" });
  });

  it("amanhã diz Amanhã, e lembrete vencido não aparece", () => {
    const { unmount } = faixa({ snoozeUntil: new Date(2026, 9, 7, 9, 0).toISOString() });
    expect(screen.getByTestId("faixa-lembrete").textContent).toMatch(/Amanhã 09:00/);
    unmount();
    faixa({ snoozeUntil: menos(5) });
    expect(screen.queryByTestId("faixa-lembrete")).toBeNull();
  });

  it("em modo leitura o chip informa, mas não cancela", () => {
    faixa({ snoozeUntil: new Date(2026, 9, 6, 18, 0).toISOString(), leitura: true });
    expect(screen.getByTestId("faixa-lembrete")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar lembrete" })).toBeNull();
  });
});

describe("FaixaDeStatus: origem e motivo", () => {
  it("Entrou por só com dado do payload; sem dado, não inventa", () => {
    const { unmount } = faixa({ instagramEntrada: "direct" });
    expect(screen.getByTestId("faixa-origem").textContent).toBe("Entrou por Direct do Instagram");
    unmount();
    faixa();
    expect(screen.queryByTestId("faixa-origem")).toBeNull();
  });

  it("o motivo do automático parado mantém o testid que as specs procuram", () => {
    faixa({ motivo: "Automático volta em instantes" });
    expect(screen.getByTestId("badge-atendimento-humano").textContent).toBe("Automático volta em instantes");
  });
});
