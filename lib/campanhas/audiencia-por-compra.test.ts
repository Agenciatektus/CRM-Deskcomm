import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  casaCompra,
  FILTRO_VAZIO,
  filtroDeAudienciaSchema,
  resumirPedidos,
  type FiltroDeAudiencia,
} from "./audiencia";
import { buscarCandidatos } from "./consulta-de-audiencia";

/**
 * Público por COMPRA (tabela `orders`) e o bloco `excluir`.
 *
 * Borda dos dias: janela móvel de 24 h, pontas inclusivas (ver `audiencia.ts`).
 */

const AGORA = new Date(Date.UTC(2026, 5, 1, 12));
const DIA = 86_400_000;
const haDias = (d: number, extraMs = 0) => new Date(AGORA.getTime() - d * DIA + extraMs).toISOString();
const uuid = (i: number) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`;
const ORG = "99999999-9999-4999-8999-999999999999";

const criterios = (parcial: Partial<FiltroDeAudiencia>): FiltroDeAudiencia => ({ ...FILTRO_VAZIO, ...parcial });
const resumoDe = (ordered_at: string, status = "paid", total_cents = 1000) =>
  resumirPedidos([{ contact_id: "c", status, ordered_at, total_cents }]).get("c");

describe("schema: compatibilidade e regras", () => {
  it("filtro antigo, sem os campos novos, continua válido e ganha nulos", () => {
    const antigo = { com_alguma_tag: ["vip"], sem_interacao_ha_dias: 30, limite: 200 };
    const r = filtroDeAudienciaSchema.parse(antigo);
    expect(r.ultima_compra_ha_dias_min).toBeNull();
    expect(r.ultima_compra_ha_dias_max).toBeNull();
    expect(r.compras_min).toBeNull();
    expect(r.gasto_min_centavos).toBeNull();
    expect(r.excluir).toBeNull();
  });

  it("critério de compra sozinho vale como recorte", () => {
    expect(filtroDeAudienciaSchema.safeParse({ ultima_compra_ha_dias_min: 60 }).success).toBe(true);
  });

  it("só exclusão NÃO vale: precisa de critério positivo", () => {
    expect(filtroDeAudienciaSchema.safeParse({ excluir: { ultima_compra_ha_dias_max: 30 } }).success).toBe(false);
  });

  it("exclusão não aceita limite nem listas à mão", () => {
    const r = filtroDeAudienciaSchema.safeParse({
      com_alguma_tag: ["vip"],
      excluir: { com_alguma_tag: ["x"], limite: 10 },
    });
    expect(r.success).toBe(false);
  });

  it("mínimo de dias acima do máximo é recusado, no positivo e na exclusão", () => {
    expect(
      filtroDeAudienciaSchema.safeParse({ ultima_compra_ha_dias_min: 60, ultima_compra_ha_dias_max: 30 }).success,
    ).toBe(false);
    expect(
      filtroDeAudienciaSchema.safeParse({
        com_alguma_tag: ["vip"],
        excluir: { ultima_compra_ha_dias_min: 60, ultima_compra_ha_dias_max: 30 },
      }).success,
    ).toBe(false);
  });
});

describe("casaCompra: bordas", () => {
  it("sem pedido nenhum não casa com critério de compra algum", () => {
    expect(casaCompra(undefined, criterios({ ultima_compra_ha_dias_min: 0 }), AGORA)).toBe(false);
    expect(casaCompra(undefined, criterios({ gasto_min_centavos: 0 }), AGORA)).toBe(false);
  });

  it("só pedido cancelado, estornado ou pendente é como não ter comprado", () => {
    for (const status of ["cancelled", "refunded", "pending"]) {
      expect(resumoDe(haDias(90), status)).toBeUndefined();
    }
    expect(resumoDe(haDias(90), "delivered")).toBeDefined();
  });

  it("0 dias: compra agora casa com max 0 e com min 0", () => {
    const r = resumoDe(AGORA.toISOString());
    expect(casaCompra(r, criterios({ ultima_compra_ha_dias_max: 0 }), AGORA)).toBe(true);
    expect(casaCompra(r, criterios({ ultima_compra_ha_dias_min: 0 }), AGORA)).toBe(true);
    expect(casaCompra(r, criterios({ ultima_compra_ha_dias_min: 1 }), AGORA)).toBe(false);
  });

  it("30 dias exatos: dentro de max 30 e de min 30; 1 ms antes sai do max", () => {
    const exato = resumoDe(haDias(30));
    expect(casaCompra(exato, criterios({ ultima_compra_ha_dias_max: 30 }), AGORA)).toBe(true);
    expect(casaCompra(exato, criterios({ ultima_compra_ha_dias_min: 30 }), AGORA)).toBe(true);
    const umMsMaisVelha = resumoDe(haDias(30, -1));
    expect(casaCompra(umMsMaisVelha, criterios({ ultima_compra_ha_dias_max: 30 }), AGORA)).toBe(false);
  });

  it("60 dias exatos entra em \"há mais de 60\"; 1 ms mais nova fica fora", () => {
    expect(casaCompra(resumoDe(haDias(60)), criterios({ ultima_compra_ha_dias_min: 60 }), AGORA)).toBe(true);
    expect(casaCompra(resumoDe(haDias(60, 1)), criterios({ ultima_compra_ha_dias_min: 60 }), AGORA)).toBe(false);
  });

  it("vale a ÚLTIMA compra: compra antiga não põe em \"há mais de 60\" quem comprou ontem", () => {
    const r = resumirPedidos([
      { contact_id: "c", status: "paid", ordered_at: haDias(200), total_cents: 100 },
      { contact_id: "c", status: "paid", ordered_at: haDias(1), total_cents: 100 },
    ]).get("c");
    expect(casaCompra(r, criterios({ ultima_compra_ha_dias_min: 60 }), AGORA)).toBe(false);
  });

  it("compras_min e gasto_min contam só pedidos efetivos (bigint em string inclusive)", () => {
    const r = resumirPedidos([
      { contact_id: "c", status: "paid", ordered_at: haDias(10), total_cents: "5000" },
      { contact_id: "c", status: "cancelled", ordered_at: haDias(5), total_cents: 99_999 },
      { contact_id: "c", status: "shipped", ordered_at: haDias(3), total_cents: 2500 },
    ]).get("c");
    expect(r).toMatchObject({ compras: 2, gastoCentavos: 7500 });
    expect(casaCompra(r, criterios({ compras_min: 2 }), AGORA)).toBe(true);
    expect(casaCompra(r, criterios({ compras_min: 3 }), AGORA)).toBe(false);
    expect(casaCompra(r, criterios({ gasto_min_centavos: 7500 }), AGORA)).toBe(true);
    expect(casaCompra(r, criterios({ gasto_min_centavos: 7501 }), AGORA)).toBe(false);
  });
});

/**
 * PostgREST de mentira só com o que este caminho usa: `orders` (status `in`,
 * keyset, `max_rows`) e `contacts` (`id=in.(…)`, keyset). Tags e silêncio não
 * são modelados: o predicado de contato aqui é só o recorte por id.
 */
function bancoFalso(
  contatos: string[],
  pedidos: Array<{ contact_id: string; status: string; ordered_at: string; total_cents: number }>,
  maxRows = 1000,
) {
  const urls: string[] = [];
  const quando = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
  const contatosBase = contatos.map((id, i) => ({ id, created_at: quando(i) }));
  const pedidosBase = pedidos.map((p, i) => ({ ...p, id: uuid(5000 + i), created_at: quando(i) }));
  const depoisDoCursor = (or: string[]) => {
    const keyset = or.find((o) => o.includes("created_at.gt."));
    if (!keyset) return () => true;
    const m = /created_at\.gt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.gt\.([^)]+)\)/.exec(keyset)!;
    return (l: { created_at: string; id: string }) =>
      l.created_at > m[1]! || (l.created_at === m[1] && l.id > m[2]!);
  };
  const sb = createClient("http://127.0.0.1:54321", "x".repeat(200), {
    global: {
      fetch: async (entrada: RequestInfo | URL) => {
        const url = new URL(String(entrada));
        urls.push(url.toString());
        const limite = Math.min(Number(url.searchParams.get("limit") ?? maxRows), maxRows);
        const passa = depoisDoCursor(url.searchParams.getAll("or"));
        let linhas: Array<Record<string, unknown>>;
        if (url.pathname.endsWith("/orders")) {
          const st = url.searchParams.get("status")!;
          const permitidos = new Set(st.slice(4, -1).split(","));
          linhas = pedidosBase.filter((p) => permitidos.has(p.status) && passa(p));
        } else {
          const filtroIds = url.searchParams.getAll("id").find((v) => v.startsWith("in."));
          const ids = filtroIds ? new Set(filtroIds.slice(4, -1).split(",")) : null;
          linhas = contatosBase
            .filter((c) => (!ids || ids.has(c.id)) && passa(c))
            .map((c) => ({
              ...c,
              name: "Pessoa Teste",
              display_name: null,
              phone_number: "5500000000000",
              is_blocked: false,
              is_personal: false,
              is_anonymized: false,
              consent: null,
            }));
        }
        linhas.sort((a, b) =>
          String(a.created_at) < String(b.created_at) ? -1 : String(a.created_at) > String(b.created_at) ? 1 : 0,
        );
        return new Response(JSON.stringify(linhas.slice(0, limite)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  return { sb, urls };
}

const A = uuid(1); // comprou há 90 dias
const B = uuid(2); // comprou há 90 e há 10
const C = uuid(3); // só cancelado
const D = uuid(4); // sem pedido

const PEDIDOS = [
  { contact_id: A, status: "paid", ordered_at: haDias(90), total_cents: 1000 },
  { contact_id: B, status: "delivered", ordered_at: haDias(90), total_cents: 1000 },
  { contact_id: B, status: "paid", ordered_at: haDias(10), total_cents: 1000 },
  { contact_id: C, status: "cancelled", ordered_at: haDias(90), total_cents: 1000 },
];

async function ids(banco: ReturnType<typeof bancoFalso>, filtro: z.input<typeof filtroDeAudienciaSchema>) {
  const { candidatos } = await buscarCandidatos(banco.sb, {
    organizationId: ORG,
    filtro: filtroDeAudienciaSchema.parse(filtro),
    agora: AGORA,
  });
  return candidatos.map((c) => c.contactId).sort();
}

describe("buscarCandidatos com compra e exclusão", () => {
  it("\"comprou há mais de 60\": quem tem última compra antiga; sem pedido e só cancelado ficam fora", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS);
    expect(await ids(banco, { ultima_compra_ha_dias_min: 60 })).toEqual([A]);
  });

  it("toda consulta leva o filtro de organização, e `orders` só pede status efetivos", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS);
    await ids(banco, { gasto_min_centavos: 1 });
    for (const u of banco.urls) expect(u).toContain(`organization_id=eq.${ORG}`);
    const deOrders = banco.urls.filter((u) => u.includes("/orders"));
    expect(deOrders.length).toBeGreaterThan(0);
    for (const u of deOrders) {
      expect(decodeURIComponent(u)).toContain("status=in.(paid,fulfilled,shipped,delivered)");
    }
  });

  it("exclusão por compra: comprou alguma vez E NÃO comprou nos últimos 30", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS);
    expect(await ids(banco, { compras_min: 1, excluir: { ultima_compra_ha_dias_max: 30 } })).toEqual([A]);
  });

  it("exclusão que pega todo mundo zera o público", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS);
    expect(await ids(banco, { compras_min: 1, excluir: { compras_min: 1 } })).toEqual([]);
  });

  it("exclusão também vale no caminho por keyset (sem compra/negócio no positivo), página a página", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS, 2);
    // `com_alguma_tag` não é modelado pelo dublê: devolve a base inteira.
    expect(await ids(banco, { com_alguma_tag: ["vip"], excluir: { compras_min: 1 } })).toEqual([C, D]);
  });

  it("exclusão sem critério nenhum não tira ninguém", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS);
    expect(await ids(banco, { compras_min: 1, excluir: {} })).toEqual([A, B]);
  });

  it("incluído à mão entra mesmo que a exclusão o pegue (como `excluir_contatos`)", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS);
    expect(
      await ids(banco, { compras_min: 1, incluir_contatos: [B], excluir: { ultima_compra_ha_dias_max: 30 } }),
    ).toEqual([A, B]);
  });

  it("pedidos paginados: max_rows pequeno não perde a compra recente da pessoa", async () => {
    const banco = bancoFalso([A, B, C, D], PEDIDOS, 1);
    expect(await ids(banco, { ultima_compra_ha_dias_min: 60 })).toEqual([A]);
  });
});
