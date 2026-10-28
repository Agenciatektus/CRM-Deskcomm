import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, filtros, valorDoFiltro, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({ emitir: vi.fn(), avisar: vi.fn() }));
vi.mock("@/lib/team/convites", () => ({ emitirConvite: h.emitir }));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: vi.fn(async () => ({ nome: "Marca da Instalação" })) }));
vi.mock("./emails", () => ({ avisarDonosDaInstalacao: h.avisar }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com/" } }));

import { efeitosDaCompra } from "./compra-efeitos";

const ORG = "org-passada-111";
const EMAIL = "pagadora.secreta@exemplo.com";
const compra = { id: "compra-9", email: EMAIL, nome_empresa: "Clínica Aurora", plano_chave: "plano-x" } as never;

function montar({ donos = [{ user_id: "dono-antigo" }], convites = [] as Array<{ id: string }>, trava = [{ id: "compra-9" }] as Array<{ id: string }> } = {}) {
  const banco = bancoFalso((c: Cadeia): Resposta => {
    if (c.tabela === "platform_admins") return { data: donos };
    if (c.tabela === "team_invites") return { data: convites };
    if (c.tabela === "cobranca_assinaturas") return { data: { plano_id: "pl-1" } };
    if (c.tabela === "cobranca_planos") return { data: { nome: "Com IA", preco_cents: 39700, intervalo: "mes" } };
    if (c.tabela === "cobranca_compras" && c.passos.some((p) => p.metodo === "select")) return { data: trava };
    return {};
  });
  const admin = {
    ...banco.cliente,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@dono.com`, user_metadata: { full_name: `Nome ${id}` } } }, error: null }) } },
  };
  return { banco, efeitos: efeitosDaCompra(admin as never) };
}

beforeEach(() => {
  h.emitir.mockReset().mockResolvedValue({});
  h.avisar.mockReset().mockResolvedValue(undefined);
});

describe("efeitosDaCompra.aoCriar", () => {
  it("emite UM convite de admin para o e-mail da compra, assinado pelo dono mais antigo", async () => {
    const { banco, efeitos } = montar();
    await efeitos.aoCriar!(ORG, compra);
    expect(h.emitir).toHaveBeenCalledTimes(1);
    expect(h.emitir.mock.calls[0]?.[1]).toEqual({
      email: EMAIL,
      role: "admin",
      organizationId: ORG,
      orgName: "Clínica Aurora",
      inviterId: "dono-antigo",
      inviterName: "Marca da Instalação",
      requestId: "compra-compra-9",
      origem: "compra",
    });
    const donos = banco.cadeias.find((c) => c.tabela === "platform_admins")!;
    expect(valorDoFiltro(donos, "eq", "scope")).toBe("full");
    expect(donos.passos.find((p) => p.metodo === "order")?.args).toEqual(["granted_at", { ascending: true }]);
    const convites = banco.cadeias.find((c) => c.tabela === "team_invites")!;
    expect(filtros(convites)).toEqual([["eq", "organization_id", ORG], ["eq", "email", EMAIL]]);
  });

  it("convite já existente para (empresa, e-mail): não emite outro, mas o dono é avisado", async () => {
    const { efeitos } = montar({ convites: [{ id: "c1" }] });
    await efeitos.aoCriar!(ORG, compra);
    expect(h.emitir).not.toHaveBeenCalled();
    expect(h.avisar).toHaveBeenCalledTimes(1);
  });

  it("sem dono ativo: lança e não emite", async () => {
    const { efeitos } = montar({ donos: [] });
    await expect(efeitos.aoCriar!(ORG, compra)).rejects.toThrow(/dono ativo/);
    expect(h.emitir).not.toHaveBeenCalled();
  });

  it("o aviso ao dono leva o nome da empresa, o plano, o e-mail mascarado e o botão da empresa", async () => {
    const { efeitos } = montar();
    await efeitos.aoCriar!(ORG, compra);
    const [, aviso] = h.avisar.mock.calls[0]!;
    expect(aviso.titulo).toBe("Nova empresa por compra direta: Clínica Aurora");
    expect(aviso.corpo).toMatch(/plano Com IA, R\$\s397,00 por mês/);
    expect(aviso.corpo).not.toContain("plano-x");
    expect(JSON.stringify(aviso)).not.toMatch(/[—–·]/);
    expect(aviso.corpo).toContain("p***@exemplo.com");
    expect(aviso.botao).toEqual({ rotulo: "Abrir a empresa", href: `https://crm.exemplo.com/admin/tenants/${ORG}` });
    expect(JSON.stringify(aviso)).not.toContain(EMAIL);
  });
});

describe("efeitosDaCompra.aoCriar: trava e nome", () => {
  const atualizacoes = (banco: ReturnType<typeof montar>["banco"]) => banco.cadeias.filter((c) => c.tabela === "cobranca_compras");

  it("inviterName é o nome da marca, nunca o e-mail do dono", async () => {
    const { efeitos } = montar();
    await efeitos.aoCriar!(ORG, compra);
    const nome = h.emitir.mock.calls[0]![1].inviterName as string;
    expect(nome).toBe("Marca da Instalação");
    expect(nome).not.toContain("@");
    expect(nome).not.toContain("dono-antigo");
  });

  it("trava ANTES de emitir, com filtro de motivo, e só depois limpa", async () => {
    const { banco, efeitos } = montar();
    const ordem: string[] = [];
    h.emitir.mockImplementation(async () => {
      ordem.push(`emitir:${atualizacoes(banco).length}`);
    });
    await efeitos.aoCriar!(ORG, compra);
    expect(ordem).toEqual(["emitir:1"]); // só a trava existia quando emitiu
    const [trava, limpeza] = atualizacoes(banco);
    expect(argumentos(trava!, "update")).toEqual([{ motivo: "convite_em_curso" }]);
    expect(valorDoFiltro(trava!, "eq", "id")).toBe("compra-9");
    expect(String(argumentos(trava!, "or")?.[0])).toMatch(/^motivo\.is\.null,motivo\.eq\.efeitos_pendentes,and\(motivo\.eq\.convite_em_curso,updated_at\.lt\./);
    expect(argumentos(trava!, "select")).toEqual(["id"]);
    expect(argumentos(limpeza!, "update")).toEqual([{ motivo: null }]);
    expect(valorDoFiltro(limpeza!, "eq", "motivo")).toBe("convite_em_curso");
    expect(h.avisar).toHaveBeenCalledTimes(1);
  });

  it("trava não obtida: não emite, não avisa, não limpa", async () => {
    const { banco, efeitos } = montar({ trava: [] });
    await efeitos.aoCriar!(ORG, compra);
    expect(h.emitir).not.toHaveBeenCalled();
    expect(h.avisar).not.toHaveBeenCalled();
    expect(atualizacoes(banco)).toHaveLength(1);
  });

  it("emitir falha: lança e não limpa (o catch da compra grava efeitos_pendentes)", async () => {
    const { banco, efeitos } = montar();
    h.emitir.mockRejectedValue(new Error("smtp"));
    await expect(efeitos.aoCriar!(ORG, compra)).rejects.toThrow("smtp");
    expect(atualizacoes(banco)).toHaveLength(1);
  });
});

describe("efeitosDaCompra.aoDuplicar", () => {
  it("mesma_sessao é a mesma cobrança: não avisa", async () => {
    const { efeitos } = montar();
    await efeitos.aoDuplicar!(compra, "mesma_sessao");
    expect(h.avisar).not.toHaveBeenCalled();
    expect(h.emitir).not.toHaveBeenCalled();
  });

  it("cliente_ja_vinculado avisa para conferir e estornar", async () => {
    const { efeitos } = montar();
    await efeitos.aoDuplicar!(compra, "cliente_ja_vinculado");
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0]![1].corpo).toContain("estorne");
  });

  it("só avisa o dono, sem convite e sem o e-mail cru", async () => {
    const { efeitos } = montar();
    await efeitos.aoDuplicar!(compra, "mesmo_email");
    expect(h.emitir).not.toHaveBeenCalled();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    const [, aviso] = h.avisar.mock.calls[0]!;
    expect(aviso.corpo).toContain("p***@exemplo.com");
    expect(JSON.stringify(aviso)).not.toContain(EMAIL);
  });
});
