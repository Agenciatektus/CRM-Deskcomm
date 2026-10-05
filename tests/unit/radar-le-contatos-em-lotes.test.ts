// O radar lê follow-ups, conversas e nomes POR CONTATO. A lista de contatos vai
// na querystring do PostgREST e o gateway do CRM recusa URL acima de ~24 KB
// (medição em lib/supabase/lotes.ts). Antes, as três leituras iam numa consulta
// só e o erro era ignorado: numa base grande o radar respondia "sem retorno em
// voo, sem conversa, sem nome" com cara de completo.
//
// Mutante conferido à mão: voltar as três leituras para `.in(..., contactIds)`
// numa consulta só, ignorando o `error`, faz o primeiro teste falhar (nenhum
// lead "em voo", nenhum nome) e o segundo deixar de lançar.
import { describe, expect, it, vi } from "vitest";
import { carregaRadarDeRisco } from "@/lib/leads/radar-de-risco";
import { logger } from "@/lib/logger";

const ORG = "22222222-2222-4222-8222-222222222222";
const TETO_DA_URL = 24 * 1024;
const BASE_DA_URL = 300; // host, path, select e filtros de organização

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

interface Opcoes {
  contatos: number;
  falharTabela?: string;
}

/** Banco falso que se comporta como o gateway: URL grande demais vira 400. */
function bancoFalso({ contatos, falharTabela }: Opcoes) {
  const contactIds = Array.from({ length: contatos }, (_, i) => uuid(i + 1));
  const leads = contactIds.map((c, i) => ({
    id: uuid(100_000 + i),
    title: `Lead ${i}`,
    contact_id: c,
    owner_user_id: null,
    owner_kind: null,
    owner_agent_id: null,
    stage_id: null,
    last_activity_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    pipeline_id: "p1",
  }));
  const maiorUrl: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = {
    from: vi.fn((tabela: string) => {
      const listas: Record<string, string[]> = {};
      let single = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        not: () => q,
        order: () => q,
        limit: () => q,
        gt: () => q,
        in: (campo: string, v: string[]) => {
          listas[campo] = v;
          return q;
        },
        single: () => {
          single = true;
          return q;
        },
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          const url = BASE_DA_URL + Object.values(listas).reduce((s, l) => s + l.length * 37, 0);
          maiorUrl[tabela] = Math.max(maiorUrl[tabela] ?? 0, url);
          const pedido = listas.contact_id ?? listas.id ?? [];
          let r: { data: unknown; error: { message: string } | null };
          if (url > TETO_DA_URL) r = { data: null, error: { message: "Bad Request" } };
          else if (tabela === falharTabela) r = { data: null, error: { message: "boom" } };
          else if (single) r = { data: { settings: {} }, error: null };
          else if (tabela === "crm_leads") r = { data: leads, error: null };
          else if (tabela === "cron_jobs")
            r = { data: pedido.map((c) => ({ contact_id: c, next_run_at: "2099-01-01T00:00:00Z" })), error: null };
          else if (tabela === "conversations")
            r = { data: pedido.map((c) => ({ id: `conv-${c}`, contact_id: c, assignee_kind: "ai" })), error: null };
          else if (tabela === "contacts")
            r = { data: pedido.map((c) => ({ id: c, name: `Nome ${c.slice(-4)}`, display_name: null })), error: null };
          else r = { data: [], error: null };
          return Promise.resolve(r).then(ok, ko);
        },
      };
      return q;
    }),
  };
  return { admin, maiorUrl, contactIds };
}

describe("radar — leituras por contato em lotes", () => {
  it("com 1.097 contatos, nenhuma URL passa do teto e todo lead sai com nome, conversa e retorno em voo", async () => {
    const { admin, maiorUrl, contactIds } = bancoFalso({ contatos: 1097 });
    const radar = await carregaRadarDeRisco(admin, {
      organizationId: ORG,
      limit: 5000,
      now: new Date("2026-10-05T00:00:00Z"),
    });
    for (const t of ["cron_jobs", "conversations", "contacts"]) {
      expect(maiorUrl[t]).toBeLessThanOrEqual(TETO_DA_URL);
    }
    expect(radar.total).toBe(contactIds.length);
    expect(radar.items.every((l) => l.in_flight)).toBe(true);
    expect(radar.items.every((l) => l.contact_name !== null)).toBe(true);
    expect(radar.items.every((l) => l.conversation_id !== null)).toBe(true);
  });

  it.each(["cron_jobs", "conversations", "contacts"])(
    "erro em %s derruba o radar com UM log contendo a contagem, nunca 'sem risco'",
    async (tabela) => {
      const log = vi.spyOn(logger, "error").mockImplementation(() => {});
      const { admin } = bancoFalso({ contatos: 300, falharTabela: tabela });
      await expect(
        carregaRadarDeRisco(admin, { organizationId: ORG, now: new Date("2026-10-05T00:00:00Z") }),
      ).rejects.toThrow(/radar_contatos_failed/);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]![1]).toMatchObject({ contatos: 300 });
      log.mockRestore();
    },
  );
});
