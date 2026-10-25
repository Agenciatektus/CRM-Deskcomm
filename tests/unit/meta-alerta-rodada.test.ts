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

function banco(conexoes: Conexao[], opcoes: { suporte?: string[] } = {}) {
  const claims = new Set<string>();
  const sino: Record<string, unknown>[] = [];
  const db = {
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@x.com` } } }) } },
    from: (tabela: string) => {
      if (tabela === "ad_insights_connections") {
        return encadeado(["select", "eq", "or", "order"], {
          limit: () => Promise.resolve({ data: conexoes, error: null }),
        });
      }
      if (tabela === "user_organizations") {
        return encadeado(["select", "eq"], {
          is: () => Promise.resolve({ data: [{ user_id: "admin-1" }, { user_id: "suporte-1" }], error: null }),
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

  it("recusa da Meta: título próprio", async () => {
    const { db, sino } = banco([con({ needs_reconnect: true, needs_reconnect_desde: AGORA.toISOString() })]);
    await alertarVencimentoDaMeta(db, vi.fn(async () => undefined), AGORA);
    expect(sino[0]!.title).toBe("A Meta recusou renovar o acesso");
  });
});
