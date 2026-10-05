import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NENHUMA ASSINATURA `postgres_changes` SAI SEM FILTRO (item 14 da auditoria).
 *
 * Sem filtro, o Realtime avalia a RLS de TODO evento da tabela — de todas as
 * organizações — para cada assinante: `realtime.list_changes` chegou a 35% do
 * tempo do banco. Toda assinatura passa por `useRealtimeChannel` (e dali por
 * `hooks/realtime/canaisCompartilhados.ts`); a topologia é o objeto
 * `postgresChanges` escrito no chamador. Esta varredura lê cada um e exige um
 * `filter` que seja SEMPRE uma igualdade montada (`coluna=eq.${...}`): nem
 * ausente, nem `cond ? ... : undefined` (a topologia sem filtro é a que vale
 * quando a condição falha — quem não tem o id não assina, com a topologia
 * inteira em `undefined`).
 *
 * Mutante conferido: voltar o acervo (`ai_knowledge_sources`) para a assinatura
 * sem filtro faz o segundo caso falhar apontando o arquivo.
 */

const RAIZ = join(__dirname, "..", "..");
const PASTAS = ["app", "hooks", "components", "lib"];

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    if (statSync(p).isDirectory()) saida.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** O objeto `{ ... }` mais interno que contém a posição. */
function objetoEm(texto: string, pos: number): string {
  let prof = 0;
  let ini = pos;
  for (; ini >= 0; ini--) {
    const c = texto[ini];
    if (c === "}") prof++;
    else if (c === "{") {
      if (prof === 0) break;
      prof--;
    }
  }
  prof = 0;
  let fim = pos;
  for (; fim < texto.length; fim++) {
    const c = texto[fim];
    if (c === "{") prof++;
    else if (c === "}") {
      if (prof === 0) break;
      prof--;
    }
  }
  return texto.slice(ini, fim + 1);
}

interface Assinatura {
  arquivo: string;
  tabela: string;
  objeto: string;
}

function assinaturas(): Assinatura[] {
  const achadas: Assinatura[] = [];
  for (const pasta of PASTAS) {
    for (const arq of arquivos(join(RAIZ, pasta))) {
      const texto = readFileSync(arq, "utf8");
      if (!texto.includes("postgresChanges")) continue;
      // Só o trecho de cada chamada `useRealtimeChannel({ ... })`.
      for (const m of texto.matchAll(/useRealtimeChannel\(\{/g)) {
        const corpo = objetoEm(texto, m.index! + "useRealtimeChannel({".length);
        for (const t of corpo.matchAll(/table:\s*"([a-z_]+)"/g)) {
          achadas.push({
            arquivo: relative(RAIZ, arq).replace(/\\/g, "/"),
            tabela: t[1]!,
            objeto: objetoEm(corpo, t.index!),
          });
        }
      }
    }
  }
  return achadas;
}

/**
 * O valor de `filter` tem de ser igualdade montada em TODO ramo: um template
 * `coluna=eq.${...}` ou um ternário entre dois deles. `undefined`/`null` em
 * qualquer ramo é assinatura sem filtro quando a condição falha.
 */
const FILTRO_MONTADO = {
  test(objeto: string): boolean {
    const m = /filter:\s*([^\n]+(?:\n\s*[?:][^\n]+)*)/.exec(objeto);
    if (!m) return false;
    const valor = m[1]!;
    if (/\bundefined\b|\bnull\b/.test(valor)) return false;
    const ramos = valor.split(/\s[?:]\s/).slice(valor.includes("?") ? 1 : 0);
    return ramos.length > 0 && ramos.every((r) => /^`[a-z_]+=eq\.\$\{[^}]+\}`/.test(r.trim()));
  },
};

describe("realtime: toda assinatura postgres_changes tem filtro", () => {
  const todas = assinaturas();

  it("a varredura acha as assinaturas (guarda de vacuidade)", () => {
    expect(todas.length).toBeGreaterThanOrEqual(12);
    expect(todas.map((a) => a.tabela)).toEqual(
      expect.arrayContaining(["messages", "conversations", "voice_calls", "ai_knowledge_sources"]),
    );
  });

  it("nenhuma sai sem filtro de igualdade montado", () => {
    const sem = todas.filter((a) => !FILTRO_MONTADO.test(a.objeto)).map((a) => `${a.arquivo} → ${a.tabela}`);
    expect(sem).toEqual([]);
  });

  it("a regra recusa os dois jeitos de ficar sem filtro", () => {
    expect(FILTRO_MONTADO.test('{ event: "*", table: "x" }')).toBe(false);
    expect(FILTRO_MONTADO.test("{ table: \"x\", filter: orgId ? `organization_id=eq.${orgId}` : undefined }")).toBe(false);
    expect(FILTRO_MONTADO.test("{ table: \"x\", filter: `organization_id=eq.${orgId}` }")).toBe(true);
    expect(
      FILTRO_MONTADO.test("{ table: \"x\", filter: orgId ? `organization_id=eq.${orgId}` : `conversation_id=eq.${c}`, }"),
    ).toBe(true);
  });
});
