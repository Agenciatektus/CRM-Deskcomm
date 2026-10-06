import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const postMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

const showApiErrorMock = vi.fn();
vi.mock("@/components/feedback/ApiErrorToast", () => ({
  showApiError: (...args: unknown[]) => showApiErrorMock(...args),
}));

import { SnoozeButton } from "@/components/inbox/SnoozeButton";

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

/**
 * O "Lembrar depois" virou popover com horários calculados no fuso de quem
 * clica. O relógio é FALSO (só `Date`; os timers seguem reais para o
 * react-query): o rótulo "Hoje 18:00" depende da hora, e um teste com o relógio
 * de verdade passaria de manhã e reprovaria à noite.
 */
function abrir() {
  fireEvent.click(screen.getByRole("button", { name: "Lembrar depois" }));
}

function corpo(chamada: unknown[]) {
  return chamada[1] as { snooze_until?: string; duration_hours?: number };
}

beforeEach(() => {
  postMock.mockReset();
  deleteMock.mockReset();
  showApiErrorMock.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("SnoozeButton", () => {
  it("de tarde, mostra os horários e 'Hoje 18:00' manda o instante exato à rota", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 14, 10));
    postMock.mockResolvedValue({ data: { snooze_until: "x" } });

    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    abrir();

    expect(await screen.findByRole("button", { name: /Em 1 hora\s*15:10/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Amanhã\s*09:00/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Em 1 semana/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hoje\s*18:00/ }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0]![0]).toBe("/api/v1/conversations/conv-1/snooze");
    expect(corpo(postMock.mock.calls[0]!)).toEqual({ snooze_until: new Date(2026, 9, 6, 18, 0).toISOString() });
  });

  it("depois das 18h, não oferece Hoje e o segundo lugar é Amanhã 09:00", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 19, 30));
    postMock.mockResolvedValue({ data: { snooze_until: "x" } });

    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    abrir();

    await screen.findByRole("button", { name: /Em 1 hora\s*20:30/ });
    expect(screen.queryByRole("button", { name: /Hoje/ })).toBeNull();
    const amanha = screen.getAllByRole("button", { name: /Amanhã\s*09:00/ });
    expect(amanha, "Amanhã 9:00 aparece uma vez só, sem repetição").toHaveLength(1);
    fireEvent.click(amanha[0]!);
    await waitFor(() =>
      expect(corpo(postMock.mock.calls[0]!)).toEqual({ snooze_until: new Date(2026, 9, 7, 9, 0).toISOString() }),
    );
  });

  it("Escolher data e hora abre o calendário dentro do popover", async () => {
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Escolher data e hora" }));
    expect(screen.getByRole("group", { name: "Escolher data e horário" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lembrar neste horário" })).toBeDisabled();
  });

  it("com lembrete ativo: o nome acessível diz quando, e 'Cancelar lembrete' chama o DELETE", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 14, 10));
    deleteMock.mockResolvedValue(undefined);
    const futureIso = new Date(2026, 9, 6, 18, 0).toISOString();

    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={futureIso} />));
    const botao = screen.getByRole("button", { name: "Lembrete ativo: Hoje 18:00" });
    expect(screen.queryByRole("button", { name: "Lembrar depois" })).toBeNull();
    fireEvent.click(botao);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar lembrete" }));

    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/snooze"),
    );
  });

  it("disabled prop desabilita o botão", () => {
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} disabled />));
    expect(screen.getByRole("button", { name: "Lembrar depois" })).toBeDisabled();
  });

  it("erro na mutation chama showApiError", async () => {
    postMock.mockRejectedValue(new Error("falhou"));

    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Em 1 hora/ }));

    await waitFor(() => expect(showApiErrorMock).toHaveBeenCalled());
  });
});
