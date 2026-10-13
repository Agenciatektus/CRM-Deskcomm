import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { LARGURAS_PADRAO } from "./larguras";
import { PegadorDeColuna } from "./PegadorDeColuna";

function montar(coluna: "lista" | "painel" = "lista") {
  const confirmar = vi.fn();
  const restaurar = vi.fn();
  const mover = vi.fn();
  render(
    <PegadorDeColuna
      coluna={coluna}
      larguras={LARGURAS_PADRAO}
      cartaoRef={createRef<HTMLElement>()}
      comPainel
      mover={mover}
      confirmar={confirmar}
      restaurar={restaurar}
    />,
  );
  return { pegador: screen.getByRole("separator"), confirmar, restaurar, mover };
}

describe("PegadorDeColuna", () => {
  it("anuncia a largura e a faixa", () => {
    const { pegador } = montar();
    expect(pegador).toHaveAttribute("aria-valuenow", "340");
    expect(pegador).toHaveAttribute("aria-valuemin", "280");
    expect(pegador).toHaveAttribute("aria-orientation", "vertical");
  });

  it("setas movem a lista 8px, com Shift 40px", () => {
    const { pegador, confirmar } = montar();
    fireEvent.keyDown(pegador, { key: "ArrowRight" });
    expect(confirmar).toHaveBeenLastCalledWith("lista", 348);
    fireEvent.keyDown(pegador, { key: "ArrowLeft", shiftKey: true });
    expect(confirmar).toHaveBeenLastCalledWith("lista", 300);
  });

  it("no painel a seta para a esquerda alarga (o pegador fica à esquerda dele)", () => {
    const { pegador, confirmar } = montar("painel");
    fireEvent.keyDown(pegador, { key: "ArrowLeft" });
    expect(confirmar).toHaveBeenLastCalledWith("painel", 360);
  });

  it("Home vai ao mínimo; duplo clique e Enter voltam ao padrão", () => {
    const { pegador, confirmar, restaurar } = montar();
    fireEvent.keyDown(pegador, { key: "Home" });
    expect(confirmar).toHaveBeenLastCalledWith("lista", 280);
    fireEvent.doubleClick(pegador);
    fireEvent.keyDown(pegador, { key: "Enter" });
    expect(restaurar).toHaveBeenCalledTimes(2);
  });
});
