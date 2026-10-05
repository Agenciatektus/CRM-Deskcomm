/**
 * O CARD DE QUEM FOI ABORDADO — a campanha com passos põe a lista no funil.
 *
 * ═══ Por que o card nasce na ABORDAGEM, e não só na resposta ═══
 *
 * Decisão do dono (05/10/2026). Até aqui o card nascia quando a pessoa
 * RESPONDIA (`lib/leads/nascimento-do-lead.ts`), e isso deixava os passos de
 * CRM da régua sem objeto: "mover de etapa" e "etiquetar" agem sobre o negócio,
 * e os passos existem justamente para alcançar quem NÃO respondeu. Na prática o
 * passo falhava, entrava em backoff e matava a inscrição — a régua daquela
 * pessoa parava ali, calada, e os passos seguintes nunca rodavam.
 *
 * Com o card nascendo na abordagem, os dois passos funcionam para o público
 * inteiro e o operador vê a lista toda no quadro, com o estágio de cada um. O
 * custo é aceito e explícito: uma campanha de 500 pessoas cria 500 cards no
 * funil escolhido.
 *
 * ═══ O que NÃO muda ═══
 *
 * Campanha SEM passos não chega aqui. Ela não publica régua, não inscreve
 * ninguém e não cria card nenhum: segue idêntica ao comportamento anterior,
 * com o card nascendo na resposta.
 *
 * ═══ Onde isto é chamado, e por que ali ═══
 *
 * Dentro de `inscreverContatoNaRegua` (`lib/cadencia/inscrever.ts`), DEPOIS dos
 * freios e da reserva da vaga do dia. É a ordem que importa: bloqueio,
 * anonimização, recusa de marketing, supressão por telefone, anti-laço e teto
 * do dia já disseram "sim" quando o card nasce. Criar antes abriria card para
 * quem a inscrição recusa em seguida — lixo no funil de quem pediu para não
 * receber, que é o pior lugar possível para deixar rastro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createLeadHandler } from "@/app/api/v1/leads/_handler";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { ORIGEM_CAMPANHA, marcaDaOrigem } from "@/lib/campanhas/origem-do-lead";
import { destinoDaCampanha } from "@/lib/leads/nascimento-do-lead";
import { logger } from "@/lib/logger";

export interface CampanhaDoCard {
  id: string;
  organization_id: string;
  name: string;
  pipeline_id: string | null;
  stage_id: string | null;
}

/**
 * Garante UM card aberto no funil da campanha para este contato, e devolve o id.
 *
 * `null` = não deu, e não deu NÃO É falha de envio: a mensagem já saiu. Quem
 * chama segue inscrevendo sem negócio (a régua roda; só os passos de CRM ficam
 * sem objeto) e o motivo fica no log.
 *
 * ═══ Idempotência ═══
 *
 * Negócio ABERTO do contato no funil da campanha é REUSADO, nunca duplicado.
 * Isso cobre os três caminhos que repetem: repreparar a campanha, uma rodada
 * que volta no mesmo destinatário depois de queda, e a pessoa que já estava no
 * funil antes de a campanha existir. A consulta é a mesma de
 * `lib/cadencia/efeitos.ts` (`negocioDaInscricao`), de propósito: o passo de CRM
 * tem de encontrar o MESMO negócio que esta função decidiu usar.
 *
 * ⚠️ Não há índice único que garanta isso no banco — duas rodadas exatamente
 * simultâneas no mesmo destinatário poderiam criar dois cards. A reserva de
 * destinatário (`pending → sending`, compare-and-set em `rodada.ts`) é o que
 * serializa de fato: só um worker chega aqui por destinatário.
 */
export async function garantirCardDaAbordagem(
  admin: SupabaseClient,
  entrada: {
    campanha: CampanhaDoCard;
    contactId: string;
    /** O destinatário, para o card poder apontar para a linha que o originou. */
    destinatarioId: string;
    requestId: string;
  },
): Promise<string | null> {
  const { campanha, contactId } = entrada;
  const org = campanha.organization_id;
  if (!campanha.pipeline_id) return null;

  try {
    const { data: existente, error } = await admin
      .from("crm_leads")
      .select("id")
      .eq("organization_id", org)
      .eq("contact_id", contactId)
      .eq("pipeline_id", campanha.pipeline_id)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (existente) return (existente as { id: string }).id;

    // Funil e etapa pela MESMA função que a resposta usa: a campanha manda com o
    // `stage_id` que ela declarou e, sem ele, vale a 1ª etapa não arquivada do
    // funil (menor `position`, nunca ganho nem perda). Com duas regras, o card
    // nasceria numa etapa na abordagem e a resposta o quereria noutra — e, como
    // já existe card aberto, a segunda regra ficaria sem efeito, calada.
    const destino = await destinoDaCampanha(admin, org, campanha.pipeline_id, campanha.stage_id);
    if ("erro" in destino) {
      logger.warn("[campanha] card da abordagem sem etapa de entrada", {
        campanha: campanha.id,
        funil: campanha.pipeline_id,
        motivo: destino.erro,
      });
      return null;
    }

    const { data: contato } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number")
      .eq("organization_id", org)
      .eq("id", contactId)
      .maybeSingle();

    const marca = marcaDaOrigem({
      campanhaId: campanha.id,
      nome: campanha.name,
      pipelineId: campanha.pipeline_id,
      stageId: campanha.stage_id,
    });

    const lead = await createLeadHandler(
      admin as never,
      {
        organization_id: org,
        actor: { type: "webhook_source", id: `campaign:${campanha.id}` },
        requestId: entrada.requestId,
      } as Parameters<typeof createLeadHandler>[1],
      {
        pipeline_id: destino.pipelineId,
        stage_id: destino.stageId,
        // `rotuloDoContato`, e não só o nome: ele cai no telefone e, em último
        // caso, em "Sem nome". `title` é NOT NULL e o card de uma lista
        // importada sem nome existe — um card sem título seria pior que um card
        // com o número, que é o que o atendente copia de todo jeito.
        title: rotuloDoContato(contato ?? null),
        contact_id: contactId,
        tags: [],
        // `source` e `source_metadata` pela marca COMPARTILHADA com o card que
        // nasce da resposta: quem abre o quadro lê "campanha" e sabe qual, e as
        // métricas de origem do funil não passam a mentir com a lista inteira
        // entrando como lead que chegou sozinho. O que acrescentamos é QUANDO
        // ele nasceu e de qual linha da lista.
        ...marca,
        source_metadata: {
          ...marca.source_metadata,
          campaign_recipient_id: entrada.destinatarioId,
          nasceu_na: "abordagem",
        },
        // ⚠️ CRIAÇÃO EM LOTE, e vai no INPUT — `createLeadHandler` lê
        // `input.via`, não `ctx.via`. Esta marca esteve no objeto errado, e o
        // cast `as never` do ctx a engoliu sem um ruído: a cascata ficava
        // DESTAMPADA (gatilho "Lead criado" e motor de regras mandando uma
        // mensagem por card) com o código parecendo resolvido. Quem cobre a
        // ligação agora é `card-da-abordagem.test.ts`, que confere o argumento.
        //
        // Sem ela: centenas de mensagens proativas, no mesmo minuto em que a
        // campanha acabou de falar com essas mesmas pessoas. Ver
        // `lib/leads/criacao-em-lote.ts`.
        via: ORIGEM_CAMPANHA,
      } as Parameters<typeof createLeadHandler>[2],
    );

    const id = (lead as { id?: string }).id ?? null;
    if (!id) throw new Error("create_lead_sem_id");
    return id;
  } catch (err) {
    // Nunca sobe: a 1ª mensagem já saiu, e transformar isto em erro faria a
    // rodada marcar como falha um envio que aconteceu — ou, pior, tentar de
    // novo e mandar a mesma mensagem duas vezes.
    logger.warn("[campanha] card da abordagem não foi criado", {
      campanha: campanha.id,
      destinatario: entrada.destinatarioId,
      motivo: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
