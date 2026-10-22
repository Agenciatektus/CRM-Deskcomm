import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { reaparDespachosOrfaos } from "@/lib/agent-engine/edge/crm/drain";

/**
 * O reaper dos despachos órfãos PULA linha travada por outra transação.
 *
 * Antes ele era um `update … where status = 'processing' and updated_at < …`
 * sem `skip locked`: entrava na fila de qualquer linha que outra transação
 * segurasse (o próprio laço fechando um evento, a poda) e segurava as que já
 * tinha pego enquanto esperava — 301 esperas de lock e 40 `lock timeout` por dia
 * em produção (plano Postgres-Elite de 2026-10-01, item 6).
 *
 * Só o Postgres de verdade prova `for update skip locked`. O teste trava UM dos
 * dois órfãos numa transação aberta e chama o reaper REAL por um pool com
 * `statement_timeout` curto: com `skip locked` ele devolve o livre e volta na
 * hora; sem (controle negativo: tirar o `skip locked` do SQL), ele espera a
 * linha travada e estoura o timeout — o teste fica vermelho, não pendurado.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const URL_DO_BANCO = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const pool = new pg.Pool({ connectionString: URL_DO_BANCO, max: 2 });
// O pool do reaper: 3 s de teto por comando. Sem `skip locked` o update
// esperaria a transação do teste para sempre.
const poolDoReaper = new pg.Pool({
  connectionString: URL_DO_BANCO,
  max: 1,
  options: "-c statement_timeout=3000",
});

const ORG = "e7a1d000-0000-4000-8000-00000000d001";
let travado = "";
let livre = "";

async function inserirOrfao(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into event_log (organization_id, event_type, entity_kind, entity_id, payload,
                            status, consumed_by, updated_at)
     values ($1::uuid, 'ai_agent.dispatch_requested', 'message', gen_random_uuid(), '{}'::jsonb,
             'processing', array['agent-engine'], now() - interval '1 hour')
     returning id`,
    [ORG],
  );
  return rows[0]!.id;
}

async function statusDe(id: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>(
    "select status from event_log where id = $1",
    [id],
  );
  return rows[0]!.status;
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'reaper-skip-locked', 'Reaper Skip Locked', 'Reaper Skip Locked')
     on conflict (id) do nothing`,
    [ORG],
  );
  travado = await inserirOrfao();
  livre = await inserirOrfao();
});

afterAll(async () => {
  await pool.query("delete from event_log where organization_id = $1", [ORG]);
  await poolDoReaper.end();
  await pool.end();
});

describe("reaper dos despachos órfãos × linha travada", () => {
  it("devolve o órfão livre e deixa o travado para a próxima rodada, sem esperar", async () => {
    const outro = await pool.connect();
    try {
      await outro.query("begin");
      await outro.query("select id from event_log where id = $1 for update", [travado]);

      const inicio = Date.now();
      const devolvidos = await reaparDespachosOrfaos(poolDoReaper, 300_000);
      const duracao = Date.now() - inicio;

      expect(devolvidos).toBe(1);
      expect(await statusDe(livre)).toBe("pending");
      expect(await statusDe(travado)).toBe("processing");
      expect(duracao).toBeLessThan(2_000);
    } finally {
      await outro.query("rollback");
      outro.release();
    }

    // Controle: solta a trava, a rodada seguinte leva o que ficou.
    expect(await reaparDespachosOrfaos(poolDoReaper, 300_000)).toBe(1);
    expect(await statusDe(travado)).toBe("pending");
  });
});
