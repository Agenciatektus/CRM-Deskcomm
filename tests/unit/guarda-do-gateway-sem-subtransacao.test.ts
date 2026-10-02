import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PACOTE SEGURO DE BANCO (migration 9025) — o que dá para provar sem Postgres.
 *
 * A prova de comportamento da guarda mora em
 * `tests/invariants/guarda-contra-replay-do-gateway.test.ts` (precisa de Docker).
 * Aqui fica o que o ARQUIVO garante e que o banco de teste não pegaria sozinho:
 *
 * - a ÚLTIMA definição da guarda no baseline (é a que o banco instala) não tem
 *   bloco `exception` — em plpgsql todo bloco com EXCEPTION abre subtransação na
 *   entrada, e esta função roda antes de TODA requisição do PostgREST;
 * - ela não usa `pg_input_is_valid` (pg16) nem cast de JSON — o piso é pg15, e lá
 *   a função seria criada e falharia em toda requisição;
 * - a regex que extrai o `sb-request-id` casa os casos certos (exercitada aqui
 *   com o motor do JS; a sintaxe usada — classes, `\s`, quantificadores, grupo —
 *   tem o mesmo significado no motor do Postgres);
 * - os dois índices sem leitor da `event_log` não são mais CRIADOS no corpo
 *   do dump (senão todo deploy os recriaria) e o apêndice os derruba;
 * - o índice da fila `queued` está no apêndice com o predicado certo.
 */
const RAIZ = path.resolve(__dirname, "../..");
const BASELINE = readFileSync(path.join(RAIZ, "supabase/baseline.sql"), "utf8");

function ultimaDefinicao(nome: string): string {
  const inicio = BASELINE.toLowerCase().lastIndexOf(`create or replace function public.${nome}(`);
  expect(inicio, `${nome} não está no baseline`).toBeGreaterThan(-1);
  const corpoAbre = BASELINE.indexOf("$$", inicio);
  const corpoFecha = BASELINE.indexOf("$$", corpoAbre + 2);
  return BASELINE.slice(inicio, corpoFecha + 2);
}

const GUARDA = ultimaDefinicao("fn_pgrst_recusar_replay_do_gateway");
const codigo = GUARDA.split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("9025 — a guarda do gateway não abre subtransação", () => {
  it("a última definição é a da 9025 (controle: mediu a função certa)", () => {
    expect(GUARDA).toContain("sb-request-id");
    expect(GUARDA).toContain("PT409");
    expect(BASELINE.lastIndexOf("(migration 9025) ----")).toBeLessThan(
      BASELINE.lastIndexOf("create or replace function public.fn_pgrst_recusar_replay_do_gateway("),
    );
  });

  it("não tem bloco exception", () => {
    expect(codigo).not.toMatch(/\bexception\s+when\b/i);
  });

  it("não usa pg_input_is_valid (pg16) nem cast para json/jsonb", () => {
    expect(codigo).not.toMatch(/pg_input_is_valid/i);
    expect(codigo).not.toMatch(/::\s*jsonb?\b/i);
  });

  it("o 1º controle negativo pega a versão antiga (0250), que tinha os dois", () => {
    // sonda-do-baseline: primeira-de-proposito — controle negativo: a definição morta (0250) TEM de reprovar nos critérios acima.
    const primeira = BASELINE.indexOf("create or replace function public.fn_pgrst_recusar_replay_do_gateway(");
    const antiga = BASELINE.slice(primeira, BASELINE.indexOf("$$;", primeira));
    expect(antiga).toMatch(/\bexception\s+when\b/i);
    expect(antiga).toMatch(/::jsonb/);
  });
});

describe("9025 — a regex do sb-request-id", () => {
  const literal = GUARDA.match(/from\s+'([^']+)'/);
  const re = new RegExp(literal?.[1] ?? "(?!)");
  const extrai = (headers: string | null) => (headers ?? "").match(re)?.[1] ?? null;
  const v7 = "01a08690-28dd-73b2-a7a5-823fb6f76ab1";

  it("a regex foi achada no corpo", () => {
    expect(literal).not.toBeNull();
  });

  it("cabeçalho ausente, vazio ou fora de JSON não extrai nada (a guarda passa)", () => {
    expect(extrai(null)).toBeNull();
    expect(extrai("")).toBeNull();
    expect(extrai("isto não é json")).toBeNull();
    expect(extrai('{"sb-request-id": ')).toBeNull();
  });

  it("id que não é UUIDv7 não extrai (v4, formato livre, maiúsculas, número)", () => {
    expect(extrai(JSON.stringify({ "sb-request-id": "01a08690-28dd-43b2-a7a5-823fb6f76ab1" }))).toBeNull();
    expect(extrai(JSON.stringify({ "sb-request-id": "req-abc-123" }))).toBeNull();
    expect(extrai(JSON.stringify({ "sb-request-id": v7.toUpperCase() }))).toBeNull();
    expect(extrai('{"sb-request-id":12345}')).toBeNull();
  });

  it("UUIDv7 como valor da chave é extraído, no JSON compacto e com espaços", () => {
    expect(extrai(JSON.stringify({ accept: "*/*", "sb-request-id": v7 }))).toBe(v7);
    expect(extrai(`{"sb-request-id" : "${v7}", "x": "y"}`)).toBe(v7);
  });

  it("a chave escrita DENTRO do valor de outro cabeçalho não casa", () => {
    const forjado = JSON.stringify({ "x-forjado": `"sb-request-id":"${v7}"` });
    expect(forjado).toContain('\\"sb-request-id\\"');
    expect(extrai(forjado)).toBeNull();
  });
});

describe("9025 — índices", () => {
  it("o corpo do dump não cria mais os dois índices sem leitor da event_log", () => {
    expect(BASELINE).not.toMatch(/create index[^;]*"?event_log_consumed_by_gin"?/i);
    expect(BASELINE).not.toMatch(/create index[^;]*"?event_log_dead_idx"?/i);
  });

  it("o apêndice os derruba onde ainda existem", () => {
    expect(BASELINE).toMatch(/drop index if exists public\.event_log_consumed_by_gin;/);
    expect(BASELINE).toMatch(/drop index if exists public\.event_log_dead_idx;/);
  });

  it("o índice da fila queued está no apêndice, parcial em status = 'queued'", () => {
    expect(BASELINE).toMatch(
      /create index if not exists idx_messages_queued_created\s+on public\.messages \(created_at\)\s+where status = 'queued';/,
    );
  });
});
