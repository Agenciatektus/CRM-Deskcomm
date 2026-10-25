import { beforeEach, describe, expect, it, vi } from "vitest";

const status = vi.fn(async (..._a: unknown[]) => ({ ativo: true }));
const resolver = vi.fn(async (_a: unknown, l: { instanceName: string }) => ({
  instanceName: l.instanceName,
  token: "T",
  vinculoId: "v",
  baseUrl: "b",
}));
vi.mock("@/lib/channels/verdash/client", () => ({ verdashConversoesStatus: (...a: unknown[]) => status(...a) }));
vi.mock("@/lib/channels/verdash/credentials", () => ({
  resolveVerdashCreds: (a: unknown, l: { instanceName: string }) => resolver(a, l),
}));
const estado = vi.fn();
vi.mock("@/lib/conversoes/estado-da-conexao", () => ({ lerEstadoDaConexao: (...a: unknown[]) => estado(...a) }));

interface Sessao {
  organization_id: string;
  provider: string;
  verdash_instance_name: string;
  verdash_vinculo_id: string | null;
  archived_at: string | null;
}

type Linha = { status: string; reason: string | null };
const UM_ENVIO: Linha[] = [{ status: "sent", reason: null }];

/** `historico`: linhas do livro-razão, da mais nova para a mais antiga. */
function banco(sessoes: Sessao[], historico: Linha[] = UM_ENVIO) {
  const admin = {
    from: (tabela: string) => ({
      select: (_c: string, opc?: { head?: boolean }) => {
        const eqs: Record<string, unknown> = {};
        const q: Record<string, unknown> = {};
        const resultado = () =>
          tabela === "ad_conversion_dispatches"
            ? { data: historico, error: null }
            : {
                data: sessoes.filter(
                  (s) =>
                    Object.entries(eqs).every(([k, v]) => s[k as keyof Sessao] === v) &&
                    s.verdash_vinculo_id !== null &&
                    s.archived_at === null,
                ),
                error: null,
              };
        q.eq = (c: string, v: unknown) => ((eqs[c] = v), q);
        q.not = () => q;
        q.gte = () => q;
        q.in = () => q;
        q.order = () => q;
        q.limit = () => q;
        q.is = () => q;
        q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
        void opc;
        return q;
      },
    }),
  };
  return admin as never;
}

const sessao = (o: Partial<Sessao> = {}): Sessao => ({
  organization_id: "org-1",
  provider: "verdash",
  verdash_instance_name: "i1",
  verdash_vinculo_id: "v1",
  archived_at: null,
  ...o,
});

beforeEach(() => {
  status.mockClear();
  status.mockImplementation(async () => ({ ativo: true }));
  resolver.mockClear();
  estado.mockReset();
  estado.mockResolvedValue({ conectada: true, datasetId: "123456", temToken: true, habilitada: true, testEventCode: null });
});

async function porta() {
  return (await import("@/lib/channels/conversoes-do-canal")).avisarCanaisSobreConversoes;
}

describe("avisarCanaisSobreConversoes", () => {
  it("avisa só a sessão pareada da PRÓPRIA organização; direta e arquivada ficam de fora", async () => {
    const avisar = await porta();
    const admin = banco([
      sessao(),
      sessao({ verdash_instance_name: "direta", verdash_vinculo_id: null }),
      sessao({ verdash_instance_name: "arquivada", archived_at: "2026-01-01" }),
      sessao({ verdash_instance_name: "outra-org", organization_id: "org-2" }),
    ]);
    const r = await avisar(admin, "org-1");
    expect(r).toEqual({ avisadas: 1, falhas: 0 });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: "i1" }),
      { ativo: true, pixel_id: "123456", eventos: ["Purchase"] },
      expect.any(Number),
    );
  });

  it("a falha de uma sessão não impede as outras", async () => {
    const avisar = await porta();
    status.mockRejectedValueOnce(new Error("verdash_unreachable: x"));
    const r = await avisar(banco([sessao(), sessao({ verdash_instance_name: "i2" })]), "org-1");
    expect(r).toEqual({ avisadas: 1, falhas: 1 });
  });

  it("sem conexão: avisa inativo", async () => {
    const avisar = await porta();
    estado.mockResolvedValue({ conectada: false, datasetId: null, temToken: false, habilitada: false, testEventCode: null });
    await avisar(banco([sessao()]), "org-1");
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
  });

  it("erros e nenhum envio: avisa inativo", async () => {
    const avisar = await porta();
    await avisar(banco([sessao()], [{ status: "error", reason: null }]), "org-1");
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
  });

  it("histórico vazio: avisa inativo", async () => {
    const avisar = await porta();
    await avisar(banco([sessao()], []), "org-1");
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
  });

  it("último envio `error` depois de um `sent`: avisa inativo", async () => {
    const avisar = await porta();
    await avisar(
      banco([sessao()], [{ status: "error", reason: null }, { status: "sent", reason: null }]),
      "org-1",
    );
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
  });

  it("`skipped` de credencial depois do último `sent`: inativo; antes dele: ativo", async () => {
    const avisar = await porta();
    await avisar(
      banco([sessao()], [{ status: "skipped", reason: "cifra_indisponivel" }, { status: "sent", reason: null }]),
      "org-1",
    );
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
    await avisar(
      banco([sessao()], [{ status: "sent", reason: null }, { status: "skipped", reason: "credencial_incompleta" }]),
      "org-1",
    );
    expect(status.mock.calls[1]![1]).toMatchObject({ ativo: true });
  });

  it("testEventCode preenchido: avisa inativo", async () => {
    const avisar = await porta();
    estado.mockResolvedValue({ conectada: true, datasetId: "123456", temToken: true, habilitada: true, testEventCode: "TEST123" });
    await avisar(banco([sessao()]), "org-1");
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
  });

  it("forcarInativo (org parada): avisa inativo sem ler a conexão", async () => {
    const avisar = await porta();
    await avisar(banco([sessao()]), "org-1", { forcarInativo: true });
    expect(status.mock.calls[0]![1]).toEqual({ ativo: false });
    expect(estado).not.toHaveBeenCalled();
  });

  it("nunca lança, nem com o banco quebrado", async () => {
    const avisar = await porta();
    const quebrado = { from: () => { throw new Error("banco fora"); } } as never;
    await expect(avisar(quebrado, "org-1")).resolves.toEqual({ avisadas: 0, falhas: 1 });
  });
});
