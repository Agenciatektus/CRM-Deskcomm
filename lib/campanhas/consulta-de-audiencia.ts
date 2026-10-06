/**
 * O recorte virando linhas — a única peça do módulo de audiência que fala com o
 * banco.
 *
 * Fica separada de `audiencia.ts` (que é o filtro, puro) porque a prévia e o
 * snapshot chamam AS DUAS, e é o par que garante que os dois caminhos vejam o
 * mesmo recorte. Se um dia a prévia e o envio divergirem, a divergência estará
 * aqui, num arquivo só.
 *
 * `organization_id` entra em TODA consulta, explicitamente: o client admin
 * ignora RLS, e é ele que este módulo recebe (a prévia roda numa rota com papel
 * conferido; o snapshot roda no worker, que não tem usuário).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DIAS_SEM_REPETIR_A_CADENCIA } from "@/lib/cadencia/inscrever";

import { limiteDeSilencio, usaNegocio, type FiltroDeAudiencia } from "./audiencia";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { recusouMarketing, type CandidatoDaAudiencia } from "./elegibilidade";

/** Teto de ids que um filtro de negócio devolve antes de virar `in (...)`. */
const TETO_DE_IDS_DE_NEGOCIO = 20_000;

interface LinhaDeContato {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  is_blocked: boolean;
  is_anonymized: boolean;
  consent: unknown;
}

export async function buscarCandidatos(
  admin: SupabaseClient,
  entrada: { organizationId: string; filtro: FiltroDeAudiencia; agora: Date },
): Promise<CandidatoDaAudiencia[]> {
  const { organizationId, filtro, agora } = entrada;

  // ─── Os contatos que têm negócio no recorte ───
  // Consulta separada, e não `join` embutido do PostgREST: o mesmo contato tem N
  // negócios, e o embed devolveria o contato N vezes — contagem de prévia
  // inflada, que é exatamente o número que o operador confere antes de apertar.
  let idsPorNegocio: string[] | null = null;
  if (usaNegocio(filtro)) {
    let negocios = admin
      .from("crm_leads")
      .select("contact_id")
      .eq("organization_id", organizationId)
      .not("contact_id", "is", null)
      .limit(TETO_DE_IDS_DE_NEGOCIO);
    if (filtro.funis.length > 0) negocios = negocios.in("pipeline_id", filtro.funis);
    if (filtro.etapas.length > 0) negocios = negocios.in("stage_id", filtro.etapas);
    if (filtro.responsaveis.length > 0) negocios = negocios.in("owner_user_id", filtro.responsaveis);
    if (filtro.situacoes_do_negocio.length > 0) {
      negocios = negocios.in("status", filtro.situacoes_do_negocio);
    }
    const { data, error } = await negocios;
    if (error) throw new Error(`audiência: negócios — ${error.message}`);
    idsPorNegocio = [...new Set((data ?? []).map((l) => (l as { contact_id: string }).contact_id))];
    // Recorte de negócio que não achou ninguém é recorte vazio, não recorte
    // ausente: seguir sem o `in` devolveria a organização inteira.
    if (idsPorNegocio.length === 0) return [];
  }

  let consulta = admin
    .from("contacts")
    .select("id, name, display_name, phone_number, is_blocked, is_anonymized, consent")
    .eq("organization_id", organizationId)
    // Placeholder de GRUPO não recebe campanha: campanha é 1:1 por doutrina, e
    // o grupo não tem opt-in individual nenhum por trás desse registro técnico.
    .eq("kind", "person")
    // Cadastro mesclado é fantasma: quem responde é o sobrevivente.
    .is("is_merged_into", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(filtro.limite);

  if (idsPorNegocio) consulta = consulta.in("id", idsPorNegocio);
  if (filtro.com_todas_tags.length > 0) consulta = consulta.contains("tags", filtro.com_todas_tags);
  if (filtro.com_alguma_tag.length > 0) consulta = consulta.overlaps("tags", filtro.com_alguma_tag);
  if (filtro.sem_tags.length > 0) {
    consulta = consulta.not("tags", "ov", `{${filtro.sem_tags.map(citar).join(",")}}`);
  }
  if (filtro.origens.length > 0) consulta = consulta.in("source", filtro.origens);
  if (filtro.sem_interacao_ha_dias !== null) {
    const limite = limiteDeSilencio(filtro.sem_interacao_ha_dias, agora).toISOString();
    // Quem nunca interagiu ENTRA no recorte de silêncio: `last_activity_at` nulo
    // é o silêncio mais longo que existe, e deixá-lo de fora tiraria justamente
    // a lista fria — que é o caso de uso principal da campanha.
    consulta = consulta.or(`last_activity_at.is.null,last_activity_at.lt.${limite}`);
  }
  if (filtro.com_interacao_ha_dias !== null) {
    consulta = consulta.gte(
      "last_activity_at",
      limiteDeSilencio(filtro.com_interacao_ha_dias, agora).toISOString(),
    );
  }
  if (filtro.cadastrado_de) consulta = consulta.gte("created_at", filtro.cadastrado_de);
  if (filtro.cadastrado_ate) consulta = consulta.lte("created_at", filtro.cadastrado_ate);
  if (filtro.excluir_contatos.length > 0) {
    consulta = consulta.not("id", "in", `(${filtro.excluir_contatos.join(",")})`);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(`audiência: contatos — ${error.message}`);
  const linhas = (data ?? []) as LinhaDeContato[];

  // ─── Os incluídos à mão ───
  // Entram mesmo fora do recorte, e por isso vêm em consulta própria; os vetos
  // por pessoa continuam valendo para eles (incluir à mão não fura opt-out).
  const jaTem = new Set(linhas.map((l) => l.id));
  const faltam = filtro.incluir_contatos.filter((id) => !jaTem.has(id));
  if (faltam.length > 0) {
    const { data: extras, error: erroExtras } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number, is_blocked, is_anonymized, consent")
      .eq("organization_id", organizationId)
      .eq("kind", "person")
      .in("id", faltam);
    if (erroExtras) throw new Error(`audiência: incluídos — ${erroExtras.message}`);
    linhas.push(...((extras ?? []) as LinhaDeContato[]));
  }

  return linhas.map((l) => ({
    contactId: l.id,
    nome: nomeDoContato(l),
    telefone: l.phone_number,
    bloqueado: l.is_blocked,
    anonimizado: l.is_anonymized,
    recusouMarketing: recusouMarketing(l.consent),
  }));
}


/**
 * Quem JÁ FOI ABORDADO por outra campanha nos últimos
 * `DIAS_SEM_REPETIR_A_CADENCIA` dias.
 *
 * Opcionalmente ignora uma campanha (a que está sendo preparada): sem isso, uma
 * preparação repetida excluiria como "já em campanha" os destinatários que ela
 * mesma gravou na tentativa anterior.
 *
 * ═══ A RÉGUA MUDOU: a DATA DA LINHA, não o estado da campanha ═══
 *
 * Decisão do dono (06/10/2026), junto com a entrada contínua (9038). Antes, o
 * veto era "tem linha em campanha de status VIVO", e o comentário de
 * `classificarAudiencia` explicava por quê: bloquear por campanha CONCLUÍDA
 * impediria para sempre falar de novo com quem já se falou.
 *
 * A campanha contínua quebra essa lógica, porque ela nunca conclui. Pelo critério
 * antigo, todo contato que uma contínua tocasse ficaria excluído de qualquer
 * campanha futura enquanto ela estivesse de pé — isto é, para sempre. A régua
 * passa a ser o TEMPO, e é a mesma do anti-laço da régua de prospecção
 * (`jaPassouPelaRegua`, em `lib/cadencia/inscrever.ts`), para o produto ter uma
 * resposta só para "faz quanto tempo que falei com essa pessoa?".
 *
 * ═══ E só conta quem é ELEGÍVEL (P2-1 do @Cassio_SecRev) ═══
 *
 * A preparação grava linha também para o EXCLUÍDO (é o que responde "por que
 * essa pessoa não recebeu?"), e a entrada contínua grava uma por contato que
 * cruza a etapa e é vetado. Contar essas linhas fazia o veto alcançar quem foi
 * apenas VETADO — bloqueado, sem telefone, que recusou marketing —, e numa etapa
 * de entrada de funil isso é a base quase inteira. O veto existe para não queimar
 * quem RECEBEU; excluído não recebeu nada. `cancelled` sai pelo mesmo motivo: a
 * campanha foi cancelada antes de falar com essa pessoa.
 *
 * Sem o `.in("campaign_id", ids)` de antes: a lista de campanhas vivas cresce sem
 * teto (a contínua nunca conclui) e a URL do PostgREST estoura em algumas
 * centenas. Todo o predicado é do lado do servidor agora.
 */
export async function contatosJaEmCampanha(
  admin: SupabaseClient,
  organizationId: string,
  exceto?: string,
): Promise<Set<string>> {
  const desde = new Date(Date.now() - DIAS_SEM_REPETIR_A_CADENCIA * 86_400_000);
  let consulta = admin
    .from("campaign_recipients")
    .select("contact_id")
    .eq("organization_id", organizationId)
    .eq("eligibility_status", "eligible")
    .neq("status", "cancelled")
    .gte("created_at", desde.toISOString());
  if (exceto) consulta = consulta.neq("campaign_id", exceto);
  const { data, error } = await consulta;
  if (error) throw new Error(`audiência: comprometidos — ${error.message}`);
  return new Set((data ?? []).map((r) => (r as { contact_id: string }).contact_id));
}

/** Aspas para o literal de array do Postgres — etiqueta com vírgula quebraria o `{a,b}`. */
function citar(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
