/**
 * O adapter de produção de `EntradaPorEtapaDb` sobre o client service-role.
 *
 * Mora fora de `entrada-por-etapa.ts` por duas razões. A de forma: aquele
 * arquivo já carrega a doutrina da decisão, e juntar os dois passaria das 300
 * linhas que a regra do repo manda dividir. A de fundo, que é a que importa:
 * a decisão de QUEM entra tem de ser testável sem banco, e um teste que
 * importasse o adapter arrastaria o `SupabaseClient` inteiro para dentro dela.
 *
 * `organization_id` entra em TODA consulta, explicitamente: o client admin
 * ignora RLS, e é ele que este módulo recebe (o dreno do `event_log` não tem
 * usuário). A organização vem da linha do evento, nunca de um corpo de
 * requisição.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";

import { DIAS_SEM_REPETIR_A_CADENCIA } from "@/lib/cadencia/inscrever";

import { STATUS_TERMINAIS } from "./maquina-de-estados";
import { NA_FILA_DE_DESPACHO } from "./tipos";

import { recusouMarketing } from "./elegibilidade";
import { hashDoEndereco } from "./exclusoes";
import type { CampanhaArmada, ContatoDoAlvo, EntradaPorEtapaDb } from "./entrada-por-etapa.tipos";

const COLUNAS_DA_ARMADA =
  "id, organization_id, message_body, message_variants, content_version, teto_diario, started_at";

/**
 * ═══ DOIS CRITÉRIOS, E NÃO UM — é a confusão entre eles que já errou duas vezes ═══
 *
 * O veto "já em campanha" responde a DUAS perguntas diferentes, e colapsar as
 * duas num predicado é o que produziu os dois erros desta fatia:
 *
 *   (1) PASSADO — "falei com essa pessoa nos últimos N dias?". O fato medido é a
 *       mensagem ter SAÍDO: `sent_at`. Independe do estado da campanha, e é por
 *       isso que campanha CANCELADA que já falou continua contando — cancelar
 *       não desfaz a mensagem que a pessoa leu.
 *
 *   (2) PRESENTE — "alguma campanha está a caminho dela agora?". Aqui o fato é
 *       ter linha na FILA ATIVA (`NA_FILA_DE_DESPACHO`) de uma campanha NÃO
 *       TERMINAL. Não é sobre o passado: existe para duas campanhas não mandarem
 *       o primeiro contato para a mesma pessoa na mesma semana, de números
 *       possivelmente diferentes. Aqui o estado da campanha importa, e quem
 *       responde "ainda vai falar?" é `STATUS_TERMINAIS`, derivado da máquina de
 *       estados.
 *
 * As duas voltas erradas, para quem for mexer:
 *
 *   • "linha em campanha VIVA" media (2) e era usado como se medisse (1). Caiu
 *     porque a campanha de entrada contínua nunca conclui: todo contato que ela
 *     tocasse ficaria vetado de toda campanha futura, para sempre.
 *   • "`eligibility_status = 'eligible'` nos últimos 30 dias, menos `cancelled`"
 *     tentou medir (1) com o dado de (2). Erra nas DUAS direções: veta quem está
 *     `pending` e nunca recebeu nada, e LIBERA quem recebeu e depois teve a
 *     campanha cancelada — exatamente o caso que a janela de 30 dias existe para
 *     impedir.
 *
 * Com (1) e (2) separados, "cancelada antes de falar" sai do veto por si: não tem
 * `sent_at` e não tem linha viva. Nenhum predicado precisa olhar `cancelled`.
 *
 * ⚠️ `eligibility_status = 'eligible'` fica nos DOIS ramos, e nos dois é
 * redundante hoje: `sent_at` só é escrito por `rodada.ts` depois de um envio, e
 * linha excluída nasce `skipped`, fora da fila ativa. Fica porque a redundância
 * aqui custa zero e a alternativa seria um predicado de SEGURANÇA apoiado num
 * invariante que mora em outro arquivo — e invariante distante é o que um
 * refactor quebra sem nada ficar vermelho. Redundância em veto se explicita, não
 * se remove.
 */

/**
 * O começo da janela em que ter sido abordado ainda veta uma campanha nova.
 *
 * A constante é a do anti-laço da régua de prospecção
 * (`DIAS_SEM_REPETIR_A_CADENCIA`), importada e não redigitada: um `30` solto
 * aqui seria a segunda definição da mesma política, e o dia em que uma mudasse
 * a outra ficaria mentindo em silêncio.
 */
export function desdeDaJanelaDeRepeticao(agora: Date = new Date()): Date {
  return new Date(agora.getTime() - DIAS_SEM_REPETIR_A_CADENCIA * 86_400_000);
}

/**
 * Esta etapa fecha o negócio? Função NOMEADA no módulo, e não método chamado por
 * `this`: `carregaCampanhasArmadas` também a usa, e um `this.` ali quebraria
 * calado no dia em que alguém desestruturasse a porta
 * (`const { carregaCampanhasArmadas } = db`) — com o resultado de a etapa de
 * fechamento deixar de ser recusada, que é o oposto do que ela existe para fazer.
 *
 * FALHA NÃO LIBERA: sem conseguir provar que a etapa é aberta, trata como
 * fechamento. O erro barato aqui é não abordar; o caro é abordar quem comprou com
 * a copy de primeiro contato.
 */
async function leEtapaDeFechamento(
  admin: SupabaseClient,
  orgId: string,
  stageId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("crm_stages")
    .select("is_won, is_lost")
    .eq("organization_id", orgId)
    .eq("id", stageId)
    .maybeSingle();
  if (error) {
    logger.warn("[campanha] etapa do gatilho ilegível; tratando como fechamento", {
      organizacao: orgId,
      etapa: stageId,
      motivo: error.message,
    });
    return true;
  }
  const etapa = data as { is_won: boolean | null; is_lost: boolean | null } | null;
  // Etapa que não existe mais também não libera: ela não tem como ser afirmada
  // aberta, e a FK da 9038 já tira a campanha do ar nesse caso.
  if (!etapa) return true;
  return etapa.is_won === true || etapa.is_lost === true;
}

export function createSupabaseEntradaPorEtapaDb(admin: SupabaseClient): EntradaPorEtapaDb {
  const ehEtapaDeFechamento = (orgId: string, stageId: string) =>
    leEtapaDeFechamento(admin, orgId, stageId);

  return {
    async carregaCampanhasArmadas(orgId, etapaId) {
      // `status = 'running'` e não "viva": `paused` não aborda gente nova (é o
      // que o botão promete) e `scheduled` ainda não começou. O índice parcial
      // da 9038 cobre `(organization_id, entrada_etapa_id) where
      // entrada_continua`, que é o predicado desta consulta.
      const { data, error } = await admin
        .from("campaigns")
        .select(COLUNAS_DA_ARMADA)
        .eq("organization_id", orgId)
        .eq("entrada_continua", true)
        .eq("entrada_etapa_id", etapaId)
        .eq("status", "running");
      if (error) throw new Error(`campanha_entrada_armadas: ${error.message}`);
      const armadas = (data ?? []) as unknown as CampanhaArmada[];
      if (armadas.length === 0) return armadas;

      // ═══ ETAPA DE FECHAMENTO NÃO ARMA NADA (P1-2 do @Cassio_SecRev) ═══
      //
      // O `<select>` da tela já esconde `is_won`/`is_lost`, e UI não é controle:
      // o tenant pode marcar `is_won` numa etapa DEPOIS de a campanha ter sido
      // armada nela, e dali em diante toda venda ganha viraria uma abordagem de
      // primeiro contato. O comentário do componente diz que ele é "a segunda
      // porta, não a única" — esta é a primeira.
      //
      // Depois da consulta das campanhas, e não antes: no caminho comum (nenhuma
      // campanha armada) não se paga consulta nenhuma, que é o que o corte
      // precoce de `alistarPorEtapa` protege.
      return (await ehEtapaDeFechamento(orgId, etapaId)) ? [] : armadas;
    },

    ehEtapaDeFechamento,

    async carregaNegocio(orgId, leadId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("contact_id, status")
        .eq("organization_id", orgId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw new Error(`campanha_entrada_negocio: ${error.message}`);
      if (!data) return null;
      const linha = data as { contact_id: string | null; status: string | null };
      return { contactId: linha.contact_id, aberto: linha.status === "open" };
    },

    async carregaContato(orgId, contactId) {
      const { data, error } = await admin
        .from("contacts")
        .select("id, name, display_name, phone_number, is_blocked, is_anonymized, is_merged_into, kind, consent")
        .eq("organization_id", orgId)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw new Error(`campanha_entrada_contato: ${error.message}`);
      if (!data) return null;
      const c = data as {
        id: string;
        name: string | null;
        display_name: string | null;
        phone_number: string | null;
        is_blocked: boolean;
        is_anonymized: boolean;
        is_merged_into: string | null;
        kind: string | null;
        consent: unknown;
      };
      // Placeholder de GRUPO e cadastro MESCLADO saem aqui, pelos mesmos motivos
      // de `buscarCandidatos`: campanha é 1:1 por doutrina (o grupo não tem
      // opt-in individual por trás do registro técnico) e quem responde por um
      // cadastro mesclado é o sobrevivente. Devolvidos como `null` — o chamador
      // os conta em `sem_alvo`, e nenhuma linha de exclusão é gravada em nome de
      // um registro que não é a pessoa.
      if (c.kind !== "person" || c.is_merged_into) return null;
      const alvo: ContatoDoAlvo = {
        contactId: c.id,
        nome: nomeDoContato(c),
        telefone: c.phone_number,
        bloqueado: !!c.is_blocked,
        anonimizado: !!c.is_anonymized,
        recusouMarketing: recusouMarketing(c.consent),
      };
      return alvo;
    },

    async estaEmOutraCampanha(orgId, contactId, excetoCampanhaId) {
      const desde = desdeDaJanelaDeRepeticao().toISOString();

      // (1) RECEBEU na janela. `gte` sobre `sent_at` já descarta quem não recebeu:
      // NULL não passa num `>=`.
      const { data: recebeu, error: erroRecebeu } = await admin
        .from("campaign_recipients")
        .select("id")
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .neq("campaign_id", excetoCampanhaId)
        .eq("eligibility_status", "eligible")
        .gte("sent_at", desde)
        .limit(1);
      if (erroRecebeu) throw new Error(`campanha_entrada_abordado: ${erroRecebeu.message}`);
      if ((recebeu ?? []).length > 0) return true;

      // (2) ESTÁ NA FILA de campanha que ainda vai falar. Pelo embed `!inner`, e
      // não por uma lista de ids: a lista de campanhas não terminais cresce com o
      // tempo (a contínua nunca conclui) e em algumas centenas a URL do PostgREST
      // estoura — o mesmo P2-2 que tirou o `.in()` daqui. O predicado de status é
      // de tamanho FIXO (dois valores), então a URL não cresce. Mesmo padrão de
      // `lib/cadencia/saidas.handler.ts` e de `lib/leads/radar-de-risco.ts`.
      const { data: naFila, error: erroFila } = await admin
        .from("campaign_recipients")
        .select("id, campaigns!inner(status)")
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .neq("campaign_id", excetoCampanhaId)
        .eq("eligibility_status", "eligible")
        .in("status", NA_FILA_DE_DESPACHO as unknown as string[])
        .not("campaigns.status", "in", `(${STATUS_TERMINAIS.join(",")})`)
        .limit(1);
      if (erroFila) throw new Error(`campanha_entrada_na_fila: ${erroFila.message}`);
      return (naFila ?? []).length > 0;
    },

    async estaSuprimido(orgId, endereco) {
      if (endereco.trim() === "") return false;
      const { data, error } = await admin
        .from("campaign_suppressions")
        .select("id")
        .eq("organization_id", orgId)
        .eq("recipient_address_hash", hashDoEndereco(endereco))
        .maybeSingle();
      if (error) throw new Error(`campanha_entrada_supressao: ${error.message}`);
      return !!data;
    },

    async alistadosDesde(orgId, campanhaId, desde) {
      // Só os ELEGÍVEIS: o excluído não recebeu mensagem nenhuma, e contá-lo
      // faria uma etapa cheia de bloqueados esgotar o teto do dia de uma
      // campanha que não abordou ninguém.
      const { count, error } = await admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("campaign_id", campanhaId)
        .eq("eligibility_status", "eligible")
        .gte("created_at", desde.toISOString());
      if (error) throw new Error(`campanha_entrada_teto: ${error.message}`);
      return count ?? 0;
    },

    async alista(linha) {
      const { error } = await admin.from("campaign_recipients").insert(linha);
      // 23505 = `campaign_recipients_contato_unico` ou
      // `campaign_recipients_endereco_unico`: esta pessoa (ou este telefone) já
      // tem linha nesta campanha. Caminho NORMAL — é o anti-repetição do card
      // que entra e sai da etapa.
      if (error) {
        if (error.code === "23505") return false;
        // ⚠️ A MENSAGEM DO POSTGREST NÃO SOBE (P2-3 do @Cassio_SecRev). Ela vira o
        // `detail` do handler e desce para `event_log.last_error`, que fica no
        // banco e aparece em tela de diagnóstico — e o INSERT que falhou carrega
        // `recipient_address`, cujo comentário de coluna diz, com estas palavras,
        // que ele "nunca sai em log". Erro de constraint ou de tipo costuma ecoar
        // o valor recusado. Para o recibo vai o CÓDIGO; o texto real vai para o
        // log do servidor, que é onde se investiga.
        logger.warn("[campanha] alistamento por etapa falhou", {
          campanha: linha.campaign_id,
          contato: linha.contact_id,
          codigo: error.code ?? "sem_codigo",
          motivo: error.message,
        });
        throw new Error(`campanha_entrada_alistamento:${error.code ?? "sem_codigo"}`);
      }
      return true;
    },

    async fusoDaOrganizacao(orgId) {
      const { data, error } = await admin
        .from("organizations")
        .select("timezone")
        .eq("id", orgId)
        .maybeSingle();
      if (error) {
        // Falha de leitura do fuso não pode derrubar o alistamento: o fuso só
        // decide onde o DIA começa, e o padrão do produto é o mesmo que a
        // porta da cadência usa.
        logger.warn("[campanha] fuso da organização indisponível no gatilho de etapa", {
          organizacao: orgId,
          motivo: error.message,
        });
        return "America/Sao_Paulo";
      }
      const tz = (data as { timezone: string | null } | null)?.timezone;
      return (tz ?? "America/Sao_Paulo") || "America/Sao_Paulo";
    },
  };
}
