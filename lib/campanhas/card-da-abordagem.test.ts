/**
 * O card de quem foi abordado (migration 9037).
 *
 * O que estes testes protegem: a IDEMPOTÊNCIA e a falha fechada. Uma campanha de
 * 500 pessoas chama esta função 500 vezes, e repreparar, retomar ou repetir a
 * rodada a chamam de novo para as mesmas pessoas — se ela criar um segundo card,
 * o funil do cliente enche de duplicata e a métrica de origem passa a contar a
 * mesma pessoa duas vezes. E se ela LANÇAR, derruba a inscrição de alguém cuja
 * mensagem já saiu.
 */
import { describe, expect, it, vi } from "vitest";

import { ORIGEM_CAMPANHA } from "@/lib/campanhas/origem-do-lead";

import { garantirCardDaAbordagem, type CampanhaDoCard } from "./card-da-abordagem";

vi.mock("@/app/api/v1/leads/_handler", () => ({
  createLeadHandler: vi.fn(async () => ({ id: "lead-novo" })),
}));

const campanha: CampanhaDoCard = {
  id: "camp-1",
  organization_id: "org-1",
  name: "Reativação de lojistas",
  pipeline_id: "funil-1",
  stage_id: "etapa-1",
};

/**
 * Cliente mínimo: toda cadeia de `.select().eq()…` devolve o resultado canned da
 * TABELA, e o que foi consultado fica registrado. Não imita o PostgREST — imita
 * só o que esta função usa.
 */
function supabaseFake(porTabela: Record<string, { data?: unknown; error?: { message: string } }>) {
  const tabelas: string[] = [];
  const client = {
    from: (tabela: string) => {
      tabelas.push(tabela);
      const resultado = porTabela[tabela] ?? { data: null };
      const encadeavel: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "order", "limit", "in", "neq", "not", "gte"]) {
        encadeavel[metodo] = () => encadeavel;
      }
      encadeavel.maybeSingle = () => Promise.resolve(resultado);
      encadeavel.single = () => Promise.resolve(resultado);
      encadeavel.then = (fn: (r: unknown) => unknown) => Promise.resolve(resultado).then(fn);
      return encadeavel;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, tabelas };
}

const entrada = { contactId: "c-1", destinatarioId: "dest-1", requestId: "req-1" };

describe("garantirCardDaAbordagem", () => {
  it("campanha sem funil não cria card e não consulta nada", async () => {
    const { client, tabelas } = supabaseFake({});
    const r = await garantirCardDaAbordagem(client, {
      campanha: { ...campanha, pipeline_id: null },
      ...entrada,
    });
    expect(r).toBeNull();
    expect(tabelas).toEqual([]);
  });

  it("REUSA o negócio aberto do contato naquele funil, em vez de criar outro", async () => {
    // É este o caso de repreparar a campanha, retomar, ou a rodada voltar no
    // mesmo destinatário depois de queda. Criar aqui seria duplicar o card.
    const { client, tabelas } = supabaseFake({ crm_leads: { data: { id: "lead-que-ja-existia" } } });
    const r = await garantirCardDaAbordagem(client, { campanha, ...entrada });
    expect(r).toBe("lead-que-ja-existia");
    // Nem etapa nem contato foram consultados: o caminho de criação não rodou.
    expect(tabelas).toEqual(["crm_leads"]);
    const { createLeadHandler } = await import("@/app/api/v1/leads/_handler");
    expect(createLeadHandler).not.toHaveBeenCalled();
  });

  it("falha de consulta devolve null, nunca lança", async () => {
    // A 1ª mensagem JÁ SAIU quando esta função roda. Lançar faria a rodada
    // marcar como falha um envio que aconteceu — ou tentar de novo e mandar a
    // mesma mensagem duas vezes.
    const { client } = supabaseFake({ crm_leads: { error: { message: "timeout" } } });
    await expect(garantirCardDaAbordagem(client, { campanha, ...entrada })).resolves.toBeNull();
  });

  it("o card nasce MARCADO como criação em lote, no argumento que o handler lê", async () => {
    // ⚠️ ESTE TESTE EXISTE POR UM DEFEITO REAL: a marca `via` estava no objeto
    // de CONTEXTO, e `createLeadHandler` lê `input.via` (o terceiro argumento).
    // O cast `as never` do contexto engoliu o campo sem um ruído, e a cascata
    // ficava DESTAMPADA — o gatilho "Lead criado" e o motor de regras mandando
    // uma mensagem proativa por card, centenas no mesmo minuto em que a
    // campanha acabou de falar com essas mesmas pessoas — com o código, os
    // comentários e o teste do predicado todos parecendo resolvidos.
    //
    // Por isso ele confere o ARGUMENTO, não o comportamento: é a ligação que
    // falhou, e é a ligação que nenhum outro teste alcançava.
    const { client } = supabaseFake({
      crm_leads: { data: null },
      crm_stages: { data: { id: "etapa-1" } },
      contacts: { data: { id: "c-1", name: "Ana", display_name: null, phone_number: "+5548999990000" } },
    });
    const { createLeadHandler } = await import("@/app/api/v1/leads/_handler");
    vi.mocked(createLeadHandler).mockClear();

    const r = await garantirCardDaAbordagem(client, { campanha, ...entrada });
    expect(r).toBe("lead-novo");

    const input = vi.mocked(createLeadHandler).mock.calls[0]?.[2] as Record<string, unknown>;
    expect(input.via).toBe(ORIGEM_CAMPANHA);
    // E a origem, que é o que impede a métrica do funil de passar a mentir.
    expect(input.source).toBe(ORIGEM_CAMPANHA);
    expect(input.source_metadata).toMatchObject({
      campaign_id: campanha.id,
      campaign_recipient_id: entrada.destinatarioId,
      nasceu_na: "abordagem",
    });
    expect(input.stage_id).toBe(campanha.stage_id);
  });

  it("funil sem etapa de entrada devolve null em vez de card sem coluna", async () => {
    const { client } = supabaseFake({
      crm_leads: { data: null },
      // `stage_id` em branco força a busca da 1ª etapa, que não existe.
      crm_stages: { data: null },
    });
    const r = await garantirCardDaAbordagem(client, {
      campanha: { ...campanha, stage_id: null },
      ...entrada,
    });
    expect(r).toBeNull();
  });
});
