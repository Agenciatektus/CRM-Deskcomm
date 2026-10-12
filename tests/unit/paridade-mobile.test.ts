/**
 * PARIDADE MOBILE — o critério de pronto da M5 do app de celular (PWA).
 *
 * Lê o protótipo aprovado (`docs/design/mobile/MobileVerdash.dc.html`, versão 37) e
 * compara com o CRM: tokens dos dois temas, medidas da barra inferior, cabeçalho grande,
 * linha da lista, folha inferior, FAB, área segura, alvos de 44px e campos de 16px.
 * O contrato de ONDE cada peça mora no CRM está em `paridade-mobile/contrato.ts`.
 *
 * DOIS MODOS:
 * - RELATÓRIO (padrão, fase M0 a M4): as telas ainda não existem. O teste calcula todas
 *   as divergências e as imprime, sem reprovar. Só reprova se o LEITOR do protótipo
 *   quebrar (valor que sumiu) ou se o próprio protótipo ferir a regra de toque.
 * - ESTRITO (`PARIDADE_MOBILE_ESTRITA=1`): cada grupo reprova listando o que diverge.
 *   É o critério de pronto da M5. Para rodar:
 *     PARIDADE_MOBILE_ESTRITA=1 pnpm vitest run tests/unit/paridade-mobile.test.ts
 *   Na M5, o modo estrito vira o padrão: troque `ESTRITO` para `true` fixo.
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

const ESTRITO = process.env.PARIDADE_MOBILE_ESTRITA === "1";

/** id da divergência -> motivo. Só entra o que o Peterson aceitou. */
export const EXCECOES: Record<string, string> = {};

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
