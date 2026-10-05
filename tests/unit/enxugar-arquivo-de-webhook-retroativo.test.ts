import { describe, expect, it } from "vitest";

import {
  type ClienteSql,
  limparArquivoDeWebhook,
  linhaEnxuta,
  SQL_VARREDURA,
} from "@/scripts/enxugar-arquivo-de-webhook-retroativo";

/**
 * A LIMPEZA RETROATIVA DO ARQUIVO DE WEBHOOK.
 *
 * O que estes casos vigiam é o que custou a segunda queda de 28/09: decidir
 * sem destostar, lote pequeno, `statement_timeout` dentro da transação, nada
 * gravado sem `--aplicar`, e UPDATE que não atropela linha alterada no meio.
 */

const TOKEN = "TOK-retroativo-55aa";
const MIDIA = "QUJD".repeat(30_000);

interface LinhaFalsa {
  id: string;
  received_at: string;
  raw_body: string | null;
  payload_parsed: unknown;
  headers: Record<string, string> | null;
}

function tam(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v.length : JSON.stringify(v).length;
}

function bancoFalso(linhas: LinhaFalsa[]) {
  const consultas: Array<{ sql: string; params?: unknown[] }> = [];
  const db: ClienteSql = {
    async query(sql: string, params?: unknown[]) {
      consultas.push({ sql, params });
      if (sql === SQL_VARREDURA) {
        const [, depoisDe, depoisId, limite] = params as [string, string, string, number];
        const rows = linhas
          .filter((l) => depoisDe === "-infinity" || `${l.received_at}|${l.id}` > `${depoisDe}|${depoisId}`)
          .slice(0, limite)
          .map((l) => ({
            id: l.id,
            received_at: l.received_at,
            tam_raw: tam(l.raw_body),
            tam_parsed: tam(l.payload_parsed),
            tam_headers: tam(l.headers),
          }));
        return { rows } as never;
      }
      if (/select id, raw_body, payload_parsed, headers/.test(sql)) {
        const ids = (params?.[0] as string[]) ?? [];
        return { rows: linhas.filter((l) => ids.includes(l.id)) } as never;
      }
      if (/^\s*update public\.webhook_events_log/.test(sql)) {
        const [id, raw, parsed, headers, tRaw] = params as [string, string, string, string, number];
        const l = linhas.find((x) => x.id === id);
        if (!l || tam(l.raw_body) !== tRaw) return { rows: [], rowCount: 0 };
        l.raw_body = raw;
        l.payload_parsed = parsed === null ? null : JSON.parse(parsed);
        l.headers = headers === null ? null : JSON.parse(headers);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] } as never;
    },
  };
  return { db, consultas };
}

function amostra(): LinhaFalsa[] {
  const out: LinhaFalsa[] = [];
  for (let i = 0; i < 25; i++) {
    const comToken = { type: "Message", token: TOKEN, event: { Info: { ID: `m${i}` } } };
    out.push({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      received_at: `2026-10-0${3 + (i % 3)}T10:00:${String(i).padStart(2, "0")}Z`,
      raw_body: JSON.stringify(comToken),
      payload_parsed: comToken,
      headers: { "content-type": "application/json" },
    });
  }
  const album = { album: { albumId: "A", role: "item" }, base64: MIDIA, token: TOKEN };
  out.push({
    id: "00000000-0000-0000-0000-000000000999",
    received_at: "2026-10-05T23:00:00Z",
    raw_body: JSON.stringify(album),
    payload_parsed: album,
    headers: { "content-type": "application/json" },
  });
  return out.sort((a, b) => `${a.received_at}|${a.id}`.localeCompare(`${b.received_at}|${b.id}`));
}

const BASE = { provider: "verdash", lote: 10, max: 1000, pausaMs: 1, statementTimeoutMs: 15_000, log: () => undefined, dormir: async () => undefined };

describe("linhaEnxuta", () => {
  it("linha limpa devolve null (idempotente)", () => {
    expect(linhaEnxuta({ id: "x", raw_body: '{"a":1}', payload_parsed: { a: 1 }, headers: { a: "b" } })).toBeNull();
  });
  it("tira token e mídia das três colunas", () => {
    const n = linhaEnxuta({
      id: "x",
      raw_body: JSON.stringify({ base64: MIDIA, token: TOKEN }),
      payload_parsed: { nested: { base64: MIDIA, token: TOKEN } },
      headers: { token: TOKEN, "content-type": "x" },
    });
    expect(JSON.stringify(n)).not.toContain(TOKEN);
    expect(JSON.stringify(n)).not.toContain("QUJDQUJD");
    expect(n?.headers).toEqual({ "content-type": "x" });
  });
});

describe("limparArquivoDeWebhook", () => {
  it("SIMULAÇÃO não grava, e NUNCA abre a linha grande", async () => {
    const linhas = amostra();
    const { db, consultas } = bancoFalso(linhas);
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: false });
    expect(r.varridas).toBe(26);
    expect(r.grandes).toBe(1);
    expect(r.comSegredo).toBe(25);
    expect(r.gravadas).toBe(0);
    expect(consultas.some((c) => /update/i.test(c.sql))).toBe(false);
    const lidas = consultas
      .filter((c) => /select id, raw_body/.test(c.sql))
      .flatMap((c) => c.params?.[0] as string[]);
    expect(lidas, "a simulação destostou a linha grande").not.toContain("00000000-0000-0000-0000-000000000999");
    expect(JSON.stringify(linhas)).toContain(TOKEN);
  });

  it("a varredura decide por pg_column_size, sem selecionar o conteúdo", () => {
    const select = SQL_VARREDURA.slice(0, SQL_VARREDURA.indexOf("from"));
    expect(select).toMatch(/pg_column_size\(raw_body\)/);
    expect(select).toMatch(/pg_column_size\(payload_parsed\)/);
    // Fora do pg_column_size, nenhuma coluna de conteúdo pode aparecer.
    const semTamanhos = select.replace(/pg_column_size\([^)]*\)/g, "");
    expect(semTamanhos).not.toMatch(/\b(raw_body|payload_parsed|headers)\b/);
    // E o WHERE também não abre o valor (o filtro `payload_parsed ? 'base64'` destostava).
    const where = SQL_VARREDURA.slice(SQL_VARREDURA.indexOf("where"));
    expect(where).not.toMatch(/\b(raw_body|payload_parsed|headers)\b/);
  });

  it("--aplicar limpa tudo, em lotes de no máximo 10, com statement_timeout dentro da transação", async () => {
    const linhas = amostra();
    const { db, consultas } = bancoFalso(linhas);
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    expect(r.gravadas).toBe(26);
    expect(JSON.stringify(linhas)).not.toContain(TOKEN);
    expect(JSON.stringify(linhas)).not.toContain("QUJDQUJD");

    // Cada transação: begin → set local statement_timeout → … → commit, ≤ 10 updates.
    let dentro = 0;
    let comTimeout = false;
    for (const c of consultas) {
      if (c.sql === "begin") { dentro = 0; comTimeout = false; }
      if (/set local statement_timeout = 15000/.test(c.sql)) comTimeout = true;
      if (/^\s*update/.test(c.sql)) {
        dentro++;
        expect(comTimeout, "update fora de transação com statement_timeout").toBe(true);
        expect(dentro).toBeLessThanOrEqual(10);
      }
    }
    expect(consultas[0]!.sql).toMatch(/^set statement_timeout = 15000/);
  });

  it("segunda rodada não regrava nada (idempotente)", async () => {
    const linhas = amostra();
    const { db } = bancoFalso(linhas);
    await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    const r2 = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    expect(r2.gravadas).toBe(0);
    expect(r2.comSegredo).toBe(0);
  });

  it("linha alterada no meio (tamanho mudou) é pulada, não atropelada", async () => {
    const linhas = amostra();
    const { db } = bancoFalso(linhas);
    const original = db.query.bind(db);
    db.query = async (sql, params) => {
      if (/^\s*update/.test(sql)) {
        const l = linhas.find((x) => x.id === (params as string[])[0]);
        if (l) l.raw_body = `${l.raw_body} `; // a retenção mexeu
      }
      return original(sql, params);
    };
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    expect(r.gravadas).toBe(0);
    expect(r.puladas).toBe(26);
  });

  it("--max limita a rodada e devolve o cursor para continuar", async () => {
    const { db } = bancoFalso(amostra());
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: false, max: 10 });
    expect(r.varridas).toBe(10);
    expect(r.cursor).toMatch(/\|00000000-/);
  });
});
