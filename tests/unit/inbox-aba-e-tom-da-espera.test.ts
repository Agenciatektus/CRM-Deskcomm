/**
 * Duas réguas puras da lista de conversas (visual v2, fase 3.1).
 *
 * `abaDosFiltros` é o inverso de `tabToFilter`: a lista escolhe o texto do vazio
 * pela aba DERIVADA do objeto que foi ao servidor. O teste é de ida e volta por
 * TODA aba e nos três estados do automático, porque a Fila muda de forma quando
 * a org não tem agente no ar (`comandosDaFila`) e é aí que um inverso escrito à
 * mão confundiria Fila com Automático.
 *
 * `tomDaEspera` decide a cor da pílula de espera: os limiares são fronteiras, e
 * fronteira se testa dos dois lados.
 */
import { describe, expect, it } from "vitest";

import { tabToFilter } from "@/components/inbox/InboxLayout";
import type { InboxTab } from "@/components/inbox/InboxFilters";
import { abaDosFiltros } from "@/lib/inbox/aba-dos-filtros";
import { tomDaEspera } from "@/lib/inbox/tom-da-espera";

const ABAS: InboxTab[] = ["unassigned", "mine", "all", "closed", "archived", "ai"];

describe("abaDosFiltros é o inverso de tabToFilter", () => {
  for (const automatico of [true, false, undefined]) {
    for (const aba of ABAS) {
      it(`${aba} (automático da org: ${String(automatico)})`, () => {
        expect(abaDosFiltros(tabToFilter(aba, automatico))).toBe(aba);
      });
    }
  }
});

describe("tomDaEspera", () => {
  const agora = new Date("2026-10-06T12:00:00Z");
  const ha = (min: number) => new Date(agora.getTime() - min * 60_000).toISOString();

  it("sem dado não afirma urgência", () => {
    expect(tomDaEspera(null, agora)).toBe("info");
  });
  it("abaixo de 10 min é info; 10 min já é atenção", () => {
    expect(tomDaEspera(ha(9.9), agora)).toBe("info");
    expect(tomDaEspera(ha(10), agora)).toBe("warn");
  });
  it("abaixo de 30 min é atenção; 30 min já é crítico", () => {
    expect(tomDaEspera(ha(29.9), agora)).toBe("warn");
    expect(tomDaEspera(ha(30), agora)).toBe("crit");
    expect(tomDaEspera(ha(600), agora)).toBe("crit");
  });
});
