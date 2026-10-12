/**
 * P2-1 do Cassio na #169: UM cookie de preferência do menu por navegador. Quem
 * mexe sobrescreve; o cookie de outro atendente é ignorado (valem os padrões).
 */
import { describe, expect, it } from "vitest";

import {
  COOKIE_DO_MENU,
  escreverPreferenciaDoMenu,
  lerPreferenciaDoMenu,
  menuRecolhido,
} from "@/lib/navigation/preferencia-do-menu";

describe("preferência do menu num cookie só", () => {
  it("o nome do cookie é fixo (não leva o id do usuário)", () => {
    expect(COOKIE_DO_MENU).toBe("menu_do_atendente");
  });

  it("escreve e lê de volta para o mesmo atendente", () => {
    const v = escreverPreferenciaDoMenu("u-1", { recolhidoGeral: true, fixoNaInbox: false });
    expect(v).toBe("u-1:10");
    expect(lerPreferenciaDoMenu(v, "u-1")).toEqual({ recolhidoGeral: true, fixoNaInbox: false });
  });

  it("CONTROLE: o cookie de outro atendente não vale para mim", () => {
    const v = escreverPreferenciaDoMenu("u-1", { recolhidoGeral: true, fixoNaInbox: true });
    expect(lerPreferenciaDoMenu(v, "u-2")).toBeNull();
  });

  it("valor malformado ou ausente devolve null", () => {
    expect(lerPreferenciaDoMenu(undefined, "u-1")).toBeNull();
    expect(lerPreferenciaDoMenu("u-1:2", "u-1")).toBeNull();
    expect(lerPreferenciaDoMenu("1", "u-1")).toBeNull();
  });

  it("na Inbox recolhe a menos que fixada; fora dela vale a escolha geral", () => {
    expect(menuRecolhido({ pathname: "/app/inbox", recolhidoGeral: false, fixoNaInbox: false })).toBe(true);
    expect(menuRecolhido({ pathname: "/app/inbox/c1", recolhidoGeral: false, fixoNaInbox: true })).toBe(false);
    expect(menuRecolhido({ pathname: "/app/leads", recolhidoGeral: true, fixoNaInbox: false })).toBe(true);
  });
});
