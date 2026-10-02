import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O BASELINE SE APLICA COM PRAZO DE TRAVA (migration 9025).
 *
 * O `pg_dump` abre o arquivo com `SET lock_timeout = 0` — esperar por lock para
 * sempre. Como é um `SET` dentro do arquivo, ele vence qualquer `PGOPTIONS` que
 * quem aplica tenha passado: o `PGOPTIONS="-c lock_timeout=5s"` do roteiro de
 * deploy era decorativo. Com 0, a DDL que disputa lock com o app no ar não falha,
 * entra na FILA, e toda consulta seguinte à mesma tabela fila atrás dela. Foi o
 * que produziu os deadlocks dos redeploys de 30/09 e 01/10/2026 em horário
 * comercial.
 *
 * Com prazo, a DDL desiste com "canceling statement due to lock timeout", e o
 * `reaplicar_baseline` do kit (hostgator-setup-kit/_common.sh) já classifica
 * "lock timeout" como disputa e reaplica o arquivo, que é idempotente.
 *
 * Este teste guarda as três pontas: o prazo existe e é curto, nada adiante o
 * zera, e a retentativa do kit reconhece a mensagem que o Postgres emite.
 */
const RAIZ = path.resolve(__dirname, "../..");
const BASELINE = readFileSync(path.join(RAIZ, "supabase/baseline.sql"), "utf8");
const COMMON = readFileSync(path.join(RAIZ, "hostgator-setup-kit/_common.sh"), "utf8");

/** Linhas que são SQL (sem comentário de linha inteira). */
const linhasDeSql = BASELINE.split("\n")
  .map((l, i) => ({ n: i + 1, l: l.trim() }))
  .filter(({ l }) => l !== "" && !l.startsWith("--"));

const AJUSTE_DE_TRAVA = /^(set\s+lock_timeout\b|select\s+(pg_catalog\.)?set_config\(\s*'lock_timeout')/i;

describe("o baseline.sql se aplica com lock_timeout curto", () => {
  it("o arquivo foi lido (controle negativo)", () => {
    expect(BASELINE.length).toBeGreaterThan(500_000);
    expect(BASELINE).toContain("public.organizations");
  });

  it("o primeiro ajuste de lock_timeout vem ANTES da primeira DDL e é entre 1 e 10 s", () => {
    const primeiroAjuste = linhasDeSql.find(({ l }) => AJUSTE_DE_TRAVA.test(l));
    const primeiraDdl = linhasDeSql.find(({ l }) => /^(create|alter|drop|grant|revoke|do)\b/i.test(l));
    expect(primeiroAjuste, "o baseline não ajusta lock_timeout").toBeDefined();
    expect(primeiraDdl).toBeDefined();
    expect(primeiroAjuste!.n).toBeLessThan(primeiraDdl!.n);

    const valor = primeiroAjuste!.l.match(/'(\d+)\s*(ms|s)'/i);
    expect(valor, `prazo sem unidade legível: ${primeiroAjuste!.l}`).not.toBeNull();
    const ms = Number(valor![1]) * (valor![2]!.toLowerCase() === "s" ? 1000 : 1);
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThanOrEqual(10_000);
  });

  it("nenhuma linha adiante volta o lock_timeout para 0 (esperar para sempre)", () => {
    const zeradas = linhasDeSql
      .filter(({ l }) => AJUSTE_DE_TRAVA.test(l))
      .filter(({ l }) => /(=|to|,)\s*'?0'?\s*(;|,|\))/i.test(l))
      .map(({ n, l }) => `${n}: ${l}`);
    expect(zeradas).toEqual([]);
  });

  it("a isca do zero é reprovada (controle positivo do filtro acima)", () => {
    const iscas = ["SET lock_timeout = 0;", "set lock_timeout to '0';", "select set_config('lock_timeout', '0', false);"];
    for (const isca of iscas) {
      expect(AJUSTE_DE_TRAVA.test(isca), isca).toBe(true);
      expect(/(=|to|,)\s*'?0'?\s*(;|,|\))/i.test(isca), isca).toBe(true);
    }
  });

  it("a retentativa do kit reconhece a mensagem real do Postgres como disputa", () => {
    const m = COMMON.match(/^BASELINE_ERROS_DE_DISPUTA='([^']+)'/m);
    expect(m, "BASELINE_ERROS_DE_DISPUTA não encontrado em _common.sh").not.toBeNull();
    const disputa = new RegExp(m![1]!, "i");
    expect(disputa.test("ERROR:  canceling statement due to lock timeout")).toBe(true);
    expect(disputa.test('ERROR:  relation "x" does not exist')).toBe(false);
  });
});
