import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chaveDoFiltroLembrado } from "@/lib/inbox/filtros-salvos";

import { useFiltroLembrado } from "./useFiltroLembrado";

const USER = "11111111-1111-4111-8111-111111111111";
const CHAVE = chaveDoFiltroLembrado(USER);

beforeEach(() => window.localStorage.clear());

describe("useFiltroLembrado", () => {
  it("restaura o último filtro quando a URL não trouxe nenhum", () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, { search: "" }, restaurar));
    expect(restaurar).toHaveBeenCalledWith({ onlyUnread: true });
  });

  it("filtro vindo de link manda: nada é restaurado e o novo é o lembrado", () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, { search: "", semPasso: true }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(CHAVE) as string)).toEqual({ semPasso: true });
  });

  it.each(["{", '{"onlyUnread":"sim"}', '{"x":1}', "[]"])("valor inválido %s é ignorado", (valor) => {
    window.localStorage.setItem(CHAVE, valor);
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, { search: "" }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
  });

  it("o filtro de outro usuário não vaza", () => {
    window.localStorage.setItem(chaveDoFiltroLembrado("outro"), JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, { search: "" }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
  });

  it("limpar (estado sem filtro) apaga o lembrado", () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ onlyUnread: true }));
    const { rerender } = renderHook(({ aux }) => useFiltroLembrado(USER, aux, () => undefined), {
      initialProps: { aux: { search: "", onlyUnread: true } as { search: string; onlyUnread: boolean } },
    });
    expect(window.localStorage.getItem(CHAVE)).not.toBeNull();
    rerender({ aux: { search: "", onlyUnread: false } });
    expect(window.localStorage.getItem(CHAVE)).toBeNull();
  });
});
