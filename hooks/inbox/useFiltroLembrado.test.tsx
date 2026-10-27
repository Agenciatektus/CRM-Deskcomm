import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chaveDoFiltroLembrado } from "@/lib/inbox/filtros-salvos";

import { useFiltroLembrado } from "./useFiltroLembrado";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const CHAVE = chaveDoFiltroLembrado(USER, ORG);

beforeEach(() => window.localStorage.clear());

describe("useFiltroLembrado", () => {
  it("restaura o último filtro quando a URL não trouxe nenhum", () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, ORG, { search: "" }, restaurar));
    expect(restaurar).toHaveBeenCalledWith({ onlyUnread: true });
  });

  it("filtro vindo de link manda: nada é restaurado e o novo é o lembrado", () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, ORG, { search: "", semPasso: true }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(CHAVE) as string)).toEqual({ semPasso: true });
  });

  it.each(["{", '{"onlyUnread":"sim"}', '{"x":1}', "[]"])("valor inválido %s é ignorado", (valor) => {
    window.localStorage.setItem(CHAVE, valor);
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, ORG, { search: "" }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
  });

  it("o filtro de outro usuário não vaza", () => {
    window.localStorage.setItem(chaveDoFiltroLembrado("outro", ORG), JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, ORG, { search: "" }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
  });

  it("o filtro de outra organização do mesmo usuário não vaza", () => {
    window.localStorage.setItem(chaveDoFiltroLembrado(USER, "outra-org"), JSON.stringify({ onlyUnread: true }));
    const restaurar = vi.fn();
    renderHook(() => useFiltroLembrado(USER, ORG, { search: "" }, restaurar));
    expect(restaurar).not.toHaveBeenCalled();
  });

  it("limpar (estado sem filtro) apaga o lembrado", () => {
    window.localStorage.setItem(CHAVE, JSON.stringify({ onlyUnread: true }));
    const { rerender } = renderHook(({ aux }) => useFiltroLembrado(USER, ORG, aux, () => undefined), {
      initialProps: { aux: { search: "", onlyUnread: true } as { search: string; onlyUnread: boolean } },
    });
    expect(window.localStorage.getItem(CHAVE)).not.toBeNull();
    rerender({ aux: { search: "", onlyUnread: false } });
    expect(window.localStorage.getItem(CHAVE)).toBeNull();
  });
});
