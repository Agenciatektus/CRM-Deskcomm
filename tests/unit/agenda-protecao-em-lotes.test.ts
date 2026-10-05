import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { protecaoAgendaSupabase } from "@/lib/agenda/protecao-followup";
import { logger } from "@/lib/logger";

/**
 * "[agenda] proteção indisponível" EM LAÇO (item 15 da auditoria).
 *
 * 11,5 mil linhas em 2 h. A causa não era a agenda estar fora do ar: o
 * observador de risco (`/api/v1/cron/risk-watcher`, a cada 15 min, via
 * `calculaBucketsAtuais`) e o radar pedem a proteção de TODOS os contatos com
 * negócio aberto de uma vez. Na Lior são 1.097, e `.in("contact_id", …)` com
 * isso monta uma URL de ~40 KB que o gateway recusa com 400 (medição em
 * `lib/supabase/lotes.ts`). A função engolia o erro e devolvia "indisponível"
 * para cada contato — com UM log por contato: 1.097 linhas por rodada, e o
 * radar inteiro abortado (`risk_agenda_indisponivel`). A rodada seguinte
 * repetia tudo.
 *
 * O banco aqui é um dublê que recusa a URL acima de 24 KB, como o gateway.
 */

const BYTES_POR_ID = 37;
const LIMITE_DA_URL = 24_000;

type Chamada = { tabela: string; ids: number };

function bancoFalso(compromissos: Array<{ id: string; contact_id: string }>, falhar = false) {
  const chamadas: Chamada[] = [];
  const executar = (tabela: string, f: Record<string, unknown>) => {
    const ids = (f.in as string[] | undefined) ?? [];
    chamadas.push({ tabela, ids: ids.length });
    if (tabela === "organizations") return { data: { settings: {} }, error: null };
    if (falhar) return { data: null, error: { message: "connection refused" } };
    if (ids.length * BYTES_POR_ID > LIMITE_DA_URL) return { data: null, error: { message: "Bad Request" } };
    const linhas = compromissos
      .filter((c) => ids.includes(c.contact_id))
      .filter((c) => !f.gt || c.id > (f.gt as string))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, (f.limit as number) ?? 1000)
      .map((c) => ({
        ...c,
        revision: 1,
        status: "confirmed",
        starts_at: "2026-10-10T12:00:00Z",
        ends_at: "2026-10-10T13:00:00Z",
      }));
    return { data: linhas, error: null };
  };
  const db = {
    from(tabela: string) {
      const f: Record<string, unknown> = {};
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        single: () => b,
        in: (coluna: string, v: string[]) => {
          if (coluna === "contact_id") f.in = v;
          return b;
        },
        limit: (n: number) => ((f.limit = n), b),
        gt: (_c: string, v: string) => ((f.gt = v), b),
        then: (ok: (r: unknown) => unknown, erro: (e: unknown) => unknown) =>
          Promise.resolve(executar(tabela, f)).then(ok, erro),
      };
      return b;
    },
  };
  return { db: db as unknown as SupabaseClient, chamadas };
}

const contatos = (n: number) => Array.from({ length: n }, (_, i) => `c-${String(i).padStart(5, "0")}`);
const AGORA = new Date("2026-10-05T12:00:00Z");

describe("proteção da agenda em lote", () => {
  let avisos: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    avisos = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);
  });
  afterEach(() => avisos.mockRestore());

  it("1.097 contatos (a Lior): lê tudo, sem 400, sem log, e acha o compromisso", async () => {
    const ids = contatos(1097);
    const { db, chamadas } = bancoFalso([
      { id: "a-1", contact_id: ids[3]! },
      { id: "a-2", contact_id: ids[1096]! },
    ]);

    const r = await protecaoAgendaSupabase(db, "org", ids, AGORA);

    const agenda = chamadas.filter((c) => c.tabela === "calendar_appointments");
    console.info(
      `[agenda] 1.097 contatos → ${agenda.length} consultas (maior lote ${Math.max(...agenda.map((c) => c.ids))} ids), ${avisos.mock.calls.length} logs`,
    );
    expect(avisos).not.toHaveBeenCalled();
    expect(Math.max(...agenda.map((c) => c.ids)) * BYTES_POR_ID).toBeLessThan(LIMITE_DA_URL);
    expect([...r.values()].some((p) => p.motivo === "leitura_indisponivel")).toBe(false);
    expect(r.get(ids[3]!)?.motivo).toBe("agendado");
    expect(r.get(ids[1096]!)?.motivo).toBe("agendado");
    expect(r.get(ids[0]!)?.motivo).toBe("sem_compromisso");
  });

  it("falha de verdade: todos ficam indisponíveis, com UM log por chamada (não um por contato)", async () => {
    const ids = contatos(300);
    const { db } = bancoFalso([], true);

    const r = await protecaoAgendaSupabase(db, "org", ids, AGORA);

    expect([...r.values()].every((p) => p.motivo === "leitura_indisponivel")).toBe(true);
    expect(avisos).toHaveBeenCalledTimes(1);
    // O log diz o que falhou e quantos contatos foram adiados.
    expect(JSON.stringify(avisos.mock.calls[0])).toContain("connection refused");
    expect(JSON.stringify(avisos.mock.calls[0])).toContain("300");
  });
});
