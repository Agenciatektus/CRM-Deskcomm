/**
 * O LAÇO DA 9031 (trg_organizacao_nao_muda em TODA tabela de `public` com
 * `organization_id`) TEM QUE FICAR DEPOIS DO ÚLTIMO `create table` DO BASELINE.
 *
 * O laço lê o catálogo no momento em que roda. Tabela criada DEPOIS dele nasce sem a
 * trava que impede a linha de trocar de organização, e numa instalação nova de uma
 * passada só ela fica assim até o primeiro `update.sh`. O CI não vê: ele aplica o
 * baseline em `install` e depois em `update`, e a segunda passada conserta.
 *
 * Origem: curadoria dev → master de 24/10/2026 (P2-1 do Cassio). Um apêndice (a 9068)
 * foi movido para antes da varredura de anon e arrastou o bloco da 9031 junto, para o
 * meio do arquivo: três tabelas passaram a ficar depois dele.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const BASELINE = join(process.cwd(), "supabase", "baseline.sql");
const MARCA_9031 = "-- ---- a linha não troca de organização em NENHUMA tabela de public (migration 9031) ----";

describe("baseline.sql: o laço da 9031 vem depois de toda tabela", () => {
  const sql = readFileSync(BASELINE, "utf8");

  it("o bloco da 9031 existe uma vez só", () => {
    expect(sql.split(MARCA_9031).length - 1).toBe(1);
  });

  it("nenhum `create table` aparece depois do bloco da 9031", () => {
    const depois = sql.slice(sql.indexOf(MARCA_9031) + MARCA_9031.length);
    const tabelas = [...depois.matchAll(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gim)].map((m) => m[1]);
    expect(
      tabelas,
      "Tabela criada DEPOIS do laço da 9031 nasce sem trg_organizacao_nao_muda numa instalação nova. " +
        "Devolva o bloco da 9031 para o FIM do arquivo (ele não cria função, então não briga com a varredura de anon).",
    ).toEqual([]);
  });
});
