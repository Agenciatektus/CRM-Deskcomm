import { beforeEach, describe, expect, it, vi } from "vitest";

import { bancoFalso, filtros, valorDoFiltro, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({ emitir: vi.fn(), avisar: vi.fn() }));
vi.mock("@/lib/team/convites", () => ({ emitirConvite: h.emitir }));
vi.mock("./emails", () => ({ avisarDonosDaInstalacao: h.avisar }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.com/" } }));

import { efeitosDaCompra } from "./compra-efeitos";

const ORG = "org-passada-111";
const EMAIL = "pagadora.secreta@exemplo.com";
const compra = { id: "compra-9", email: EMAIL, nome_empresa: "Clínica Aurora", plano_chave: "plano-x" } as never;

function montar({ donos = [{ user_id: "dono-antigo" }], convites = [] as Array<{ id: string }> } = {}) {
  const banco = bancoFalso((c: Cadeia): Resposta => {
    if (c.tabela === "platform_admins") return { data: donos };
    if (c.tabela === "team_invites") return { data: convites };
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
      inviterName: "Nome dono-antigo",
      requestId: "compra-compra-9",
    });
    const donos = banco.cadeias.find((c) => c.tabela === "platform_admins")!;
    expect(valorDoFiltro(donos, "eq", "scope")).toBe("full");
    expect(donos.passos.find((p) => p.metodo === "order")?.args).toEqual(["created_at", { ascending: true }]);
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
    expect(aviso.titulo).toContain("Clínica Aurora");
    expect(aviso.corpo).toContain("plano-x");
    expect(aviso.corpo).toContain("p***@exemplo.com");
    expect(aviso.botao).toEqual({ rotulo: "Abrir a empresa", href: `https://crm.exemplo.com/admin/tenants/${ORG}` });
    expect(JSON.stringify(aviso)).not.toContain(EMAIL);
  });
});

describe("efeitosDaCompra.aoDuplicar", () => {
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
