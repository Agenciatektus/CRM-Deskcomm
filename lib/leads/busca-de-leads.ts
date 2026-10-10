/**
 * A busca de leads da paleta (Ctrl K): pelo TÍTULO do negócio ou pelo contato
 * dele (nome, nome de exibição, telefone).
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * A paleta achava conversa e contato, e não lead: a rota de leads não aceitava
 * `search`, e listar todos para filtrar no navegador seria o endpoint pesado
 * que a regra proíbe. Aqui a busca roda no banco, com teto e índice trigram
 * (`idx_crm_leads_title_trgm`, `idx_contacts_*_trgm`, migration 9047).
 *
 * ─── Número fixo de consultas, nunca uma por lead ───────────────────────────
 *
 *   1. os contatos que casam (até `TETO_DE_CONTATOS`, só os ids);
 *   2. os leads que casam pelo título OU pertencem a esses contatos;
 *   3. a conversa mais recente de cada contato achado (para abrir o lead na
 *      Inbox, na aba Negócios do painel).
 *
 * Escopo: o cliente é o da SESSÃO, então a RLS de `crm_leads`, `contacts` e
 * `conversations` vale (o `agent` em modo `own` só acha o que já enxerga), e a
 * organização entra à mão em todas, que é a regra do CLAUDE.md.
 *
 * O termo: até 100 caracteres (o teto da busca do produto), `%` e `_` escapados
 * (curingas do `ilike`) e a gramática do `or=` do PostgREST neutralizada pela
 * MESMA função da Inbox (`termoSeguroParaOr`), que já tem a cerca dela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { termoSeguroParaOr } from "@/app/api/v1/conversations/_handler";
import { normalizarTermoDeBusca, PISO_DA_BUSCA, TETO_DO_TERMO_DE_BUSCA } from "@/lib/inbox/termo-de-busca";

/** Quantos contatos a busca considera. Os ids viajam na URL: 40 cabem com folga. */
const TETO_DE_CONTATOS = 40;
export const TETO_DE_LEADS = 10;

export interface LeadAchado {
  id: string;
  title: string;
  status: string;
  pipeline_id: string;
  contact_id: string | null;
  pipeline: { name: string } | null;
  stage: { name: string } | null;
  contato: {
    id: string;
    display_name: string | null;
    name: string | null;
    phone_number: string | null;
    is_anonymized: boolean | null;
  } | null;
  /** A conversa mais recente do contato, quando quem busca a enxerga. */
  conversa: { id: string; status: string } | null;
}

/**
 * O termo pronto para o `or=` e para o `ilike`, ou `null` quando não vale
 * consulta (curto demais depois de normalizado, ou acima do teto).
 */
export function termoDaBuscaDeLeads(bruto: string): string | null {
  const limpo = bruto.trim();
  if (limpo.length > TETO_DO_TERMO_DE_BUSCA) return null;
  const normalizado = normalizarTermoDeBusca(limpo.replace(/[()*]/g, " "));
  if (normalizado.length < PISO_DA_BUSCA) return null;
  return termoSeguroParaOr(normalizado);
}

type LinhaDoLead = Omit<LeadAchado, "conversa">;

export async function buscarLeads(
  supabase: SupabaseClient,
  organizacao: string,
  termo: string,
  limite: number = TETO_DE_LEADS,
): Promise<LeadAchado[]> {
  const digitos = termo.replace(/\D/g, "");
  const camposDoContato = [
    `display_name.ilike.*${termo}*`,
    `name.ilike.*${termo}*`,
    // 4 dígitos é o piso, como na Inbox: "12" casaria metade da base.
    ...(digitos.length >= 4 ? [`phone_number.ilike.*${digitos}*`] : []),
  ].join(",");

  const { data: contatos, error: erroDosContatos } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", organizacao)
    // Anonimizar é direito do titular: o nome antigo não volta a achá-lo.
    .eq("is_anonymized", false)
    .is("is_merged_into", null)
    .or(camposDoContato)
    .limit(TETO_DE_CONTATOS);
  if (erroDosContatos) throw new Error(erroDosContatos.message);
  const idsDosContatos = (contatos ?? []).map((c) => (c as { id: string }).id);

  const filtro =
    idsDosContatos.length > 0
      ? `title.ilike.*${termo}*,contact_id.in.(${idsDosContatos.join(",")})`
      : `title.ilike.*${termo}*`;
  const { data: leads, error: erroDosLeads } = await supabase
    .from("crm_leads")
    .select(
      "id, title, status, pipeline_id, contact_id, pipeline:crm_pipelines!pipeline_id(name), stage:crm_stages!stage_id(name), contato:contacts!contact_id(id, display_name, name, phone_number, is_anonymized)",
    )
    .eq("organization_id", organizacao)
    .or(filtro)
    // O mais mexido primeiro; `id` desempata para a ordem ser estável.
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limite);
  if (erroDosLeads) throw new Error(erroDosLeads.message);
  const linhas = (leads ?? []) as unknown as LinhaDoLead[];

  const contatosDosLeads = [...new Set(linhas.map((l) => l.contact_id).filter((id): id is string => !!id))];
  const conversaPorContato = new Map<string, { id: string; status: string }>();
  if (contatosDosLeads.length > 0) {
    const { data: conversas } = await supabase
      .from("conversations")
      .select("id, status, contact_id")
      .eq("organization_id", organizacao)
      .in("contact_id", contatosDosLeads)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      // Teto folgado: no máximo 10 contatos, e quase todos têm uma conversa só.
      .limit(50);
    for (const c of (conversas ?? []) as Array<{ id: string; status: string; contact_id: string }>) {
      // A primeira de cada contato é a mais recente (a ordem acima).
      if (!conversaPorContato.has(c.contact_id)) conversaPorContato.set(c.contact_id, { id: c.id, status: c.status });
    }
  }

  return linhas.map((l) => ({ ...l, conversa: l.contact_id ? (conversaPorContato.get(l.contact_id) ?? null) : null }));
}
