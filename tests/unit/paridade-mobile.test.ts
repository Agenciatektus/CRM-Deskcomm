/**
 * PARIDADE MOBILE — o critério de pronto da M5 do app de celular (PWA).
 *
 * Lê o protótipo aprovado (`docs/design/mobile/MobileVerdash.dc.html`, versão 37) e
 * compara com o CRM: tokens dos dois temas, medidas da barra inferior, cabeçalho grande,
 * linha da lista, folha inferior, FAB, área segura, alvos de 44px e campos de 16px.
 * O contrato de ONDE cada peça mora no CRM está em `paridade-mobile/contrato.ts`.
 *
 * DOIS MODOS:
 * - RELATÓRIO (`PARIDADE_MOBILE_ESTRITA=0`; padrão de M0 a M4): calcula todas
 *   as divergências e as imprime, sem reprovar. Só reprova se o LEITOR do protótipo
 *   quebrar (valor que sumiu) ou se o próprio protótipo ferir a regra de toque.
 * - ESTRITO (o PADRÃO desde a M5): cada grupo reprova listando o que diverge.
 *   O relatório volta com `PARIDADE_MOBILE_ESTRITA=0`.
 *
 * Exceção só pela lista `EXCECOES`, com motivo; exceção sem divergência também reprova
 * no estrito (a lista não pode envelhecer escondendo regressão).
 *
 * Controle negativo: `paridade-mobile-controle-negativo.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  divergenciasDaBarra,
  divergenciasDaBase,
  divergenciasDeCor,
  divergenciasDeMedida,
  divergenciasDePecas,
  divergenciasDeToque,
  divergenciasDoPrototipo,
} from "./paridade-mobile/divergencias";
import { abasDoPrototipo, medidasDoPrototipo, telasDoPrototipo } from "./paridade-mobile/leitor";

/**
 * Estrito por padrão desde a M5 (as 11 telas existem). `PARIDADE_MOBILE_ESTRITA=0`
 * volta ao relatório, para ver a lista inteira de uma vez ao trocar o protótipo.
 */
const ESTRITO = process.env.PARIDADE_MOBILE_ESTRITA !== "0";

/** id da divergência -> motivo. Só entra o que o Peterson aceitou. */
const VALE_O_DS_DESKTOP =
  "token compartilhado; vale o DS desktop; a divergência é do protótipo mobile (decisão do Peterson, 12/10/2026)";
export const EXCECOES: Record<string, string> = {
  "cor:claro:--info": VALE_O_DS_DESKTOP,
  "cor:claro:--ink-3": VALE_O_DS_DESKTOP,
  "cor:claro:--ok": VALE_O_DS_DESKTOP,
  "cor:claro:--warn": VALE_O_DS_DESKTOP,
};

const GRUPOS: [string, () => string[]][] = [
  ["cores dos dois temas (claro = marca do revendedor, escuro = pele Verdash)", divergenciasDeCor],
  ["medidas do app (tokens --mb-* no :root)", divergenciasDeMedida],
  ["base: corte de 760px, área segura, PWA instalável", divergenciasDaBase],
  ["barra inferior: 5 abas na ordem do protótipo", divergenciasDaBarra],
  ["peças e as 11 telas", divergenciasDePecas],
  ["toque: campos de 16px e alvos de 44px", divergenciasDeToque],
];

function semExcecao(divergencias: string[], usadas: Set<string>): string[] {
  return divergencias.filter((d) => {
    const id = d.split(" ")[0]!;
    if (id in EXCECOES) {
      usadas.add(id);
      return false;
    }
    return true;
  });
}

describe("paridade mobile — leitor do protótipo (sempre estrito)", () => {
  it("acha as 11 telas, as 5 abas e todas as medidas", () => {
    expect(telasDoPrototipo()).toHaveLength(11);
    expect(abasDoPrototipo()).toEqual(["Conversas", "Funil", "Tarefas", "Avisos", "Mais"]);
    const medidas = medidasDoPrototipo();
    expect(Object.values(medidas).every((v) => /^[\d.]+(px|%)?$/.test(v))).toBe(true);
    expect(medidas["--mb-abas-colunas"]).toBe("5");
  });

  it("o protótipo cumpre a própria regra: alvos de 44px e campos de 16px", () => {
    expect(divergenciasDoPrototipo()).toEqual([]);
  });
});

describe(`paridade mobile — ${ESTRITO ? "ESTRITO" : "relatório"}`, () => {
  const usadas = new Set<string>();

  it("relatório: todas as divergências de hoje", () => {
    const todas = GRUPOS.flatMap(([nome, fn]) =>
      semExcecao(fn(), new Set()).map((d) => `[${nome}] ${d}`),
    );
    if (!ESTRITO) {
      console.info(`paridade mobile: ${todas.length} divergência(s)\n${todas.join("\n")}`);
    }
    expect(Array.isArray(todas)).toBe(true);
  });

  for (const [nome, fn] of GRUPOS) {
    (ESTRITO ? it : it.skip)(`estrito: ${nome}`, () => {
      const resto = semExcecao(fn(), usadas);
      expect(resto, `divergências:\n${resto.join("\n")}`).toEqual([]);
    });
  }

  (ESTRITO ? it : it.skip)("estrito: toda exceção ainda corresponde a uma divergência real", () => {
    const sobrando = Object.keys(EXCECOES).filter((id) => !usadas.has(id));
    expect(sobrando, "exceção sem divergência: tire da lista").toEqual([]);
  });
});
