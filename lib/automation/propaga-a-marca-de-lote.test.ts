/**
 * A MARCA DE LOTE ATRAVESSA A CADEIA — o salto transitivo de `lead.created`.
 *
 * ═══ O defeito, que é o do P0 um salto depois ═══
 *
 * O motor de regras pula as ações que FALAM quando o card nasceu em lote. Mas
 * ele EXECUTA as ações que CRIAM CARD (`create_lead_in_pipeline`,
 * `create_or_move_lead`), e cada card novo emite um `lead.created` com
 * `requestId = 'rule:<id>'`. Esse prefixo protege o motor de automação de si
 * mesmo (`engine.ts`), e o gatilho de follow-up "Lead criado" não olha `rule:`
 * nenhum — as saídas dele são `event_type`, `entity_kind`, a marca de lote e
 * contato ausente. Cadeia inteira:
 *
 *   campanha cria 500 cards em lote
 *     → o motor pula as ações que falam        ✓
 *     → o motor roda "crie card em Vendas"
 *       → 500 `lead.created` novos
 *         → SEM a marca: o gatilho manda       ✗  500 proativas na abordagem
 *
 * ═══ Por que o teste é DIRETO, e por que ele mede o EVENTO ═══
 *
 * A cerca `acao-que-fala-se-declara` mede quem importa caminho de ENVIO. Estas
 * duas ações importam `createLeadHandler`: falam só transitivamente, e uma
 * cerca que tentasse adivinhar transitividade erraria nos dois sentidos.
 *
 * E a asserção é sobre o `emit_event`, não sobre o argumento do handler: quem
 * decide mandar ou não mandar é o gatilho, e o que o gatilho lê é
 * `lead.created.metadata.via`. Medir o argumento provaria a chamada; medir o
 * evento prova a CADEIA.
 */
import { describe, expect, it, vi } from "vitest";

const originRpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: unknown) => ({ data: null, error: null })));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: originRpc }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
// Mesmo motivo de `create-or-move-lead.test.ts`: o double importa estes módulos
// de qualquer forma, e a importação real valida env no boot.
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/create-or-move-lead";
import type { ActionCtx } from "@/lib/automation/types";
import { ORIGEM_CAMPANHA } from "@/lib/campanhas/origem-do-lead";
import { viaHerdada } from "@/lib/leads/criacao-em-lote";
import { ORIGEM_DA_PLANILHA } from "@/lib/leads/planilha";
import { ORG_ID, PIPE, etapa, funilRow, makeDb } from "@/tests/helpers/stages-db-double";

describe("viaHerdada — o que viaja, e o que não", () => {
  it("as origens de LOTE viajam", () => {
    expect(viaHerdada({ via: ORIGEM_CAMPANHA })).toEqual({ via: ORIGEM_CAMPANHA });
    expect(viaHerdada({ via: ORIGEM_DA_PLANILHA })).toEqual({ via: ORIGEM_DA_PLANILHA });
  });

  it("qualquer OUTRO `via` não vira marca de lote por carona", () => {
    // Um `via` desconhecido no evento de origem não pode ganhar o efeito de
    // calar o gatilho: o efeito é da criação em LOTE, não do campo existir.
    expect(viaHerdada({ via: "importacao_de_crm_antigo" })).toEqual({});
    expect(viaHerdada({ via: 42 })).toEqual({});
    expect(viaHerdada({})).toEqual({});
    expect(viaHerdada(null)).toEqual({});
    expect(viaHerdada(undefined)).toEqual({});
  });
});

const ETAPA_DESTINO = etapa({ id: "triagem", name: "Triagem", position: 2000 });

function dbDoTeste() {
  return makeDb({
    contacts: [{ id: "contato-1", organization_id: ORG_ID }],
    pipelines: [funilRow({ id: PIPE, name: "funil comercial" })],
    stages: [ETAPA_DESTINO],
    leads: [],
  });
}

function ctxDeContato(admin: ActionCtx["admin"], via?: string): ActionCtx {
  return {
    admin,
    organizationId: ORG_ID,
    ruleId: "rule-1",
    ruleName: "Quando entrar lead novo, crie card em Vendas",
    event: { metadata: via ? { via } : {} } as ActionCtx["event"],
    requestId: "req-1",
    context: { contact: { id: "contato-1", name: "Ana", phone_number: "+5548999990000" } },
  };
}

/** O `p_metadata` do `lead.created` que saiu — é o que o gatilho lê. */
function metadataDoEventoCriado(): Record<string, unknown> | null {
  const chamada = originRpc.mock.calls.find(
    ([fn, args]) => fn === "emit_event" && (args as { p_event_type?: string })?.p_event_type === "lead.created",
  );
  return chamada ? ((chamada[1] as { p_metadata?: Record<string, unknown> }).p_metadata ?? {}) : null;
}

describe("create_or_move_lead — o `lead.created` que a regra emite herda a marca", () => {
  it("evento em LOTE: o `lead.created` novo sai MARCADO, e o gatilho vai pular", async () => {
    originRpc.mockClear();
    const db = dbDoTeste();
    const acao = getAction("create_or_move_lead");

    const r = await acao!.execute(ctxDeContato(db.client as unknown as ActionCtx["admin"], ORIGEM_CAMPANHA), {
      pipeline_id: PIPE,
      stage_id: ETAPA_DESTINO.id,
    });
    expect(r.status).toBe("success");
    expect(metadataDoEventoCriado()).toMatchObject({ via: ORIGEM_CAMPANHA });
  });

  it("evento de UM card: o `lead.created` novo NÃO é marcado — o gatilho tem de rodar", async () => {
    // Controle negativo. Sem ele, uma propagação larga demais calaria o gatilho
    // para TODA regra que cria card, que é o oposto do que ele existe para
    // fazer — e os dois testes ficariam verdes medindo silêncio.
    originRpc.mockClear();
    const db = dbDoTeste();
    const acao = getAction("create_or_move_lead");

    const r = await acao!.execute(ctxDeContato(db.client as unknown as ActionCtx["admin"]), {
      pipeline_id: PIPE,
      stage_id: ETAPA_DESTINO.id,
    });
    expect(r.status).toBe("success");
    const metadata = metadataDoEventoCriado();
    expect(metadata).not.toBeNull();
    expect(metadata).not.toHaveProperty("via");
  });
});
