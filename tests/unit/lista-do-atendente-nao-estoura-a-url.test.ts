import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { listConversationsHandler } from "@/app/api/v1/conversations/_handler";

/**
 * OS IDS PESSOAIS (9042) SAEM DO MESMO ORÇAMENTO DA BUSCA (revisão do Cassio, P2).
 *
 * Fixadas (`not id in`) e marcadas (`or id.in`) viajam na MESMA URL que os ids
 * de contato da busca. Somados por fora do orçamento, busca + "Não lidas" +
 * dezenas de marcadas passavam do muro de 8 KB do Kong: 414, que o handler
 * vira 500, e o Inbox para. Aqui a URL é construída pelo `postgrest-js` de
 * verdade, pelo handler de verdade, e medida.
 */

const MURO_DO_GATEWAY = 8_192;
const uuid = (p: string, i: number) => `${p}${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`;

async function urlsDaLista(opts: { search: string; marcadas: number; fixadas: number; contatos: number }) {
  const urls: string[] = [];
  const contatos = Array.from({ length: opts.contatos }, (_, i) => ({ id: uuid("c", i) }));
  const sb = createClient("http://127.0.0.1:54321", "x".repeat(200), {
    global: {
      fetch: async (u: RequestInfo | URL) => {
        const url = String(u);
        urls.push(url);
        const corpo = url.includes("/rest/v1/contacts") ? contatos : [];
        return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  });
  await listConversationsHandler(
    sb as never,
    { organization_id: uuid("o", 1), requestId: "r", actor: { type: "user", id: uuid("u", 1) } } as never,
    { limit: 50, unread: true, search: opts.search } as never,
    {
      excetoIds: Array.from({ length: opts.fixadas }, (_, i) => uuid("f", i)),
      naoLidasExtras: Array.from({ length: opts.marcadas }, (_, i) => uuid("m", i)),
    },
  );
  return urls.filter((u) => u.includes("/rest/v1/conversations"));
}

describe("a lista do atendente não estoura a URL", () => {
  it("busca longa + 120 contatos casados + 10 fixadas + 200 marcadas: abaixo do muro, sem erro", async () => {
    const [url] = await urlsDaLista({ search: "silva ".repeat(16).trim(), marcadas: 200, fixadas: 10, contatos: 120 });
    expect(url, "a sonda não capturou a URL da lista").toBeDefined();
    expect(url!.length).toBeLessThan(MURO_DO_GATEWAY);
    // Os pessoais vão primeiro: as fixadas excluídas estão TODAS na URL.
    expect(decodeURIComponent(url!)).toContain(uuid("f", 9));
  });

  it("CONTROLE: a sonda enxerga o que mede (marcadas e contatos da busca chegam à URL)", async () => {
    const [url] = await urlsDaLista({ search: "silva", marcadas: 2, fixadas: 1, contatos: 3 });
    const u = decodeURIComponent(url!);
    expect(u).toContain(uuid("m", 1));
    expect(u).toContain(uuid("c", 2));
  });
});
