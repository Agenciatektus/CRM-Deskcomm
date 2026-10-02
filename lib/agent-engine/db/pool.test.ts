import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  CONNECTION_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  PRAZOS_DA_ESPERA_LONGA,
  SQL_PRAZOS_DA_SESSAO,
  createPool,
  ehPoolerEmModoTransacao,
  nomeDaAplicacao,
  restaurarPrazosDaSessao,
  semPrazoNaSessao,
  semPrazoNaTransacao,
} from "./pool";

/**
 * O pool não conecta no construtor: dá para medir a configuração sem banco.
 * O que importa no banco nano (60 conexões, Supavisor em modo session) é:
 * conexão ociosa viva por minutos (não 10 s), teto de espera por vaga, nome por
 * processo no pg_stat_activity e prazos de sessão aplicados em TODA conexão nova.
 */
describe("createPool", () => {
  const URL = "postgres://u:p@127.0.0.1:1/db";

  it("ociosa 5 min, espera por vaga 5 s, application_name do papel", async () => {
    const pool = createPool(URL, () => undefined, { applicationName: "crm-worker-1" });
    const o = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(o.idleTimeoutMillis).toBe(IDLE_TIMEOUT_MS);
    expect(IDLE_TIMEOUT_MS).toBe(300_000);
    expect(o.connectionTimeoutMillis).toBe(CONNECTION_TIMEOUT_MS);
    expect(CONNECTION_TIMEOUT_MS).toBe(5_000);
    expect(o.application_name).toBe("crm-worker-1");
    await pool.end();
  });

  it("sem nome explícito, ainda sai distinto por processo", async () => {
    const pool = createPool(URL);
    const o = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(o.application_name).toBe(`crm-pool-${process.pid}`);
    await pool.end();
  });

  it("toda conexão nova recebe os prazos de sessão antes de qualquer query", async () => {
    const pool = createPool(URL, () => undefined);
    const client = Object.assign(new EventEmitter(), {
      query: vi.fn(async () => ({ rows: [] })),
    });
    pool.emit("connect", client as never);
    expect(client.query).toHaveBeenCalledWith(SQL_PRAZOS_DA_SESSAO);
    expect(SQL_PRAZOS_DA_SESSAO).toBe(
      "set statement_timeout = '30s'; set idle_in_transaction_session_timeout = '60s'; set lock_timeout = '5s'",
    );
    await pool.end();
  });

  it("falha ao aplicar os prazos vai para o onError, sem rejeição solta", async () => {
    const onError = vi.fn();
    const pool = createPool(URL, onError);
    const client = Object.assign(new EventEmitter(), {
      query: vi.fn(async () => {
        throw new Error("conexão caiu");
      }),
    });
    pool.emit("connect", client as never);
    await new Promise((r) => setImmediate(r));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "conexão caiu" }));
    await pool.end();
  });
});

describe("prazos: quem espera por desenho suspende, e só ali", () => {
  const fake = () => ({ query: vi.fn(async (_sql: string) => ({ rows: [] })) });

  it("espera longa TEM teto: ociosa 25 min (> 20 min do throttle+jitter máximos), lock 30 min", () => {
    expect(PRAZOS_DA_ESPERA_LONGA).toEqual({
      statement_timeout: "0",
      idle_in_transaction_session_timeout: "25min",
      lock_timeout: "30min",
    });
  });

  it("na transação é SET LOCAL (is_local = true) com os tetos de espera longa", async () => {
    const c = fake();
    await semPrazoNaTransacao(c as never);
    const sql = c.query.mock.calls[0]![0];
    expect(sql).toContain("'lock_timeout', '30min', true");
    expect(sql).toContain("'statement_timeout', '0', true");
    expect(sql).toContain("'idle_in_transaction_session_timeout', '25min', true");
    expect(sql).not.toContain("'lock_timeout', '0'");
    expect(sql).not.toContain("'idle_in_transaction_session_timeout', '0'");
  });

  it("na sessão troca lock/statement pelos de espera longa e restaurar volta aos padrão", async () => {
    const c = fake();
    await semPrazoNaSessao(c as never);
    expect(c.query.mock.calls[0]![0]).toContain("'lock_timeout', '30min', false");
    expect(c.query.mock.calls[0]![0]).toContain("'statement_timeout', '0', false");
    await restaurarPrazosDaSessao(c as never);
    expect(c.query.mock.calls[1]![0]).toBe(SQL_PRAZOS_DA_SESSAO);
  });

  it("nomeDaAplicacao cabe no limite de 63 do Postgres", () => {
    expect(nomeDaAplicacao("x".repeat(100)).length).toBeLessThanOrEqual(63);
  });
});

describe("pooler em modo transaction: SET de sessão vazaria para outro cliente", () => {
  it("detecta porta 6543 e pgbouncer=true; 5432 é session", () => {
    expect(ehPoolerEmModoTransacao("postgres://u:p@aws-0.pooler.supabase.com:6543/postgres")).toBe(
      true,
    );
    expect(ehPoolerEmModoTransacao("postgres://u:p@h:5432/postgres?pgbouncer=true")).toBe(true);
    expect(ehPoolerEmModoTransacao("postgres://u:p@aws-0.pooler.supabase.com:5432/postgres")).toBe(
      false,
    );
    expect(ehPoolerEmModoTransacao("não é url")).toBe(false);
  });

  it.each([
    ["porta 6543", "postgres://u:p@127.0.0.1:6543/db"],
    ["pgbouncer=true", "postgres://u:p@127.0.0.1:5432/db?pgbouncer=true"],
  ])("%s: loga erro e NÃO aplica SET no connect nem na sessão", async (_caso, url) => {
    const escrita = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const pool = createPool(url, () => undefined, { applicationName: "crm-t" });
      const logou = escrita.mock.calls.map((c) => String(c[0])).join("");
      expect(logou).toContain("modo transaction");
      const client = Object.assign(new EventEmitter(), {
        query: vi.fn(async (_sql: string) => ({ rows: [] })),
      });
      pool.emit("connect", client as never);
      await semPrazoNaSessao(client as never);
      await restaurarPrazosDaSessao(client as never);
      expect(client.query).not.toHaveBeenCalled();
      // SET LOCAL continua valendo: some no fim da transação, não vaza.
      await semPrazoNaTransacao(client as never);
      expect(client.query).toHaveBeenCalledTimes(1);
      await pool.end();
    } finally {
      escrita.mockRestore();
    }
  });

  it("modo session (5432): aplica o SET no connect, como antes", async () => {
    const pool = createPool("postgres://u:p@127.0.0.1:5432/db", () => undefined);
    const client = Object.assign(new EventEmitter(), { query: vi.fn(async () => ({ rows: [] })) });
    pool.emit("connect", client as never);
    expect(client.query).toHaveBeenCalledWith(SQL_PRAZOS_DA_SESSAO);
    await pool.end();
  });
});
