/**
 * O OBJETIVO DA CONDUÇÃO FOI ATINGIDO? — regra pura.
 *
 * A IA da cadência conduz até a etapa-alvo; quando o negócio chega lá (ou é
 * ganho), a condução acaba e uma pessoa assume. O alvo vem do PREFIXO do
 * evento (`lead.*`): `lead.won` nasce em `fn_log_event` com `entity_kind='lead'`
 * e as rotas gravam `crm_lead` — filtrar pelo kind perderia metade.
 *
 * O payload NUNCA decide: `lead.stage_changed` pode ser forjado por quem tem
 * `emit_event`, mas o lead só está na etapa se `crm_leads` diz que está. Por
 * isso a regra relê o negócio e a condução do banco e compara lá.
 */

export const EVENTOS_DO_OBJETIVO = ["lead.stage_changed", "lead.won"] as const;

export interface ConducaoDoObjetivo {
  id: string;
  conversation_id: string;
  contact_id: string;
  lead_id: string;
  etapa_alvo_id: string;
  pointer_id: string;
}

export interface ObjetivoDb {
  conducaoVivaDoLead(orgId: string, leadId: string): Promise<ConducaoDoObjetivo | null>;
  lead(orgId: string, leadId: string): Promise<{ stage_id: string | null; status: string | null } | null>;
  /** CAS: `true` só para quem encerrou agora. */
  encerrar(orgId: string, conducaoId: string): Promise<boolean>;
  passarParaHumano(orgId: string, conducao: ConducaoDoObjetivo): Promise<void>;
}

export type DesfechoDoObjetivo =
  | "sem_lead"
  | "sem_conducao"
  | "lead_nao_encontrado"
  | "objetivo_nao_atingido"
  | "ja_encerrada"
  | "objetivo_atingido";

/** O lead está onde a condução mandou chegar? (etapa-alvo ou negócio ganho) */
export function objetivoAtingido(
  lead: { stage_id: string | null; status: string | null },
  etapaAlvoId: string,
): boolean {
  return lead.stage_id === etapaAlvoId || lead.status === "won";
}

export async function aplicarObjetivo(
  db: ObjetivoDb,
  row: { organization_id: string; event_type: string; entity_id: string | null },
): Promise<DesfechoDoObjetivo> {
  if (!row.event_type.startsWith("lead.") || !row.entity_id) return "sem_lead";
  const conducao = await db.conducaoVivaDoLead(row.organization_id, row.entity_id);
  if (conducao === null) return "sem_conducao";
  const lead = await db.lead(row.organization_id, conducao.lead_id);
  if (lead === null) return "lead_nao_encontrado";
  if (!objetivoAtingido(lead, conducao.etapa_alvo_id)) return "objetivo_nao_atingido";
  if (!(await db.encerrar(row.organization_id, conducao.id))) return "ja_encerrada";
  await db.passarParaHumano(row.organization_id, conducao);
  return "objetivo_atingido";
}
