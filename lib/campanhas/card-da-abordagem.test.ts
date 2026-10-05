/**
 * O card de quem foi abordado (migration 9035).
 *
 * O que estes testes protegem: a IDEMPOTÊNCIA e a falha fechada. Uma campanha de
 * 500 pessoas chama esta função 500 vezes, e repreparar, retomar ou repetir a
 * rodada a chamam de novo para as mesmas pessoas — se ela criar um segundo card,
 * o funil do cliente enche de duplicata e a métrica de origem passa a contar a
 * mesma pessoa duas vezes. E se ela LANÇAR, derruba a inscrição de alguém cuja
 * mensagem já saiu.
 */
import { describe, expect, it, vi } from "vitest";

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
