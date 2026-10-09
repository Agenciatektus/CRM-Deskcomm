/**
 * A TRANSCRIÇÃO DO ÁUDIO NA BOLHA (`messages.media_derived_text`).
 *
 * O que se prende: aparece recolhida quando o worker deixou texto; abre e fecha
 * no clique; NÃO aparece sem texto, com o marcador de leitura que falhou (recado
 * para o agente, que na tela pareceria fala do cliente), em mídia que não é
 * áudio (descrição de imagem não é transcrição) nem em mensagem apagada.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MessageBubble } from "@/components/inbox/MessageBubble";
import { msg } from "@/components/inbox/__fixtures__/mensagem";
import { MARCADOR_NAO_LIDA, transcricaoDoAudio } from "@/lib/messaging/media/texto-derivado";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const FALA = "oi, queria saber se ainda tem o modelo azul";
const audio = (extra: Record<string, unknown> = {}) =>
  msg({ direction: "inbound", type: "audio", body: null, media_storage_path: "o/c/a.ogg", ...extra });

describe("transcrição do áudio na bolha", () => {
  it("com texto: aparece recolhida e abre/fecha no clique", async () => {
    render(<MessageBubble message={audio({ media_derived_text: FALA })} />);
    const botao = screen.getByRole("button", { name: "Mostrar transcrição" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(FALA)).not.toBeVisible();

    await userEvent.click(botao);
    expect(screen.getByRole("button", { name: "Ocultar transcrição" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(FALA)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Ocultar transcrição" }));
    expect(screen.getByText(FALA)).not.toBeVisible();
  });

  it("o player continua lá (a transcrição soma, não substitui)", () => {
    render(<MessageBubble message={audio({ media_derived_text: FALA })} />);
    expect(screen.getByRole("button", { name: "Reproduzir áudio" })).toBeInTheDocument();
  });

  it.each([
    ["sem texto (worker não rodou)", audio({ media_derived_text: null })],
    ["texto vazio", audio({ media_derived_text: "   " })],
    ["marcador de leitura que falhou", audio({ media_derived_text: MARCADOR_NAO_LIDA })],
    ["imagem com descrição", msg({ direction: "inbound", type: "image", body: null, media_storage_path: "o/c/a.jpg", media_derived_text: FALA })],
  ])("%s: nada de transcrição", (_nome, mensagem) => {
    render(<MessageBubble message={mensagem} />);
    expect(screen.queryByTestId("bolha-transcricao-do-audio")).toBeNull();
    expect(screen.queryByText(FALA)).toBeNull();
  });

  it("mensagem apagada não mostra a transcrição (seria o mesmo texto por outro caminho)", () => {
    render(<MessageBubble message={audio({ media_derived_text: FALA, revoked_at: "2026-10-06T10:00:00Z" })} />);
    expect(screen.queryByTestId("bolha-transcricao-do-audio")).toBeNull();
    expect(screen.queryByText(FALA)).toBeNull();
  });

  it("a regra pura: só áudio, com trim", () => {
    expect(transcricaoDoAudio({ type: "audio", media_derived_text: `  ${FALA}  ` })).toBe(FALA);
    expect(transcricaoDoAudio({ type: "document", media_derived_text: FALA })).toBeNull();
  });
});
