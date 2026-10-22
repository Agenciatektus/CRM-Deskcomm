// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { FILTRO_VAZIO } from "./audiencia";
import { TETO_DE_INCLUIDOS, filtroParaIncluir, resumirInclusao } from "./incluir-do-funil";

/**
 * "Adicionar à campanha" (barra em lote do Funil): quem entra, quem fica de
 * fora e por quê, e a rota que só aceita rascunho de campanha em lista.
 */
const C = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const L = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;

describe("resumirInclusao (pura)", () => {
  it("⭐ cada motivo do lote e da pessoa conta, e só o resto entra", () => {
    const r = resumirInclusao({
      leadIds: [L(1), L(2), L(3), L(4), L(5), L(6), L(7), L(8), L(9)],
      contatoDoNegocio: new Map([
        [L(1), C(1)], // entra
        [L(2), null], // sem contato
        [L(3), C(1)], // mesmo contato de L1
        [L(4), C(4)], // já incluído
        [L(5), C(5)], // opt-out
        [L(6), C(6)], // indisponível (não voltou da consulta)
        [L(7), C(7)], // veto do TEXTO: não conta aqui, entra
        [L(9), C(9)], // sem telefone
      ]),
      jaIncluidos: [C(4)],
      vetoDoContato: new Map([
        [C(1), null],
        [C(5), "opt_out"],
        [C(7), "variavel_ausente"],
        [C(9), "sem_telefone"],
      ]),
    });
    expect(r.entram).toEqual([C(1), C(7)]);
    expect(r.fora).toEqual({
      sem_contato: 1,
      repetido_na_selecao: 1,
      ja_na_campanha: 1,
      opt_out: 1,
      contato_indisponivel: 1,
      negocio_nao_encontrado: 1, // L8 não voltou da consulta de negócios
      sem_telefone: 1,
    });
  });

  it("o teto de incluídos do filtro corta o excesso com motivo próprio", () => {
    const ja = Array.from({ length: TETO_DE_INCLUIDOS - 1 }, (_, i) => `ja-${i}`);
    const r = resumirInclusao({
      leadIds: [L(1), L(2)],
      contatoDoNegocio: new Map([
        [L(1), C(1)],
        [L(2), C(2)],
      ]),
      jaIncluidos: ja,
      vetoDoContato: new Map([
        [C(1), null],
        [C(2), null],
      ]),
    });
    expect(r.entram).toEqual([C(1)]);
    expect(r.fora).toEqual({ limite_da_campanha: 1 });
  });

  it("controle: tudo limpo, todos entram e ninguém fica de fora", () => {
    const r = resumirInclusao({
      leadIds: [L(1), L(2)],
      contatoDoNegocio: new Map([
        [L(1), C(1)],
        [L(2), C(2)],
      ]),
      jaIncluidos: [],
      vetoDoContato: new Map([
        [C(1), null],
        [C(2), null],
      ]),
    });
    expect(r).toEqual({ entram: [C(1), C(2)], fora: {} });
  });
});

describe("filtroParaIncluir", () => {
  it("o filtro vazio da campanha recém-criada vira base (o refine não barra)", () => {
    expect(filtroParaIncluir(FILTRO_VAZIO)).toEqual(FILTRO_VAZIO);
    expect(filtroParaIncluir(null)).toEqual(FILTRO_VAZIO);
  });

  it("guarda o recorte e os incluídos que já existiam", () => {
    const f = filtroParaIncluir({ ...FILTRO_VAZIO, com_alguma_tag: ["vip"], incluir_contatos: [C(1)] });
    expect(f).toMatchObject({ com_alguma_tag: ["vip"], incluir_contatos: [C(1)] });
  });

  it("controle: forma desconhecida não é sobrescrita (null)", () => {
    expect(filtroParaIncluir({ coluna_que_nao_existe: 1 })).toBeNull();
    expect(filtroParaIncluir("texto")).toBeNull();
  });
});

// ── A ROTA ────────────────────────────────────────────────────────────────
const estado = vi.hoisted(() => ({
  campanha: null as null | Record<string, unknown>,
  negocios: [] as Array<{ id: string; contact_id: string | null; organization_id: string }>,
  updates: [] as Array<{ valores: Record<string, unknown>; filtros: Record<string, unknown> }>,
  linhas: [] as Array<{ candidato: { contactId: string }; elegivel: boolean; motivo: string | null }>,
  classificarCom: null as null | Record<string, unknown>,
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("./acoes", () => ({
  carregarCampanha: vi.fn(async () =>
    estado.campanha
      ? { ok: true, campanha: estado.campanha }
      : { ok: false, codigo: "campanha_nao_encontrada", mensagem: "Campanha não encontrada.", status: 404 },
  ),
}));
vi.mock("./preparacao", () => ({
  classificar: vi.fn(async (_a: unknown, e: Record<string, unknown>) => {
    estado.classificarCom = e;
    return { linhas: estado.linhas, truncado: false };
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const filtros: Record<string, unknown> = {};
      let valores: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (v: Record<string, unknown>) => {
          valores = v;
          return q;
        },
        eq: (c: string, v: unknown) => {
          filtros[c] = v;
          return q;
        },
        in: async (_c: string, ids: string[]) => {
          expect(tabela).toBe("crm_leads");
          return {
            data: estado.negocios.filter((n) => ids.includes(n.id) && n.organization_id === filtros.organization_id),
            error: null,
          };
        },
        maybeSingle: async () => {
          expect(tabela).toBe("campaigns");
          estado.updates.push({ valores: valores!, filtros: { ...filtros } });
          return { data: { id: "camp" }, error: null };
        },
      };
      return q;
    },
  }),
}));

const ORG = "99999999-9999-4999-8999-999999999999";
const OUTRA = "88888888-8888-4888-8888-888888888888";
const CAMP = "77777777-7777-4777-8777-777777777777";

async function chamar(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/campaigns/[id]/incluir/route");
  const res = await POST(
    new NextRequest(`http://localhost/api/v1/campaigns/${CAMP}/incluir`, { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ id: CAMP }) },
  );
  const texto = await res.text();
  return { status: res.status, corpo: (texto ? JSON.parse(texto) : {}) as { data?: Record<string, unknown>; error?: { code: string } } };
}

describe("POST /api/v1/campaigns/:id/incluir", () => {
  beforeEach(async () => {
    const { requireRole } = await import("@/lib/auth/require-role");
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: { id: "u-1", idioma: "pt-BR" },
      org: { orgId: ORG, name: "Org", role: "manager" },
    } as never);
    estado.campanha = { id: CAMP, status: "draft", entrada_continua: false, audience_filter: FILTRO_VAZIO };
    estado.negocios = [
      { id: L(1), contact_id: C(1), organization_id: ORG },
      { id: L(2), contact_id: C(2), organization_id: ORG },
      { id: L(3), contact_id: null, organization_id: ORG },
      // Negócio de OUTRA organização: não é lido.
      { id: L(4), contact_id: C(4), organization_id: OUTRA },
    ];
    estado.linhas = [
      { candidato: { contactId: C(1) }, elegivel: true, motivo: null },
      { candidato: { contactId: C(2) }, elegivel: false, motivo: "opt_out" },
    ];
    estado.updates = [];
    estado.classificarCom = null;
  });

  it("⭐ conferir não grava, e conta quem entra e quem fica de fora por quê", async () => {
    const r = await chamar({ lead_ids: [L(1), L(2), L(3), L(4)] });
    expect(r.status).toBe(200);
    expect(r.corpo.data).toMatchObject({ entram: 1, gravado: false });
    const fora = r.corpo.data!.fora as Array<{ motivo: string; quantos: number; texto: string }>;
    expect(Object.fromEntries(fora.map((f) => [f.motivo, f.quantos]))).toEqual({
      opt_out: 1,
      sem_contato: 1,
      negocio_nao_encontrado: 1,
    });
    expect(fora.find((f) => f.motivo === "opt_out")!.texto).toBe("Pediu para não receber mensagens");
    expect(estado.updates).toHaveLength(0);
    // A classificação recebe SÓ os novos, nunca o recorte nem a base inteira.
    expect((estado.classificarCom!.filtro as { incluir_contatos: string[] }).incluir_contatos).toEqual([C(1), C(2)]);
  });

  it("⭐ confirmar grava SÓ quem entra, no filtro, com CAS no rascunho e na organização", async () => {
    estado.campanha!.audience_filter = { ...FILTRO_VAZIO, com_alguma_tag: ["vip"], incluir_contatos: [C(9)] };
    const r = await chamar({ lead_ids: [L(1), L(2)], confirmar: true });
    expect(r.status).toBe(200);
    expect(r.corpo.data).toMatchObject({ entram: 1, gravado: true });
    expect(estado.updates).toHaveLength(1);
    const { valores, filtros } = estado.updates[0]!;
    expect(valores.audience_filter).toMatchObject({ com_alguma_tag: ["vip"], incluir_contatos: [C(9), C(1)] });
    expect(filtros).toEqual({ organization_id: ORG, id: CAMP, status: "draft" });
  });

  it("campanha fora do rascunho (agendada) recusa com 409 e não grava", async () => {
    estado.campanha!.status = "scheduled";
    const r = await chamar({ lead_ids: [L(1)], confirmar: true });
    expect(r.status).toBe(409);
    expect(estado.updates).toHaveLength(0);
  });

  it("campanha de entrada contínua recusa com 409", async () => {
    estado.campanha!.entrada_continua = true;
    const r = await chamar({ lead_ids: [L(1)], confirmar: true });
    expect(r.status).toBe(409);
    expect(estado.updates).toHaveLength(0);
  });

  it("sem o papel: a recusa do gate volta, e nada é lido", async () => {
    const { requireRole } = await import("@/lib/auth/require-role");
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    const r = await chamar({ lead_ids: [L(1)], confirmar: true });
    expect(r.status).toBe(403);
    expect(estado.updates).toHaveLength(0);
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith("manager", expect.objectContaining({ resource: "campaigns" }));
  });

  it("sessão de suporte (somente leitura) é barrada antes de tudo", async () => {
    const { requireSupportWrite } = await import("@/lib/impersonate/support");
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(new Response(null, { status: 403 }) as never);
    const r = await chamar({ lead_ids: [L(1)], confirmar: true });
    expect(r.status).toBe(403);
    expect(estado.updates).toHaveLength(0);
  });

  it("controle: corpo inválido (sem negócios) é 422", async () => {
    const r = await chamar({ lead_ids: [] });
    expect(r.status).toBe(422);
  });
});
