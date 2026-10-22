import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEligibleAttendants } from "./eligibles";

const MAX_ROWS = 1000;
function fixture(over: Record<string, unknown> = {}) {
  const filters: Array<[string, string, unknown]> = [];
  const rows: Record<string, unknown> = {
    channel_sessions: { id: "channel" }, channel_routing_policies: null,
    channel_routing_responsibles: [], user_organizations: [{ user_id: "ana" }],
    attendant_availability: [{ user_id: "ana", capacity: 2, schedule: {} }],
    conversations: [], conversation_assignment_events: [], ...over,
  };
  const db = { from(table: string) {
    let contar = false;
    const iguais: Record<string, unknown> = {};
    const q = {
      // `head: true` = contagem (`count`); sem ele, linhas com o teto de
      // `max_rows` do PostgREST (1.000) — o corte que escondia a carga real.
      select(_c?: string, o?: { head?: boolean }) { contar = Boolean(o?.head); return q; }, order() { return q; },
      eq(key: string, value: unknown) { filters.push([table, key, value]); iguais[key] = value; return q; },
      is(key: string, value: unknown) { filters.push([table, key, value]); return q; },
      in(key: string, value: unknown) { filters.push([table, key, value]); return q; },
      maybeSingle() { return Promise.resolve({ data: rows[table], error: null }); },
      then(resolve: (x: unknown) => unknown) {
        if (table === "conversations" && Array.isArray(rows[table])) {
          const todas = (rows[table] as Array<{ assigned_to_user_id: string }>).filter(
            (c) => !("assigned_to_user_id" in iguais) || c.assigned_to_user_id === iguais.assigned_to_user_id,
          );
          return Promise.resolve(
            contar ? { data: null, count: todas.length, error: null } : { data: todas.slice(0, MAX_ROWS), error: null },
          ).then(resolve);
        }
        return Promise.resolve(rows[table] instanceof Error
          ? { data: null, error: rows[table] }
          : { data: rows[table], error: null }).then(resolve);
      },
    }; return q;
  } } as unknown as SupabaseClient;
  return { db, filters };
}
const scope = { kind: "conversation_channel", channelSessionId: "channel" } as const;
const now = new Date("2026-09-06T15:00:00Z");
describe("elegibilidade com origem explícita", () => {
  it("política vazia não cai no conjunto legado", async () => {
    const { db } = fixture({ channel_routing_policies: { id: "policy" } });
    expect(await loadEligibleAttendants(db, "org", now, scope)).toEqual([]);
  });
  it("membro revogado não recebe mesmo com disponibilidade legada", async () => {
    const { db } = fixture({ user_organizations: [] });
    expect(await loadEligibleAttendants(db, "org", now, scope)).toEqual([]);
  });
  it("capacidade é global e histórico é apenas do canal, com org nas duas tabelas", async () => {
    const { db, filters } = fixture();
    expect(await loadEligibleAttendants(db, "org", now, scope)).toMatchObject([{ userId: "ana" }]);
    expect(filters).toContainEqual(["conversation_assignment_events", "conversations.channel_session_id", "channel"]);
    expect(filters).toContainEqual(["conversation_assignment_events", "conversations.organization_id", "org"]);
    expect(filters).not.toContainEqual(["conversations", "channel_session_id", "channel"]);
  });
  it("resumo global não consulta política", async () => {
    const { db, filters } = fixture();
    await loadEligibleAttendants(db, "org", now, { kind: "organization_summary" });
    expect(filters.some(([table]) => table === "channel_routing_policies")).toBe(false);
  });
  it("canal inexistente não autoriza fallback", async () => {
    const { db } = fixture({ channel_sessions: null });
    await expect(loadEligibleAttendants(db, "org", now, scope)).rejects.toThrow("routing_channel_invalid");
  });
  it("⭐ carga acima do max_rows (1.500 abertas, capacidade 1.200): NÃO é elegível", async () => {
    const abertas = Array.from({ length: 1500 }, () => ({ assigned_to_user_id: "ana" }));
    const { db, filters } = fixture({
      attendant_availability: [{ user_id: "ana", capacity: 1200, schedule: {} }],
      conversations: abertas,
    });
    expect(await loadEligibleAttendants(db, "org", now, scope)).toEqual([]);
    // A contagem leva a organização e o dono.
    expect(filters).toContainEqual(["conversations", "organization_id", "org"]);
    expect(filters).toContainEqual(["conversations", "assigned_to_user_id", "ana"]);
  });
  it("controle: 1.100 abertas com capacidade 1.200 tem folga, com a carga certa", async () => {
    const abertas = Array.from({ length: 1100 }, () => ({ assigned_to_user_id: "ana" }));
    const { db } = fixture({
      attendant_availability: [{ user_id: "ana", capacity: 1200, schedule: {} }],
      conversations: abertas,
    });
    expect(await loadEligibleAttendants(db, "org", now, scope)).toMatchObject([{ userId: "ana", currentLoad: 1100 }]);
  });
  it("erro de banco não vira sem elegível", async () => {
    const { db } = fixture({ attendant_availability: new Error("offline") });
    await expect(loadEligibleAttendants(db, "org", now, scope)).rejects.toThrow("offline");
  });
});
