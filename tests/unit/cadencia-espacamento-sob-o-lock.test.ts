import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { runBeforeSend, type RunBeforeSendArgs } from '@/lib/agent-engine/guardrails/before-send';

/**
 * O ESPAÇAMENTO DA CADÊNCIA É DECIDIDO SOB O LOCK DO NÚMERO — E NÃO VIRA SLEEP.
 *
 * Dois defeitos que este arquivo impede:
 *   1. checar o intervalo FORA do lock deixa dois workers lerem o mesmo "último
 *      envio" e mandarem juntos (a corrida da prospecção do Verdash);
 *   2. dormir 45–120 s COM o lock na mão trava o número inteiro, inclusive a
 *      resposta da IA a quem acabou de escrever.
 *
 * O contrato: a leitura do `pacing_ledger` acontece depois do lock; se o
 * intervalo sorteado ainda não passou, rollback + veto `cadence_spacing` com o
 * instante de retomada, sem `send` e sem `sleep`.
 */

const AGORA = new Date('2026-09-24T15:00:00.000Z');

function poolComUltimoEnvio(ultimo: Date | null) {
  const eventos: string[] = [];
  const client = {
    query: vi.fn(async (sql: string): Promise<{ rows: unknown[] }> => {
      const s = String(sql).toLowerCase().trim();
      if (s.includes('pg_advisory_xact_lock')) eventos.push('lock');
      if (s === 'begin') eventos.push('begin');
      if (s === 'commit') eventos.push('commit');
      if (s === 'rollback') eventos.push('rollback');
      if (s.includes('from pacing_ledger')) {
        eventos.push('le_ledger');
        return { rows: [{ last_sent_at: ultimo, sent_today: '3' }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn().mockResolvedValue({ rows: [{ id: 'trace-1' }] }),
  };
  return { pool: pool as unknown as pg.Pool, eventos };
}

function args(pool: pg.Pool, extras: Partial<RunBeforeSendArgs> = {}): RunBeforeSendArgs {
  return {
    pool,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tenantId: '00000000-0000-4000-8000-000000000001',
    leadId: '00000000-0000-4000-8000-000000000002',
    jobId: '00000000-0000-4000-8000-000000000003',
    channelSessionId: '00000000-0000-4000-8000-000000000004',
    body: 'Oi Maria, tudo bem?',
    optedOutThisTurn: false,
    crmDailyLimit: 150,
    espacamentoAutomatico: { minMs: 45_000, maxMs: 120_000 },
    now: AGORA,
    rng: () => 0,
    sleep: vi.fn(async () => {}),
    gates: [],
    send: vi.fn(async () => ({ kind: 'sent' as const, idempotencyKey: 'k', messageId: 'm' })),
    ...extras,
  };
}

describe('espaçamento da cadência', () => {
  it('dentro do intervalo: veto cadence_spacing, sem send, sem sleep, com a retomada', async () => {
    const ultimo = new Date(AGORA.getTime() - 10_000);
    const { pool, eventos } = poolComUltimoEnvio(ultimo);
    const a = args(pool);
    const r = await runBeforeSend(a);

    expect(r.status).toBe('vetoed');
    if (r.status !== 'vetoed') return;
    expect(r.code).toBe('cadence_spacing');
    expect(r.nextAllowedAt?.toISOString()).toBe(new Date(ultimo.getTime() + 45_000).toISOString());
    expect(a.send).not.toHaveBeenCalled();
    expect(a.sleep).not.toHaveBeenCalled();
    // A leitura do último envio aconteceu DEPOIS do lock, e o lock foi solto.
    expect(eventos.indexOf('le_ledger')).toBeGreaterThan(eventos.indexOf('lock'));
    expect(eventos.at(-1)).toBe('rollback');
  });

  it('passado o intervalo: segue para o envio', async () => {
    const { pool } = poolComUltimoEnvio(new Date(AGORA.getTime() - 200_000));
    const a = args(pool);
    const r = await runBeforeSend(a);
    expect(r.status).toBe('sent');
    expect(a.send).toHaveBeenCalledTimes(1);
  });

  it('controle: sem espaçamento (envio que não é cadência), o mesmo estado não veta', async () => {
    const { pool } = poolComUltimoEnvio(new Date(AGORA.getTime() - 10_000));
    const a = args(pool, { espacamentoAutomatico: undefined });
    const r = await runBeforeSend(a);
    expect(r.status).toBe('sent');
  });
});
