// @vitest-environment node
//
// O reaper dos despachos órfãos (`ai_agent.dispatch_requested` presos em
// `processing`). Medido em produção (plano Postgres-Elite, 2026-10-01, item 6):
// o reaper antigo — update multilinha sem `skip locked`, em TODO tick — somava
// 301 esperas de lock e 40 lock timeouts por dia. Estes testes prendem as duas
// metades do conserto: a FORMA da consulta e o RITMO de 1×/min.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import {
  REAPER_INTERVALO_PADRAO_MS,
  REAPER_LOTE,
  drainTick,
  reaparDespachosOrfaos,
  reaperEstaNaVez,
  runDrainLoop,
} from './drain';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const knobs = {
  batchSize: 2,
  intervalMs: 2000,
  idleIntervalMs: 2000,
  debounceMs: 0,
  reapTimeoutMs: 300_000,
};
const ehReaper = (sql: string): boolean => sql.includes('= any(consumed_by)');

afterEach(() => vi.useRealTimers());

describe('a consulta do reaper', () => {
  it('pula linha travada, tem teto e só devolve o despacho do engine', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 3 }));
    const n = await reaparDespachosOrfaos({ query } as unknown as pg.Pool, 300_000);
    expect(n).toBe(3);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    // A forma que tira o reaper da fila de lock: update sobre um subselect que
    // trava só o que está livre.
    expect(sql).toMatch(/where id in \(\s*select id from event_log/);
    expect(sql).toMatch(/for update skip locked/);
    expect(sql).toMatch(/limit \$3/);
    expect(sql).toMatch(/order by updated_at/);
    expect(sql).toContain("event_type = 'ai_agent.dispatch_requested'");
    expect(sql).toContain("status = 'processing'");
    expect(params).toEqual(['agent-engine', 300_000, REAPER_LOTE]);
  });

  it('rowCount ausente conta como zero (o driver pode omitir)', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect(await reaparDespachosOrfaos({ query } as unknown as pg.Pool, 1)).toBe(0);
  });
});

describe('o ritmo do reaper', () => {
  it('roda na primeira volta (boot depois de crash é quando há órfão)', () => {
    expect(reaperEstaNaVez(null, 0)).toBe(true);
  });

  it('não roda antes do intervalo e roda quando ele vence', () => {
    expect(reaperEstaNaVez(1_000, 1_000 + REAPER_INTERVALO_PADRAO_MS - 1)).toBe(false);
    expect(reaperEstaNaVez(1_000, 1_000 + REAPER_INTERVALO_PADRAO_MS)).toBe(true);
    expect(reaperEstaNaVez(0, 5_000, 5_000)).toBe(true);
  });

  it('drainTick com reap:false não toca nos órfãos; o padrão continua reapando', async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [] }));
    const pool = { query } as unknown as pg.Pool;
    await drainTick(pool, knobs, log as never, { reap: false });
    expect(query.mock.calls.some(([sql]) => ehReaper(sql))).toBe(false);
    await drainTick(pool, knobs, log as never);
    expect(query.mock.calls.some(([sql]) => ehReaper(sql))).toBe(true);
  });

  it('o laço roda o reaper 1×/min, não em todo tick', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let reaps = 0;
    let claims = 0;
    const query = vi.fn(async (sql: string) => {
      if (ehReaper(sql)) reaps++;
      if (sql.includes('returning e.id')) claims++;
      return { rows: [], rowCount: 0 };
    });
    const loop = runDrainLoop({ query } as unknown as pg.Pool, knobs, log as never, controller.signal);
    // 2 min a 2 s por tick ≈ 60 ticks; o reaper roda na volta 0, ~60 s e ~120 s.
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    controller.abort();
    await loop;
    expect(claims).toBeGreaterThan(50);
    expect(reaps).toBe(3);
  });
});
