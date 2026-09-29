/**
 * O DISCLOSURE NA CONDUÇÃO DA CADÊNCIA conta o "1º outbound" desde a abertura
 * dela: as mensagens da régua já estão no ledger como `accepted`, e sem o recorte
 * a primeira fala da IA nunca levaria a apresentação.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runBeforeSend: vi.fn(), reconcile: vi.fn() }));
vi.mock('@/lib/agent-engine/guardrails/before-send', () => ({ runBeforeSend: mocks.runBeforeSend }));
vi.mock('@/lib/agent-engine/edge/crm/send-ledger', () => ({ reconcileAcceptedSend: mocks.reconcile }));
vi.mock('@/lib/agent-engine/queue/claim', () => ({ claimOfJob: () => ({ worker_id: 'w', acquired_at: 'a' }) }));
vi.mock('@/lib/ai/replies/delivery', () => ({
  assertApprovedReplyReceiptPg: vi.fn(async () => undefined),
  assertApprovedReplyPg: vi.fn(async () => ({
    agent_id: 'agente', channel_session_id: 'canal', conversation_id: 'conversa', body: 'olá',
  })),
}));
vi.mock('@/lib/atendimento/fronteira-server', () => ({
  withServiceJob: async (_p: unknown, _j: unknown, fn: () => Promise<unknown>) => fn(),
}));

import { countPriorAcceptedSends } from '@/lib/agent-engine/guardrails/disclosure/template';
import { createApprovedReplyHandler } from '@/lib/agent-engine/agent/approved-reply';

describe('countPriorAcceptedSends — desde', () => {
  it('sem desde: o histórico inteiro, como sempre', async () => {
    const query = vi.fn(async () => ({ rows: [{ n: 3 }] }));
    expect(await countPriorAcceptedSends({ query } as never, 'org', 'ct')).toBe(3);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).not.toContain('created_at');
    expect(params).toEqual(['org', 'ct']);
  });

  it('com desde: só a partir do instante, amarrado à organização', async () => {
    const desde = new Date('2026-09-28T10:00:00Z');
    const query = vi.fn(async () => ({ rows: [{ n: 0 }] }));
    expect(await countPriorAcceptedSends({ query } as never, 'org', 'ct', desde)).toBe(0);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('created_at >= $3');
    expect(sql).toContain('organization_id = $1');
    expect(params).toEqual(['org', 'ct', desde]);
  });
});

describe('approved-reply passa disclosureDesde quando há condução viva', () => {
  const job = { id: 'job', kind: 'approved_reply', organization_id: 'org', contact_id: 'ct' };

  function pool(abertaEm: Date | null) {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from cadencia_conducoes')) return { rows: abertaEm ? [{ aberta_em: abertaEm }] : [] };
        if (sql.includes('from contacts c join channel_sessions'))
          return { rows: [{ source: null, consent: null, is_anonymized: false, daily_message_limit: null }] };
        return { rows: [] };
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reconcile.mockResolvedValue(false);
    mocks.runBeforeSend.mockResolvedValue({ status: 'vetoed', code: 'x' });
  });

  it('com condução: disclosureDesde = aberta_em', async () => {
    const aberta = new Date('2026-09-28T10:00:00Z');
    const handler = createApprovedReplyHandler({ crmCfg: {} as never, log: console as never, channel: () => ({}) as never });
    await handler(job as never, pool(aberta) as never);
    expect(mocks.runBeforeSend.mock.calls[0]![0].disclosureDesde).toEqual(aberta);
  });

  it('sem condução: nada muda (sem o campo)', async () => {
    const handler = createApprovedReplyHandler({ crmCfg: {} as never, log: console as never, channel: () => ({}) as never });
    await handler(job as never, pool(null) as never);
    expect(mocks.runBeforeSend.mock.calls[0]![0]).not.toHaveProperty('disclosureDesde');
  });
});
