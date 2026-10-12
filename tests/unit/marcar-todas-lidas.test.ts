/**
 * "Marcar todas como lidas" em lote (M2.1, regras do @Cassio_SecRev na #173):
 * - o servidor decide o conjunto, por organização e pelo usuário (sem ids do cliente);
 * - só o estado de leitura do PRÓPRIO atendente (contador das conversas dele e a
 *   marca pessoal dele);
 * - pelo FILTRO, sem lista de ids na URL (P1 do Cassio na #178), contando o que mudou,
 *   idempotente, auditado;
 * - nenhum "visto" no WhatsApp: a rota e o módulo não tocam canal nenhum.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { marcarTodasComoLidas } from "@/lib/inbox/marcar-todas-lidas";

type Pedido = { metodo: string; url: string; corpo: unknown; prefer: string | null };

/**
 * O cliente DE VERDADE do supabase-js, com o `fetch` trocado: cada pedido HTTP que ele
 * montaria para o PostgREST fica registrado (método, URL inteira, corpo). É o que mede
 * o tamanho da URL de verdade, e não o de uma imitação.
 */
function clienteGravado(atualizadas: { conversations: number; estado: number }) {
  const pedidos: Pedido[] = [];
  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const cabecalhos = new Headers(init?.headers);
    pedidos.push({ metodo: init?.method ?? "GET", url, corpo: init?.body ? JSON.parse(String(init.body)) : null, prefer: cabecalhos.get("Prefer") });
    const n = url.includes("/conversation_user_state") ? atualizadas.estado : atualizadas.conversations;
    return new Response(null, { status: 204, headers: { "Content-Range": `*/${n}` } });
  };
  const cliente = createClient("https://crm.exemplo.com.br", "chave-anon", { global: { fetch: fetchFalso as typeof fetch } });
  return { cliente: cliente as never, pedidos };
}

const ALVO = { orgId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222" };

describe("marcar todas como lidas: o conjunto e o dono", () => {
  it("dois UPDATEs pelo FILTRO: organização, dono ou usuário e não lida, sem lista de ids", async () => {
    const { cliente, pedidos } = clienteGravado({ conversations: 3, estado: 1 });
    await marcarTodasComoLidas(cliente, ALVO);
    expect(pedidos.map((p) => p.metodo)).toEqual(["PATCH", "PATCH"]);
    const [conversas, estado] = pedidos.map((p) => new URL(p.url));
    expect(conversas!.pathname).toBe("/rest/v1/conversations");
    expect(conversas!.searchParams.get("organization_id")).toBe(`eq.${ALVO.orgId}`);
    // O contador é de quem ATENDE: só as conversas atribuídas a quem pediu.
    expect(conversas!.searchParams.get("assigned_to_user_id")).toBe(`eq.${ALVO.userId}`);
    expect(conversas!.searchParams.get("unread_count_for_assignee")).toBe("gt.0");
    expect(estado!.pathname).toBe("/rest/v1/conversation_user_state");
    expect(estado!.searchParams.get("organization_id")).toBe(`eq.${ALVO.orgId}`);
    expect(estado!.searchParams.get("user_id")).toBe(`eq.${ALVO.userId}`);
    expect(estado!.searchParams.get("marked_unread_at")).toBe("not.is.null");
    for (const p of pedidos) expect(p.url).not.toMatch(/[?&]id=in\.|conversation_id=in\./);
  });

  it("a URL fica pequena e de tamanho fixo (bem abaixo dos ~8 KB)", async () => {
    const { cliente, pedidos } = clienteGravado({ conversations: 5000, estado: 5000 });
    await marcarTodasComoLidas(cliente, ALVO);
    for (const p of pedidos) expect(p.url.length).toBeLessThan(8 * 1024);
    expect(Math.max(...pedidos.map((p) => p.url.length))).toBeLessThan(400);
  });

  it("zera só o contador e limpa só a marca pessoal", async () => {
    const { cliente, pedidos } = clienteGravado({ conversations: 1, estado: 1 });
    await marcarTodasComoLidas(cliente, ALVO);
    expect(pedidos[0]!.corpo).toEqual({ unread_count_for_assignee: 0 });
    expect(Object.keys(pedidos[1]!.corpo as object).sort()).toEqual(["marked_unread_at", "updated_at"]);
  });

  it("conta as linhas REALMENTE atualizadas (count exact do próprio UPDATE)", async () => {
    const { cliente, pedidos } = clienteGravado({ conversations: 7, estado: 2 });
    expect(await marcarTodasComoLidas(cliente, ALVO)).toEqual({ contadores: 7, marcas: 2 });
    for (const p of pedidos) expect(p.prefer).toContain("count=exact");
  });

  it("idempotente: sem nada a marcar, volta zero", async () => {
    const { cliente } = clienteGravado({ conversations: 0, estado: 0 });
    expect(await marcarTodasComoLidas(cliente, ALVO)).toEqual({ contadores: 0, marcas: 0 });
  });
});

describe("marcar todas como lidas: sem visto no WhatsApp", () => {
  it("nem o módulo nem a rota importam canal, adaptador ou cliente admin", () => {
    for (const arquivo of ["lib/inbox/marcar-todas-lidas.ts", "app/api/v1/conversations/mark-all-read/route.ts"]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, arquivo).not.toMatch(/from "@\/lib\/channels/);
      expect(fonte, arquivo).not.toMatch(/createAdminClient|supabase\/admin/);
    }
  });

  it("a ação individual também não envia visto (é ela que o lote espelha)", () => {
    const individual = readFileSync("app/api/v1/conversations/[id]/mark-read/route.ts", "utf8");
    expect(individual).not.toMatch(/from "@\/lib\/channels/);
  });
});
