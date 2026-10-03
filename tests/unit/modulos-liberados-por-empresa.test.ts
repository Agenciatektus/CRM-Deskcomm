/**
 * A liberação por empresa (9026) só recorta os módulos que a exigem.
 *
 * O risco que este teste segura é o de ALCANCE: se `filtrarPelaLiberacao`
 * passasse a olhar todo módulo, `crm_b2b` e `propostas` sumiriam das empresas
 * que já usam, no mesmo deploy, sem ninguém ter revogado nada.
 */
import { describe, expect, it } from "vitest";

import { MODULOS_OPCIONAIS } from "@/lib/instalacao/modulos";
import {
  MODULOS_LIBERADOS_POR_EMPRESA,
  exigeLiberacao,
  filtrarPelaLiberacao,
} from "@/lib/organizacao/modulos-liberados";

describe("módulos liberados por empresa", () => {
  it("módulo que exige liberação só aparece para a empresa liberada", () => {
    expect(filtrarPelaLiberacao(["prospeccao"], [])).toEqual([]);
    expect(filtrarPelaLiberacao(["prospeccao"], ["prospeccao"])).toEqual(["prospeccao"]);
  });

  it("módulo antigo passa direto, com ou sem linha de liberação", () => {
    const antigos = MODULOS_OPCIONAIS.filter((m) => !exigeLiberacao(m));
    expect(antigos.length).toBeGreaterThan(0);
    expect(filtrarPelaLiberacao(antigos, [])).toEqual(antigos);
  });

  it("liberação não liga o que está desligado na instalação", () => {
    expect(filtrarPelaLiberacao([], ["prospeccao"])).toEqual([]);
  });

  it("linha com nome desconhecido não abre nada", () => {
    expect(filtrarPelaLiberacao(["crm_b2b"], ["qualquer_coisa"])).toEqual(["crm_b2b"]);
  });

  it("todo módulo liberável é módulo da instalação", () => {
    for (const m of MODULOS_LIBERADOS_POR_EMPRESA) {
      expect(MODULOS_OPCIONAIS).toContain(m);
    }
  });
});
