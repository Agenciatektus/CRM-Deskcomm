import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  type ClienteSql,
  lerOpcoes,
  limparArquivoDeWebhook,
  linhaEnxuta,
  SQL_GRAVAR,
  SQL_MEDIR,
  SQL_VARREDURA,
} from "@/scripts/enxugar-arquivo-de-webhook-retroativo";

/**
 * A LIMPEZA RETROATIVA DO ARQUIVO DE WEBHOOK.
 *
 * O que estes casos vigiam é o que custou incidente: decidir sem destostar,
 * lote pequeno, `statement_timeout` dentro da transação, nada gravado sem
 * `--aplicar`, UPDATE que não atropela linha alterada no meio — e, desde a 1ª
 * rodada em produção (05/10/2026, 2,4 MB → 4,0 MB), NENHUMA linha cresce.
 *
 * O banco falso imita o que importa do Postgres: `pg_column_size` de valor
 * ARMAZENADO pode ser menor que o texto (compressão, campo `comprimido`), e o
 * de valor novo é o texto inteiro.
 */

const TOKEN = "TOK-retroativo-55aa";
const MIDIA = "QUJD".repeat(30_000);

interface LinhaFalsa {
  id: string;
  received_at: string;
  raw_body: string | null;
  payload_parsed: unknown;
  headers: Record<string, string> | null;
  /** Tamanho armazenado (comprimido) da linha inteira, se diferente do texto. */
  comprimido?: number;
}

function tam(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v.length : JSON.stringify(v).length;
}

/** Tamanho armazenado por coluna: o comprimido, quando houver, fica todo no raw. */
function armazenado(l: LinhaFalsa) {
  const parsed = tam(l.payload_parsed);
  const headers = tam(l.headers);
  const raw = l.comprimido === undefined ? tam(l.raw_body) : l.comprimido - (parsed ?? 0) - (headers ?? 0);
  return { raw, parsed, headers };
}

function total(l: LinhaFalsa): number {
  const a = armazenado(l);
  return (a.raw ?? 0) + (a.parsed ?? 0) + (a.headers ?? 0);
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
          .map((l) => {
            const a = armazenado(l);
            return { id: l.id, received_at: l.received_at, tam_raw: a.raw, tam_parsed: a.parsed, tam_headers: a.headers };
          });
        return { rows } as never;
      }
      if (/select id, raw_body, payload_parsed, headers/.test(sql)) {
        const ids = (params?.[0] as string[]) ?? [];
        return { rows: linhas.filter((l) => ids.includes(l.id)) } as never;
      }
      if (sql === SQL_MEDIR) {
        const [rs, ps, hs] = params as [Array<string | null>, Array<string | null>, Array<string | null>];
        return { rows: rs.map((r, k) => ({ depois: (r?.length ?? 0) + (ps[k]?.length ?? 0) + (hs[k]?.length ?? 0) })) } as never;
      }
      if (sql === SQL_GRAVAR) {
        const [id, raw, parsed, headers, tRaw] = params as [string, string, string | null, string | null, number];
        const l = linhas.find((x) => x.id === id);
        if (!l || armazenado(l).raw !== tRaw) return { rows: [], rowCount: 0 };
        const novo = (raw?.length ?? 0) + (parsed?.length ?? 0) + (headers?.length ?? 0);
        if (novo >= total(l)) return { rows: [], rowCount: 0 }; // a trava do WHERE
        l.raw_body = raw;
        l.payload_parsed = parsed === null ? null : JSON.parse(parsed);
        l.headers = headers === null ? null : JSON.parse(headers);
        delete l.comprimido;
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

/** A linha de produção que a 1ª versão fez crescer: pequena, comprimida, com mediaKey. */
function linhaQueCresceria(): LinhaFalsa {
  const evento = {
    type: "Message",
    event: { Message: { imageMessage: { mediaKey: "bWVkaWFLZXktZmFsc2EtMzJieXRlcw==", caption: "x".repeat(1500) } } },
  };
  return {
    id: "00000000-0000-0000-0000-000000000777",
    received_at: "2026-10-04T08:00:00Z",
    raw_body: JSON.stringify(evento),
    payload_parsed: evento,
    headers: { "content-type": "application/json" },
    comprimido: 1800, // ~3 KB de texto guardados em 1,8 KB
  };
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
    expect(r.pequenasComSegredo).toBe(25);
    expect(consultas.some((c) => c.sql === SQL_GRAVAR)).toBe(false);
    const lidas = consultas.filter((c) => /select id, raw_body/.test(c.sql)).flatMap((c) => c.params?.[0] as string[]);
    expect(lidas, "a simulação destostou a linha grande").not.toContain("00000000-0000-0000-0000-000000000999");
    expect(JSON.stringify(linhas)).toContain(TOKEN);
  });

  it("a varredura decide por pg_column_size, sem selecionar o conteúdo", () => {
    const select = SQL_VARREDURA.slice(0, SQL_VARREDURA.indexOf("from"));
    expect(select).toMatch(/pg_column_size\(raw_body\)/);
    expect(select).toMatch(/pg_column_size\(payload_parsed\)/);
    const semTamanhos = select.replace(/pg_column_size\([^)]*\)/g, "");
    expect(semTamanhos).not.toMatch(/\b(raw_body|payload_parsed|headers)\b/);
    const where = SQL_VARREDURA.slice(SQL_VARREDURA.indexOf("where"));
    expect(where).not.toMatch(/\b(raw_body|payload_parsed|headers)\b/);
  });

  it("--aplicar limpa, em lotes de no máximo 10, com statement_timeout dentro da transação", async () => {
    const linhas = amostra();
    const { db, consultas } = bancoFalso(linhas);
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    expect(r.gravadas).toBe(26);
    expect(JSON.stringify(linhas)).not.toContain(TOKEN);
    expect(JSON.stringify(linhas)).not.toContain("QUJDQUJD");
    let dentro = 0;
    let comTimeout = false;
    for (const c of consultas) {
      if (c.sql === "begin") {
        dentro = 0;
        comTimeout = false;
      }
      if (/set local statement_timeout = 15000/.test(c.sql)) comTimeout = true;
      if (c.sql === SQL_GRAVAR) {
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
    expect(r2.pequenasComSegredo).toBe(0);
  });

  it("linha alterada no meio (tamanho mudou) é pulada, não atropelada", async () => {
    const linhas = amostra();
    const { db } = bancoFalso(linhas);
    const original = db.query.bind(db);
    db.query = async (sql, params) => {
      if (sql === SQL_GRAVAR) {
        const l = linhas.find((x) => x.id === (params as string[])[0]);
        if (l) l.raw_body = `${l.raw_body} `; // a retenção mexeu
      }
      return original(sql, params);
    };
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    expect(r.gravadas).toBe(0);
    expect(r.puladasPorCorrida).toBe(26);
  });

  it("--max limita a rodada e devolve o cursor para continuar", async () => {
    const { db } = bancoFalso(amostra());
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: false, max: 10 });
    expect(r.varridas).toBe(10);
    expect(r.cursor).toMatch(/\|00000000-/);
  });
});

describe("a limpeza NUNCA aumenta uma linha (medido em produção: +63% na 1ª versão)", () => {
  function comACrescente(): LinhaFalsa[] {
    return [...amostra(), linhaQueCresceria()].sort((a, b) =>
      `${a.received_at}|${a.id}`.localeCompare(`${b.received_at}|${b.id}`),
    );
  }

  it("nenhuma linha termina maior do que começou; a comprimida que cresceria é pulada e contada", async () => {
    const linhas = comACrescente();
    const antes = new Map(linhas.map((l) => [l.id, total(l)]));
    const { db } = bancoFalso(linhas);
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });

    for (const l of linhas) {
      expect(total(l), `a linha ${l.id} cresceu`).toBeLessThanOrEqual(antes.get(l.id)!);
    }
    expect(r.puladasPorCrescer).toBe(1);
    expect(linhas.find((l) => l.id.endsWith("777"))!.comprimido, "a linha que cresceria foi reescrita").toBe(1800);
    expect(r.bytesEconomizados).toBeGreaterThan(0);
    expect(r.bytesDepois).toBeLessThan(r.bytesAntes);
  });

  it("controle negativo: a linha crescente de fato cresceria se fosse reescrita", () => {
    const l = linhaQueCresceria();
    const nova = linhaEnxuta(l);
    expect(nova, "a fixture não tem nada a omitir: não testaria nada").not.toBeNull();
    const novoTexto = (nova!.raw_body?.length ?? 0) + JSON.stringify(nova!.payload_parsed).length + JSON.stringify(nova!.headers).length;
    expect(novoTexto).toBeGreaterThan(total(l));
  });

  it("controle negativo: sem a medição, o banco falso deixaria crescer (a trava do WHERE é quem segura)", async () => {
    // Medição desligada (diz que tudo encolhe): o UPDATE ainda recusa no WHERE,
    // e a linha conta como corrida — prova de que o WHERE é uma trava real.
    const linhas = comACrescente();
    const { db } = bancoFalso(linhas);
    const original = db.query.bind(db);
    db.query = async (sql, params) =>
      sql === SQL_MEDIR ? ({ rows: (params![0] as unknown[]).map(() => ({ depois: 0 })) } as never) : original(sql, params);
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true });
    expect(r.puladasPorCrescer).toBe(0);
    expect(r.puladasPorCorrida).toBe(1);
    expect(linhas.find((l) => l.id.endsWith("777"))!.comprimido).toBe(1800);
  });

  it("o UPDATE carrega a mesma trava no WHERE (novo < armazenado)", () => {
    expect(SQL_GRAVAR).toMatch(/pg_column_size\(\$2::text\)[^]*<[^]*pg_column_size\(raw_body\)/);
  });

  it("--so-grandes nem lê as pequenas, e só regrava as de mídia inteira", async () => {
    const linhas = amostra();
    const { db, consultas } = bancoFalso(linhas);
    const r = await limparArquivoDeWebhook(db, { ...BASE, aplicar: true, soGrandes: true });
    expect(r.pequenasComSegredo).toBe(0);
    expect(r.gravadas).toBe(1);
    const lidas = consultas.filter((c) => /select id, raw_body/.test(c.sql)).flatMap((c) => c.params?.[0] as string[]);
    expect(lidas).toEqual(["00000000-0000-0000-0000-000000000999"]);
    expect(lerOpcoes(["--so-grandes"]).soGrandes).toBe(true);
    expect(lerOpcoes([]).soGrandes).toBe(false);
  });
});

describe("P1 do Cassio na #98: nunca o provider waha", () => {
  it("o CLI recusa --provider waha (qualquer caixa)", () => {
    expect(() => lerOpcoes(["--provider", "waha"])).toThrow(/recusado/);
    expect(() => lerOpcoes(["--provider", " WAHA "])).toThrow(/recusado/);
    expect(lerOpcoes([]).provider).toBe("verdash");
  });

  it("a função recusa waha ANTES de qualquer consulta, mesmo em simulação", async () => {
    const { db, consultas } = bancoFalso(amostra());
    await expect(limparArquivoDeWebhook(db, { ...BASE, provider: "waha", aplicar: true })).rejects.toThrow(/recusado/);
    expect(consultas, "consultou o banco antes de recusar").toEqual([]);
  });

  it("o cron de replay ainda relê waha (se mudar, revisar a recusa)", () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "../../lib/channels/reprocessar-arquivo-de-webhook.ts"), "utf8");
    expect(fonte).toMatch(/\.eq\("provider", "waha"\)/);
    expect(fonte).toMatch(/payload_parsed/);
  });
});
