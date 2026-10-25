import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/branding/saida", () => ({
  marcaDaSaida: vi.fn(async () => ({ nome: "CRM", logoUrl: null, accent: "#000", accentFg: "#fff" })),
  NEUTROS_DE_SAIDA: { fundo: "#fff", texto: "#000", suave: "#666" },
}));
const sendEmail = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/email/roteador", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { alertarVencimentoDaMeta } from "@/lib/plataformas-de-anuncio/meta/alerta/rodada";

const AGORA = new Date("2026-10-25T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;
const em = (d: number) => new Date(AGORA.getTime() + d * DIA).toISOString();

interface Conexao {
  organization_id: string;
  token_expires_at: string | null;
  needs_reconnect: boolean;
  needs_reconnect_desde: string | null;
  organizations: { status: string };
}

function encadeado(metodos: string[], fim: Record<string, unknown>) {
  const q: Record<string, unknown> = {};
  for (const m of metodos) q[m] = () => q;
  return Object.assign(q, fim);
}

function banco(conexoes: Conexao[], opcoes: { suporte?: string[]; erroVinculos?: boolean } = {}) {
  const claims = new Set<string>();
  const sino: Record<string, unknown>[] = [];
  const db = {
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@x.com` } } }) } },
    from: (tabela: string) => {
      if (tabela === "ad_insights_connections") {
        // Aplica o filtro `or` como o PostgREST: needs_reconnect OU vence até o limite.
        let limite = Infinity;
        const q = encadeado(["select", "eq", "order"], {
          or: (f: string) => {
            limite = Date.parse(f.split("token_expires_at.lte.")[1] ?? "");
            return q;
          },
          limit: (n: number) =>
            Promise.resolve({
              data: [...conexoes]
                .filter((c) => c.needs_reconnect || (c.token_expires_at !== null && Date.parse(c.token_expires_at) <= limite))
                .sort((a, b) => a.organization_id.localeCompare(b.organization_id))
                .slice(0, n),
              error: null,
            }),
        });
        return q;
      }
      if (tabela === "user_organizations") {
        return encadeado(["select", "eq"], {
          is: () =>
            Promise.resolve(
              opcoes.erroVinculos
                ? { data: null, error: { code: "57014" } }
                : { data: [{ user_id: "admin-1" }, { user_id: "suporte-1" }], error: null },
            ),
        });
      }
      if (tabela === "platform_admins") {
        return encadeado(["select", "in"], {
          is: () =>
            Promise.resolve({ data: (opcoes.suporte ?? []).map((user_id) => ({ user_id })), error: null }),
        });
      }
      if (tabela === "meta_alertas_enviados") {
        return {
          insert: (v: { organization_id: string; marco: string; janela: string }) => ({
            select: () => ({
              maybeSingle: async () => {
                const k = `${v.organization_id}|${v.marco}|${v.janela}`;
                if (claims.has(k)) return { data: null, error: { code: "23505" } };
                claims.add(k);
                return { data: { id: k }, error: null };
              },
            }),
          }),
        };
      }
      if (tabela === "organizations") {
        return encadeado(["select", "eq"], { maybeSingle: async () => ({ data: { locale: "pt-BR" } }) });
      }
      if (tabela === "agent_inbox_items") {
        return { insert: async (v: Record<string, unknown>) => (sino.push(v), { error: null }) };
      }
      throw new Error(`tabela inesperada ${tabela}`);
    },
  };
  return { db: db as never, sino };
}

const con = (sobrescreve: Partial<Conexao> = {}): Conexao => ({
  organization_id: "org-1",
  token_expires_at: em(2),
  needs_reconnect: false,
  needs_reconnect_desde: null,
  organizations: { status: "active" },
  ...sobrescreve,
});

describe("alertarVencimentoDaMeta", () => {
  beforeEach(() => sendEmail.mockClear());

  it("avisa sino, push e e-mail dos admins, SEM o usuário de suporte", async () => {
    const push = vi.fn(async (..._a: unknown[]) => undefined);
    const { db, sino } = banco([con()], { suporte: ["suporte-1"] });

    const r = await alertarVencimentoDaMeta(db, push, AGORA);

    expect(r).toMatchObject({ examinadas: 1, alertadas: 1 });
    expect(sino).toHaveLength(1);
    expect(sino[0]).toMatchObject({ organization_id: "org-1", kind: "other" });
    expect(String(sino[0]!.body)).toContain("Ajustes > Meta Ads");
    expect(String(sino[0]!.body)).toContain("para de atualizar");
    expect(push.mock.calls.map((c) => c[1])).toEqual(["admin-1"]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("DEDUP: a segunda rodada do mesmo marco não avisa de novo", async () => {
    const push = vi.fn(async (..._a: unknown[]) => undefined);
    const { db, sino } = banco([con()]);

    await alertarVencimentoDaMeta(db, push, AGORA);
    const r2 = await alertarVencimentoDaMeta(db, push, AGORA);

    expect(r2.alertadas).toBe(0);
    expect(sino).toHaveLength(1);
  });

  it("organização parada, token sem validade e vencimento distante não geram aviso", async () => {
    const push = vi.fn(async (..._a: unknown[]) => undefined);
    const { db, sino } = banco([
      con({ organizations: { status: "suspended" } }),
      con({ organization_id: "org-2", token_expires_at: null }),
      con({ organization_id: "org-3", token_expires_at: em(30) }),
    ]);

    const r = await alertarVencimentoDaMeta(db, push, AGORA);

    expect(r.alertadas).toBe(0);
    expect(sino).toHaveLength(0);
  });

  it("TETO: 201 conexões fora da janela não escondem a que está dentro, mesmo com o maior id", async () => {
    const fora = Array.from({ length: 201 }, (_, i) =>
      con({ organization_id: `org-${String(i).padStart(4, "0")}`, token_expires_at: em(40) }),
    );
    const dentro = con({ organization_id: "org-9999", token_expires_at: em(2) });
    const { db, sino } = banco([...fora, dentro]);

    const r = await alertarVencimentoDaMeta(db, vi.fn(async () => undefined), AGORA);

    expect(r).toMatchObject({ examinadas: 1, alertadas: 1, truncada: false });
    expect(sino).toHaveLength(1);
  });

  it("registra quando a consulta bate o teto", async () => {
    const dentro = Array.from({ length: 200 }, (_, i) =>
      con({ organization_id: `org-${String(i).padStart(4, "0")}`, token_expires_at: em(5) }),
    );
    const { db } = banco(dentro);
    const r = await alertarVencimentoDaMeta(db, vi.fn(async () => undefined), AGORA);
    expect(r.truncada).toBe(true);
  });

  it("leitura dos destinatários com erro: desiste da organização SEM gravar o dedup", async () => {
    const push = vi.fn(async (..._a: unknown[]) => undefined);
    const { db, sino } = banco([con()], { erroVinculos: true });
    const r = await alertarVencimentoDaMeta(db, push, AGORA);
    expect(r.alertadas).toBe(0);
    expect(sino).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("WhatsApp: enviado uma vez por marco; falha dele não impede sino, push e e-mail", async () => {
    const push = vi.fn(async (..._a: unknown[]) => undefined);
    const wpp = vi.fn(async (..._a: unknown[]) => "falhou:destino_invalido" as const);
    const { db, sino } = banco([con()], { suporte: ["suporte-1"] });

    const r = await alertarVencimentoDaMeta(db, push, AGORA, wpp);
    await alertarVencimentoDaMeta(db, push, AGORA, wpp);

    expect(wpp).toHaveBeenCalledTimes(1);
    expect(String(wpp.mock.calls[0]![1])).toContain("vence em 2 dias");
    expect(String(wpp.mock.calls[0]![1])).toContain("Reconecte em Ajustes > Meta Ads.");
    expect(r.whatsapp).toEqual({ enviados: 0, falhas: 1 });
    expect(sino).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("WhatsApp que lança não derruba a rodada; ignorado não conta como falha", async () => {
    const { db, sino } = banco([con(), con({ organization_id: "org-2" })]);
    const wpp = vi
      .fn()
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce("ignorado");
    const r = await alertarVencimentoDaMeta(db, vi.fn(async () => undefined), AGORA, wpp);
    expect(r.alertadas).toBe(2);
    expect(r.whatsapp).toEqual({ enviados: 0, falhas: 1 });
    expect(sino).toHaveLength(2);
  });

  it("ORÇAMENTO: esgotado no meio dos destinatários, para de enviar", async () => {
    const push = vi.fn(async (..._a: unknown[]) => undefined);
    const { db } = banco([con()]);
    const inicio = Date.now();
    let n = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (n++ < 2 ? inicio : inicio + 60_000));
    await alertarVencimentoDaMeta(db, push, AGORA);
    vi.restoreAllMocks();
    expect(push).not.toHaveBeenCalled();
  });

  it("recusa da Meta: título próprio", async () => {
    const { db, sino } = banco([con({ needs_reconnect: true, needs_reconnect_desde: AGORA.toISOString() })]);
    await alertarVencimentoDaMeta(db, vi.fn(async () => undefined), AGORA);
    expect(sino[0]!.title).toBe("A Meta recusou renovar o acesso");
  });
});
