import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  CONNECTION_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  PRAZOS_DA_SESSAO,
  SQL_PRAZOS_DA_SESSAO,
  createPool,
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

  it("na transação é SET LOCAL (is_local = true) dos três prazos", async () => {
    const c = fake();
    await semPrazoNaTransacao(c as never);
    const sql = c.query.mock.calls[0]![0];
    for (const k of Object.keys(PRAZOS_DA_SESSAO)) expect(sql).toContain(`'${k}', '0', true`);
  });

  it("na sessão suspende lock/statement e restaurar volta aos prazos padrão", async () => {
    const c = fake();
    await semPrazoNaSessao(c as never);
    expect(c.query.mock.calls[0]![0]).toContain("'lock_timeout', '0', false");
    await restaurarPrazosDaSessao(c as never);
    expect(c.query.mock.calls[1]![0]).toBe(SQL_PRAZOS_DA_SESSAO);
  });

  it("nomeDaAplicacao cabe no limite de 63 do Postgres", () => {
    expect(nomeDaAplicacao("x".repeat(100)).length).toBeLessThanOrEqual(63);
  });
});
