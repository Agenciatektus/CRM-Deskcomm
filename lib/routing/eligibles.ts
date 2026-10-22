/**
 * Carregador reutilizável de atendentes elegíveis (G5-02/G5-03 → G6-01/INB-12).
 *
 * A lógica de "quem pode receber uma conversa agora" (disponível ∧ dentro do
 * horário ∧ com folga) vivia inline no worker de roteamento. G6-01 unifica: o
 * mesmo cálculo alimenta o worker (cron), o handoff v2 (crm_request_human_handoff)
 * e o crm_get_queue_status — UM algoritmo, não três divergentes.
 *
 * O client é injetado (worker passa admin; tools MCP passam ctx.supabase admin),
 * mantendo a org-scoping explícita em toda query (service role bypassa RLS).
 */
import type { Json } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isAttendantEligible, OPEN_LOAD_STATUSES } from "./eligibility";
import type { RoutingCandidate } from "./decide";
import { availabilityScheduleSchema } from "@/lib/schemas/routing";

export type RoutingScope =
  | { kind: "conversation_channel"; channelSessionId: string }
  | { kind: "organization_summary" };
export class InvalidRoutingChannel extends Error {
  constructor() { super("routing_channel_invalid"); }
}

/** Elegíveis = disponíveis ∧ dentro do horário ∧ com folga (carga < capacidade). */
export async function loadEligibleAttendants(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date,
  scope: RoutingScope,
): Promise<RoutingCandidate[]> {
  let allowed: Set<string> | null = null;
  if (scope.kind === "conversation_channel") {
    const { data: channel, error: channelError } = await supabase.from("channel_sessions")
      .select("id").eq("organization_id", organizationId).eq("id", scope.channelSessionId).maybeSingle();
    if (channelError) throw new Error(channelError.message);
    if (!channel) throw new InvalidRoutingChannel();
    const { data: policy, error: policyError } = await supabase.from("channel_routing_policies")
      .select("id").eq("organization_id", organizationId).eq("channel_session_id", scope.channelSessionId).maybeSingle();
    if (policyError) throw new Error(policyError.message);
    if (policy) {
      const { data: responsibles, error } = await supabase.from("channel_routing_responsibles")
        .select("user_id").eq("organization_id", organizationId).eq("policy_id", policy.id);
      if (error) throw new Error(error.message);
      allowed = new Set((responsibles ?? []).map((r: { user_id: string }) => r.user_id));
      // Policy existente vazia é restrição explícita, não ausência de configuração.
      if (allowed.size === 0) return [];
    }
  }
  const { data: members, error: memberError } = await supabase.from("user_organizations")
    .select("user_id").eq("organization_id", organizationId).is("revoked_at", null)
    .in("role", ["agent", "manager", "admin"]);
  if (memberError) throw new Error(memberError.message);
  const active = new Set((members ?? []).map((r: { user_id: string }) => r.user_id));
  const { data: avail, error: availabilityError } = await supabase
    .from("attendant_availability").select("user_id, capacity, schedule")
    .eq("organization_id", organizationId).eq("is_available", true);
  if (availabilityError) throw new Error(availabilityError.message);
  const rows = ((avail ?? []) as Array<{ user_id: string; capacity: number; schedule: unknown }>)
    .filter((r) => active.has(r.user_id) && (allowed === null || allowed.has(r.user_id)));
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);

  // Carga atual: CONTAGEM real por dono, no banco. Baixar as linhas e contar
  // aqui (como era) esbarra no `max_rows` do PostgREST (1.000 na instalação):
  // a carga somada de todos nunca passava de 1.000, então um atendente com
  // capacidade acima disso parecia ter folga para sempre — foi o que travou a
  // distribuição da Delicatto com carga "1000" = capacidade 1000. `head: true`
  // não traz linha nenhuma; o número vem no `Content-Range`.
  const loadByUser = new Map<string, number>();
  const cargas = await Promise.all(
    userIds.map(async (userId) => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("assigned_to_user_id", userId)
        .in("status", OPEN_LOAD_STATUSES as unknown as string[]);
      if (error) throw new Error(error.message);
      // Sem contagem não há como provar folga: conta como lotado.
      return [userId, count ?? Number.POSITIVE_INFINITY] as const;
    }),
  );
  for (const [userId, carga] of cargas) loadByUser.set(userId, carga);

  // Última atribuição recebida (rodízio real, sem coluna de estado).
  let history = supabase
    .from("conversation_assignment_events")
    .select("to_user_id, created_at, conversations!inner(organization_id, channel_session_id)")
    .eq("organization_id", organizationId)
    .in("to_user_id", userIds)
    .order("created_at", { ascending: false });
  if (scope.kind === "conversation_channel") {
    history = history.eq("conversations.organization_id", organizationId)
      .eq("conversations.channel_session_id", scope.channelSessionId);
  }
  const { data: assignEvents, error: historyError } = await history;
  if (historyError) throw new Error(historyError.message);
  const lastAssignedByUser = new Map<string, number>();
  for (const e of (assignEvents ?? []) as Array<{ to_user_id: string | null; created_at: string }>) {
    if (e.to_user_id && !lastAssignedByUser.has(e.to_user_id)) {
      lastAssignedByUser.set(e.to_user_id, new Date(e.created_at).getTime());
    }
  }

  const candidates: RoutingCandidate[] = [];
  for (const r of rows) {
    const currentLoad = loadByUser.get(r.user_id) ?? 0;
    const schedule = availabilityScheduleSchema.parse(r.schedule ?? {});
    const eligible = isAttendantEligible(
      { isAvailable: true, capacity: r.capacity, currentLoad, schedule },
      now,
    );
    if (eligible) {
      candidates.push({
        userId: r.user_id,
        currentLoad,
        scheduleSnapshot: r.schedule as Json,
        lastAssignedAt: lastAssignedByUser.get(r.user_id) ?? null,
      });
    }
  }
  return candidates;
}
