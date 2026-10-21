/**
 * POST /api/v1/tags/vocabulario/lote — os mesmos portões da rota de uma
 * etiqueta, uma chamada da função de banco por etiqueta, e a parada na
 * primeira recusa com o que já foi aplicado.
 *
 * O `requireRole` é o DE VERDADE (como em
 * `tags-vocabulario-sem-atalho-de-platform-admin.test.ts`): só sessão, papel
 * no banco e as RPCs são dublês.
 *
 *     npx vitest run tests/unit/tags-vocabulario-lote-rota.test.ts
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000e6";

const estado = vi.hoisted(() => ({
  papel: "manager",
  falharEm: null as string | null,
  suporteSoLeitura: false,
  mfaPendente: false,
}));
const rpc = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());

const USUARIO = { id: "u-gerente", email: "g@example.com", is_platform_admin: false, support: null, idioma: "pt-BR" };

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => USUARIO,
  requireAuth: async () => USUARIO,
  resolveActiveOrg: async () => ({ orgId: ORG, name: "Org", role: estado.papel }),
  orgAtivaSemPortao: async () => ({ orgId: ORG, name: "Org", role: estado.papel, org_status: "active" }),
  mfaEmDivida: async () => estado.mfaPendente,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("@/lib/impersonate/support", async () => {
  const { fail } = await import("@/lib/api/wrappers");
  return {
    // O dublê devolve a MESMA recusa que a função de verdade devolve para uma
    // sessão de acompanhamento somente-leitura.
    requireSupportWrite: async () =>
      estado.suporteSoLeitura ? fail("forbidden", "Acompanhamento somente leitura.", 403) : null,
  };
});

import { POST } from "@/app/api/v1/tags/vocabulario/lote/route";

const operacoes = () =>
  rpc.mock.calls.filter((c) => c[0] === "fn_vocabulario_de_tags_operar").map((c) => c[1] as Record<string, unknown>);

function postar(corpo: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/tags/vocabulario/lote", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  estado.papel = "manager";
  estado.falharEm = null;
  estado.suporteSoLeitura = false;
  estado.mfaPendente = false;
  audit.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "fn_user_role_in_org") return { data: estado.papel, error: null };
    if (fn === "fn_vocabulario_de_tags_operar") {
      if (args.p_tag === estado.falharEm)
        return { data: null, error: { code: "42501", message: "tags_mfa_required" } };
      return { data: { contatos: 2, leads: 1, conversas: 0, regras: 0 }, error: null };
    }
    return { data: null, error: { message: `rpc inesperada: ${fn}` } };
  });
});

describe("rota do lote de etiquetas", () => {
  it("⭐ excluir chama a função UMA vez por etiqueta, com a organização da sessão, e soma", async () => {
    const resposta = await postar({ acao: "excluir", tags: ["ddd-11", "ddd-21"] });
    expect(resposta.status, await resposta.clone().text()).toBe(200);
    expect(operacoes()).toEqual([
      { p_org: ORG, p_acao: "excluir", p_tag: "ddd-11", p_destino: null, p_cor: null },
      { p_org: ORG, p_acao: "excluir", p_tag: "ddd-21", p_destino: null, p_cor: null },
    ]);
    const { data } = (await resposta.json()) as { data: Record<string, unknown> };
    expect(data).toEqual({ acao: "excluir", concluidas: 2, contatos: 4, leads: 2, conversas: 0, regras: 0 });
    // Uma linha de auditoria por etiqueta.
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it("juntar tira o destino e as repetidas das origens", async () => {
    const resposta = await postar({ acao: "juntar", tags: ["vip", "VIP", "Cliente-VIP", "vip-2"], destino: "cliente-vip" });
    expect(resposta.status).toBe(200);
    expect(operacoes().map((o) => [o.p_tag, o.p_destino])).toEqual([
      ["vip", "cliente-vip"],
      ["vip-2", "cliente-vip"],
    ]);
  });

  it("cor vai para todas, e destino não viaja", async () => {
    const resposta = await postar({ acao: "definir_cor", tags: ["a", "b"], cor: "#FFB224" });
    expect(resposta.status).toBe(200);
    expect(operacoes().map((o) => [o.p_tag, o.p_cor, o.p_destino])).toEqual([
      ["a", "#ffb224", null],
      ["b", "#ffb224", null],
    ]);
  });

  it.each([
    ["renomear não é ação de lote", { acao: "renomear", tags: ["a"], destino: "b" }],
    ["lista vazia", { acao: "excluir", tags: [] }],
    ["mais de 50", { acao: "excluir", tags: Array.from({ length: 51 }, (_, i) => `t${i}`) }],
    ["juntar sem destino", { acao: "juntar", tags: ["a"] }],
    ["juntar só com o próprio destino", { acao: "juntar", tags: ["a"], destino: "A" }],
    ["cor ausente", { acao: "definir_cor", tags: ["a"] }],
    ["cor no excluir", { acao: "excluir", tags: ["a"], cor: "#ffb224" }],
  ])("recusa com 422 antes do banco: %s", async (_caso, corpo) => {
    const resposta = await postar(corpo);
    expect(resposta.status).toBe(422);
    expect(operacoes()).toEqual([]);
  });

  it("⭐ para na primeira recusa e diz quantas já foram e qual recusou", async () => {
    estado.falharEm = "b";
    const resposta = await postar({ acao: "excluir", tags: ["a", "b", "c"] });
    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { error: { code: string; details: unknown } };
    expect(corpo.error.code).toBe("mfa_required");
    expect(corpo.error.details).toEqual({ concluidas: 1, tag: "b" });
    expect(operacoes().map((o) => o.p_tag)).toEqual(["a", "b"]);
  });

  it("⭐ sem papel de gerente, 403 antes de chamar a operação", async () => {
    estado.papel = "agent";
    const resposta = await postar({ acao: "excluir", tags: ["a"] });
    expect(resposta.status).toBe(403);
    expect(operacoes()).toEqual([]);
  });

  it("⭐ suporte somente-leitura: 403 antes de qualquer consulta ao banco", async () => {
    estado.suporteSoLeitura = true;
    const resposta = await postar({ acao: "excluir", tags: ["a"] });
    expect(resposta.status).toBe(403);
    // Nem o papel é lido: o portão do suporte vem antes de tudo.
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("⭐ segundo fator pendente: 403 mfa_required e a operação não sai", async () => {
    estado.mfaPendente = true;
    const resposta = await postar({ acao: "excluir", tags: ["a"] });
    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.code).toBe("mfa_required");
    expect(operacoes()).toEqual([]);
    // A auditoria registra a RECUSA (reason mfa_required), nunca uma operação feita.
    expect(audit.mock.calls.map((c) => (c[0] as { metadata?: { reason?: string } }).metadata?.reason)).toEqual([
      "mfa_required",
    ]);
  });

  it("controle: sem as duas pendências, o mesmo pedido passa e chama a operação", async () => {
    const resposta = await postar({ acao: "excluir", tags: ["a"] });
    expect(resposta.status).toBe(200);
    expect(operacoes()).toHaveLength(1);
  });
});
