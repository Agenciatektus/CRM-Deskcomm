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
import { STATUS_TERMINAIS } from "./maquina-de-estados";
import { NA_FILA_DE_DESPACHO } from "./tipos";
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
 * Quem o veto "já em campanha" tira do recorte — por DOIS critérios, que medem
 * coisas diferentes.
 *
 * Opcionalmente ignora uma campanha (a que está sendo preparada): sem isso, uma
 * preparação repetida excluiria como "já em campanha" os destinatários que ela
 * mesma gravou na tentativa anterior.
 *
 *   (1) PASSADO — RECEBEU nos últimos `DIAS_SEM_REPETIR_A_CADENCIA` dias. O fato
 *       medido é a mensagem ter SAÍDO (`sent_at`), e ele independe do estado da
 *       campanha: cancelar a campanha não desfaz a mensagem que a pessoa leu, e
 *       por isso campanha cancelada que já falou CONTINUA contando.
 *
 *   (2) PRESENTE — está na FILA ATIVA (`NA_FILA_DE_DESPACHO`) de uma campanha NÃO
 *       TERMINAL. Não é sobre o passado: é para duas campanhas não mandarem o
 *       primeiro contato para a mesma pessoa na mesma semana, de números
 *       possivelmente diferentes. Só aqui o estado da campanha importa, e quem
 *       responde "ainda vai falar?" é `STATUS_TERMINAIS`, derivado da máquina de
 *       estados.
 *
 * ═══ As duas voltas erradas, registradas para quem for mexer ═══
 *
 * • "linha em campanha VIVA" media (2) e era usado como se medisse (1). Caiu com
 *   a 9038: a campanha de entrada contínua nunca conclui, então por aquele
 *   critério todo contato que ela tocasse ficaria vetado de qualquer campanha
 *   futura, para sempre — ela esterilizaria o modo lista do tenant.
 * • "elegível nos últimos 30 dias, menos `cancelled`" tentou medir (1) com o
 *   dado de (2). Erra nas DUAS direções: veta quem está `pending` e nunca recebeu
 *   nada, e LIBERA quem recebeu e depois teve a campanha cancelada — justamente
 *   o caso que a janela de 30 dias existe para impedir.
 *
 * Com os dois separados, "cancelada antes de falar" sai do veto por si: não tem
 * `sent_at` e não tem linha viva. Nenhum predicado olha `cancelled`.
 *
 * ⚠️ `eligibility_status = 'eligible'` fica nos dois ramos e nos dois é redundante
 * hoje (`sent_at` só é escrito depois de um envio; linha excluída nasce `skipped`,
 * fora da fila ativa). Fica porque custa zero e a alternativa seria apoiar um
 * predicado de SEGURANÇA num invariante que mora em outro arquivo.
 *
 * ⚠️ LIMITE CONHECIDO, anterior a esta mudança: o PostgREST trunca a resposta no
 * `max_rows` da instalação, e um conjunto truncado veta MENOS gente do que devia —
 * em silêncio. A janela de 30 dias estreitou muito a exposição (antes eram todos
 * os destinatários de todas as campanhas vivas), mas não a eliminou. O conserto
 * é paginação ou RPC, e não entra nesta fatia.
 */
export async function contatosJaEmCampanha(
  admin: SupabaseClient,
  organizationId: string,
  exceto?: string,
): Promise<Set<string>> {
  const desde = new Date(Date.now() - DIAS_SEM_REPETIR_A_CADENCIA * 86_400_000).toISOString();

  // (1) RECEBEU na janela. `gte` sobre `sent_at` já descarta quem não recebeu:
  // NULL não passa num `>=`.
  let abordados = admin
    .from("campaign_recipients")
    .select("contact_id")
    .eq("organization_id", organizationId)
    .eq("eligibility_status", "eligible")
    .gte("sent_at", desde);
  if (exceto) abordados = abordados.neq("campaign_id", exceto);
  const { data: jaFalou, error: erroFalou } = await abordados;
  if (erroFalou) throw new Error(`audiência: abordados — ${erroFalou.message}`);

  // (2) ESTÁ NA FILA de campanha que ainda vai falar. Pelo embed `!inner`, e não
  // por uma lista de ids de campanha: aquela lista cresce com o tempo (a
  // contínua nunca conclui) e em algumas centenas a URL do PostgREST estoura. O
  // predicado de status tem tamanho FIXO, então a URL não cresce — mesmo padrão
  // de `lib/cadencia/saidas.handler.ts` e o racional de `lib/leads/radar-de-risco.ts`.
  let naFila = admin
    .from("campaign_recipients")
    .select("contact_id, campaigns!inner(status)")
    .eq("organization_id", organizationId)
    .eq("eligibility_status", "eligible")
    .in("status", NA_FILA_DE_DESPACHO as unknown as string[])
    .not("campaigns.status", "in", `(${STATUS_TERMINAIS.join(",")})`);
  if (exceto) naFila = naFila.neq("campaign_id", exceto);
  const { data: aCaminho, error: erroFila } = await naFila;
  if (erroFila) throw new Error(`audiência: na fila — ${erroFila.message}`);

  return new Set(
    [...(jaFalou ?? []), ...(aCaminho ?? [])].map((r) => (r as { contact_id: string }).contact_id),
  );
}

/** Aspas para o literal de array do Postgres — etiqueta com vírgula quebraria o `{a,b}`. */
function citar(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
