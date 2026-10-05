/**
 * A ORDEM da inscrição na régua da campanha (migration 9037).
 *
 * O que estes testes protegem: o card do funil nasce DEPOIS de todos os freios.
 * Criar antes seria abrir card no CRM do cliente para quem a inscrição recusa no
 * passo seguinte — inclusive para quem está bloqueado, anonimizado ou pediu para
 * não receber. Lixo no funil é ruim; lixo com o nome de quem pediu para sair é
 * um problema de LGPD com cara de bug de UI.
 *
 * O último freio é o teto do dia, e é por isso que ele é testado: se o card
 * nascesse entre a avaliação e a reserva, só este caso o pegaria.
 */
import { describe, expect, it, vi } from "vitest";

import { CADENCE_SETTINGS_PADRAO } from "./settings";
import { inscreverContatoNaRegua } from "./inscrever";

const POLITICA = { ...CADENCE_SETTINGS_PADRAO, legal_basis_ref: "LIA da campanha" };

const GRAFO = {
  nodes: [
    { id: "inicio", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    { id: "fim", type: "end", label: "Fim", position: { x: 0, y: 140 }, config: { outcome: "exhausted" } },
  ],
  edges: [
    { id: "inicio->fim", source: "inicio", target: "fim", priority: 0, condition: { type: "always" } },
  ],
};

const REGUA_NO_AR = {
  id: "pointer-1",
  status: "active",
  surface: "campaign",
  active_version_id: "versao-1",
  channel_session_id: "canal-1",
  pipeline_id: "funil-1",
  cadence_settings: POLITICA,
};

type Resultado = { data?: unknown; error?: { message: string }; count?: number };

/**
 * Cliente mínimo: um resultado canned por TABELA — ou uma FILA deles, quando a
 * mesma tabela é consultada mais de uma vez com expectativas diferentes (é o
 * caso de `contacts`: primeiro a linha do contato, depois os gêmeos do mesmo
 * telefone, que vêm como lista). Esgotada a fila, repete o último.
 */
function supabaseFake(opts: {
  tabelas: Record<string, Resultado | Resultado[]>;
  rpc?: Record<string, unknown>;
}) {
  const consumidos: Record<string, number> = {};
  const client = {
    from: (tabela: string) => {
      const canned = opts.tabelas[tabela] ?? { data: null, count: 0 };
      let resultado: Resultado;
      if (Array.isArray(canned)) {
        const i = consumidos[tabela] ?? 0;
        consumidos[tabela] = i + 1;
        resultado = canned[Math.min(i, canned.length - 1)] ?? { data: null };
      } else {
        resultado = canned;
      }
      const enc: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in", "neq", "not", "gte", "is"]) {
        enc[m] = () => enc;
      }
      enc.maybeSingle = () => Promise.resolve(resultado);
      enc.single = () => Promise.resolve(resultado);
      enc.then = (fn: (r: unknown) => unknown) => Promise.resolve(resultado).then(fn);
      return enc;
    },
    rpc: (nome: string) => Promise.resolve({ data: opts.rpc?.[nome] ?? null, error: null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

const BASE = {
  organizationId: "org-1",
  pointerId: "pointer-1",
  contactId: "c-1",
  fronteira: { conversation_id: "conv-1" } as never,
  origem: { tipo: "campanha" as const, campanhaId: "camp-1", destinatarioId: "dest-1" },
};

describe("inscreverContatoNaRegua — o card nasce depois dos freios", () => {
  it("régua indisponível: não abre card", async () => {
    const abrirNegocio = vi.fn(async () => "lead-1");
    const r = await inscreverContatoNaRegua(supabaseFake({ tabelas: {} }), { ...BASE, abrirNegocio });
    expect(r).toEqual({ ok: false, motivo: "cadencia_indisponivel" });
    expect(abrirNegocio).not.toHaveBeenCalled();
  });

  it("contato bloqueado: não abre card", async () => {
    const abrirNegocio = vi.fn(async () => "lead-1");
    const r = await inscreverContatoNaRegua(
      supabaseFake({
        tabelas: {
          followup_flow_pointers: { data: REGUA_NO_AR },
          channel_sessions: { data: { id: "canal-1", status: "WORKING", archived_at: null } },
          followup_flow_versions: { data: { graph: GRAFO, created_at: "2026-10-01T00:00:00Z" } },
          organizations: { data: { timezone: "America/Sao_Paulo" } },
          followup_enrollments: { count: 0, data: [] },
          contacts: { data: { id: "c-1", phone_number: "+5548999990000", is_blocked: true } },
        },
      }),
      { ...BASE, abrirNegocio },
    );
    expect(r).toEqual({ ok: false, motivo: "contato_bloqueado_ou_optout" });
    expect(abrirNegocio).not.toHaveBeenCalled();
  });

  it("TETO DO DIA estourado: não abre card — este é o último freio", async () => {
    const abrirNegocio = vi.fn(async () => "lead-1");
    const r = await inscreverContatoNaRegua(
      supabaseFake({
        tabelas: {
          followup_flow_pointers: { data: REGUA_NO_AR },
          channel_sessions: { data: { id: "canal-1", status: "WORKING", archived_at: null } },
          followup_flow_versions: { data: { graph: GRAFO, created_at: "2026-10-01T00:00:00Z" } },
          organizations: { data: { timezone: "America/Sao_Paulo" } },
          followup_enrollments: { count: 0, data: [] },
          contacts: [
            {
              data: {
                id: "c-1",
                phone_number: "+5548999990000",
                is_blocked: false,
                force_human: false,
                is_anonymized: false,
                is_merged_into: null,
                consent: {},
              },
            },
            // Os gêmeos do mesmo telefone: nenhum.
            { data: [] },
          ],
        },
        // A reserva concede ZERO vagas.
        rpc: { fn_cadencia_reservar_inscricoes: 0 },
      }),
      { ...BASE, abrirNegocio },
    );
    expect(r).toEqual({ ok: false, motivo: "teto_do_dia" });
    expect(abrirNegocio).not.toHaveBeenCalled();
  });
});
