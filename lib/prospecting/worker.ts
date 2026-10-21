import { audit } from "@/lib/audit";
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { loadChannelKnobs, loadPacingState, recordSend } from "@/lib/agent-engine/pacing/store";
import {
  decidePacing,
  janelaDeEnvioAberta,
  proximaAberturaDaJanela,
} from "@/lib/agent-engine/pacing/engine";
import { gerarAbordagemDeFormulario } from "@/lib/agent-engine/agent/abordagem-de-formulario";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { assertServiceBoundarySupabase } from "@/lib/atendimento/origem";
import { comSaida } from "./rodape-de-saida";
import { splitForSend } from "@/lib/agent-engine/agent/split-message";
import type { Message } from "@/lib/types/messaging";
import {
  proximoEnvioDaEsteiraFria,
  tetoDiarioDaEsteiraFria,
} from "./ritmo-da-esteira-fria";
import { parseServiceBoundary } from "@/lib/atendimento/fronteira";
import { autorizarContatoParaIA } from "@/lib/ai/elegibilidade/autorizacao";
import { decidirPreGoLiveDoCanalViaSupabase } from "@/lib/ai/elegibilidade/consulta-pre-go-live";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { assertProspectingContinuation, assertProspectingDelivery } from "./guard";
import { campaignConfigSchema } from "./schema";
import { ProspectingError } from "./provider";
import { OrgNaoOperanteError } from "@/lib/organizacao/operante";
import {
  withProspectingLock,
  synchronizeSearch,
  validateConfig,
  prepararCandidatoNoEnvio,
  type Campaign,
  type Candidate,
} from "./store";

export async function sendNextCandidate(
  pool: pg.Pool,
  db: pg.PoolClient,
  admin: SupabaseClient,
  c: Campaign,
  /**
   * A pausa ENTRE bolhas, injetável para o teste (mesmo expediente do `sleep`
   * do turno). Bolhas são mensagens FÍSICAS no mesmo número: saírem no mesmo
   * milissegundo é a cadência de robô que a detecção de automação procura, e o
   * ritmo do número (`throttle_ms` + `jitter_max_ms`, 0010) já existe para
   * isto. Só entre bolhas — a primeira sai já.
   */
  dormir: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const cfg = campaignConfigSchema.parse(c.config);
  await validateConfig(db, c.organization_id, cfg);
  if (new Date(c.next_send_at).getTime() > Date.now()) return;
  const { knobs, numberActivatedAt } = await loadChannelKnobs(
    db,
    c.organization_id,
    cfg.channel_session_id,
  );
  const now = new Date();
  const nextWindow = janelaDeEnvioAberta(now, knobs) ? null : proximaAberturaDaJanela(now, knobs);
  if (nextWindow) {
    await db.query(
      "update prospecting_campaigns set next_send_at=$3 where organization_id=$1 and id=$2",
      [c.organization_id, c.id, nextWindow],
    );
    return;
  }
  const pacingState = await loadPacingState(db, c.organization_id, cfg.channel_session_id, {
    now,
    timezone: knobs.timezone,
    numberActivatedAt,
  });
  const channel = (
    await db.query(
      "select daily_message_limit from channel_sessions where organization_id=$1 and id=$2",
      [c.organization_id, cfg.channel_session_id],
    )
  ).rows[0];
  if (!channel) throw new ProspectingError("Conexão de saída indisponível.");
  const pacing = decidePacing({
    now,
    knobs,
    state: pacingState,
    crmDailyLimit: channel.daily_message_limit,
  });
  if (!pacing.allow || pacing.waitMs > 0) {
    const next = pacing.allow ? new Date(now.getTime() + pacing.waitMs) : pacing.nextAllowedAt;
    await db.query(
      "update prospecting_campaigns set next_send_at=$3 where organization_id=$1 and id=$2",
      [c.organization_id, c.id, next],
    );
    return;
  }
  // Count attempts, including failures/unknown delivery: a timeout must not release quota.
  const { rows: counts } = await db.query<{
    campaign: number;
    total: number;
    retry_at: Date | null;
    last_attempt: Date | null;
  }>(
    "select count(*) filter(where campaign_id=$2)::int as campaign,count(*)::int as total,max(attempted_at) as last_attempt,min(attempted_at)+interval '24 hours' as retry_at from prospecting_candidates where organization_id=$1 and attempted_at>now()-interval '24 hours'",
    [c.organization_id, c.id],
  );
  const count = counts[0]!;
  // O TETO DO WARM-UP DESTA ESTEIRA. Os degraus da casa (20 no primeiro dia)
  // foram calibrados para a esteira de RESPOSTA, onde cada saída tem uma entrada
  // correspondente. Vinte PRIMEIRAS abordagens saindo de um número novo, todas
  // para quem nunca falou com a empresa, é o retrato do que a plataforma pune —
  // e quem perde o número é o cliente que instalou.
  const idadeEmDias = numberActivatedAt
    ? Math.floor((now.getTime() - new Date(numberActivatedAt).getTime()) / 86_400_000)
    : 0; // sem data registrada = degrau mais conservador, como o motor da casa faz
  const tetoFrio = tetoDiarioDaEsteiraFria(knobs, idadeEmDias);
  if (tetoFrio !== null && count.total >= tetoFrio) {
    await db.query(
      "update prospecting_campaigns set next_send_at=$3 where organization_id=$1 and id=$2",
      [c.organization_id, c.id, count.retry_at],
    );
    return;
  }
  if (count.campaign >= cfg.daily_limit || count.total >= 50) {
    await db.query(
      "update prospecting_campaigns set next_send_at=$3 where organization_id=$1 and id=$2",
      [c.organization_id, c.id, count.retry_at],
    );
    return;
  }
  if (count.last_attempt) {
    const next = new Date(new Date(count.last_attempt).getTime() + cfg.interval_minutes * 60000);
    if (next > now) {
      await db.query(
        "update prospecting_campaigns set next_send_at=$3 where organization_id=$1 and id=$2",
        [c.organization_id, c.id, next],
      );
      return;
    }
  }
  const queued = (
    await db.query<Candidate>(
      "select * from prospecting_candidates where organization_id=$1 and campaign_id=$2 and status='queued' order by created_at,id limit 1",
      [c.organization_id, c.id],
    )
  ).rows[0];
  if (!queued) {
    await db.query(
      "update prospecting_campaigns set status='completed',updated_at=now() where organization_id=$1 and id=$2 and status='running'",
      [c.organization_id, c.id],
    );
    return;
  }
  // A checagem do canal olha o telefone desta empresa (modo de teste, lista liberada) e vem
  // ANTES de qualquer criação: se ela recusar, a campanha pausa sem ter deixado contato,
  // negócio nem conversa para trás — que é exatamente o que o modo `on_send` quer evitar.
  const preflight = await decidirPreGoLiveDoCanalViaSupabase(admin, {
    organizationId: c.organization_id,
    channelSessionId: cfg.channel_session_id,
    contactPhoneNumber: queued.phone ?? "",
  });
  if (!preflight.permite)
    throw new ProspectingError(`O canal ainda não permite esta abordagem: ${preflight.motivo}.`);
  // MODO `on_send`: a empresa está na fila, mas ainda NÃO existe no CRM — contato,
  // negócio e conversa nascem agora, na vez dela de ser abordada. Se ela saiu da fila
  // no caminho (virou contato por outro lado, ou o CRM recusou o cadastro), não houve
  // tentativa: `attempted_at` não foi gravado, e a próxima rodada pega a seguinte.
  const p =
    cfg.funnel_entry === "on_send" && !queued.conversation_id
      ? await prepararCandidatoNoEnvio(db, admin, c, cfg, queued)
      : queued;
  if (!p) return;
  // O idioma da instalação decide a PALAVRA de saída. Uma consulta por envio, no
  // mesmo caminho que já faz várias — e o envio é limitado a 1 por vez pelo
  // ritmo anti-banimento, então não há volume aqui para otimizar.
  const locale =
    (
      await db.query<{ locale: string | null }>(
        "select locale from organizations where id=$1",
        [c.organization_id],
      )
    ).rows[0]?.locale ?? null;
  const boundary = parseServiceBoundary(p.service_boundary);
  if (!boundary || !p.contact_id || !p.conversation_id)
    // DO CANDIDATO: este não tem contato/conversa resolvidos. O próximo pode ter.
    throw new ProspectingError(
      "Destino da abordagem incompleto para este candidato.",
      422,
      "candidato",
    );
  await db.query("begin");
  try {
    await db.query(
      "update prospecting_candidates set status='sending',attempted_at=now(),updated_at=now() where organization_id=$1 and id=$2",
      [c.organization_id, p.id],
    );
    // O agendamento leva JITTER: o intervalo exato (`now + N minutos`, sempre o
    // mesmo número de milissegundos) é cadência de robô, que é justamente o que
    // a detecção de automação procura. A doutrina da casa manda throttle+jitter
    // em todo envio; aqui faltava. O jitter só ATRASA, nunca adianta, para não
    // furar o intervalo mínimo que o operador configurou.
    await db.query(
      "update prospecting_campaigns set next_send_at=$3 where organization_id=$1 and id=$2",
      [
        c.organization_id,
        c.id,
        proximoEnvioDaEsteiraFria(new Date(), cfg.interval_minutes, knobs),
      ],
    );
    // Reserve the shared channel budget before the external effect, including uncertain attempts.
    await recordSend(db, c.organization_id, cfg.channel_session_id, now);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  const guard = {
    organizationId: c.organization_id,
    candidateId: p.id,
    conversationId: p.conversation_id,
  };
  try {
    await assertProspectingDelivery(admin, guard);
    await assertServiceBoundarySupabase(admin, boundary);
    const agent = (
      await db.query<{
        published_version_id: string;
        operation_revision: number | string;
        split_messages: boolean | null;
        split_max_chars: number | null;
      }>(
        // O ESTILO DE RESPOSTA do agente mora na versão publicada (`ai_agent_versions`,
        // migration 0059), não no agente: é a MESMA coluna que a tela "Estilo de
        // resposta" grava e que o turno inbound lê. `LEFT JOIN` porque a ponta é o
        // agente — sem versão publicada a linha continua vindo, e o teste de
        // `published_version_id` abaixo responde com o mesmo erro de antes.
        "select a.published_version_id,a.operation_revision,v.split_messages,v.split_max_chars from ai_agents a left join ai_agent_versions v on v.organization_id=a.organization_id and v.id=a.published_version_id where a.organization_id=$1 and a.id=$2 and a.operation_mode='automatic' and a.paused_at is null and a.archived_at is null",
        [c.organization_id, cfg.agent_id],
      )
    ).rows[0];
    if (!agent?.published_version_id)
      throw new ProspectingError("Agente pausado ou sem versão publicada.");
    const generated = await gerarAbordagemDeFormulario(pool, llmEdgeConfigFromEnv(env), {
      tenantId: c.organization_id,
      agentId: cfg.agent_id,
      leadId: p.contact_id,
      instrucao: `${cfg.instruction}\nFaça uma primeira abordagem curta e transparente. Os dados vieram de pesquisa pública, não de um formulário preenchido pela pessoa. Não invente familiaridade, resultados ou interesse. Uma pergunta por vez. Critérios a confirmar durante a conversa: ${cfg.qualification}`,
      origem: "Pesquisa de empresas",
      // NÃO é `automacao`: a pessoa não entrou em funil nenhum. O prompt do
      // ramo frio é o único que proíbe afirmar preenchimento — ver blocoDeModo.
      origemDaAbordagem: "prospeccao_fria",
      dados: {
        Empresa: p.data.name,
        Segmento: p.data.category ?? "",
        Endereço: p.data.address ?? "",
        Site: p.data.website ?? "",
        Avaliação: String(p.data.rating ?? ""),
        Redes: p.data.socials.join(", "),
      },
    });
    if (!generated.ok)
      // DO CANDIDATO: o modelo não produziu texto para ESTES dados.
      throw new ProspectingError(
        `A IA não produziu uma abordagem: ${generated.reason}.`,
        422,
        "candidato",
      );
    await assertProspectingDelivery(admin, guard);
    const authorization = await autorizarContatoParaIA(admin, {
      organizationId: c.organization_id,
      contactId: p.contact_id,
      reason: `campanha:${c.id}`,
    });
    if (!authorization.ok)
      throw new ProspectingError("Não foi possível preparar o atendimento da resposta.");
    // A SAÍDA é montada aqui — não pedida ao modelo — e vai JUNTO DA PRIMEIRA
    // BOLHA. Sem ela, a saída que a pessoa usa é "Denunciar spam", que é
    // invisível ao sistema e queima o número do CLIENTE que instalou. O idioma
    // sai de `organizations.locale`: um rodapé em português numa instalação em
    // espanhol oferece uma palavra que a pessoa não responde, e o detector de
    // opt-out só reconhece a palavra ISOLADA.
    //
    // POR QUE NA PRIMEIRA, e não na última (revisão do PR #2680): quem está do
    // outro lado não abre a conversa por partes. Se qualquer bolha depois da
    // primeira não sair — veto do canal, status não confirmado, ou a pessoa
    // respondendo no meio — quem recebeu a apresentação fica SEM saída numa
    // mensagem fria, que é o desfecho que mais queima número. O rodapé é a única
    // parte da abordagem que não pode depender do resto ter dado certo.
    //
    // O corte vem ANTES do rodapé por isso: o texto do modelo é que é fatiado no
    // estilo configurado, e o rodapé (parágrafo próprio, ~60 caracteres) entra na
    // primeira bolha já pronta. Isso a deixa alguns caracteres acima de
    // `split_max_chars` — é o mesmo preço que o `splitForSend` já paga quando o
    // teto de bolhas do turno é atingido: a alternativa seria picar a saída em
    // duas mensagens, e aí ela voltaria a depender de uma bolha posterior.
    const baloes = splitForSend(
      generated.texto,
      agent.split_messages ?? false,
      agent.split_max_chars ?? 600,
    );
    // Texto vazio com o estilo ligado não devolve bolha nenhuma (`splitForSend` →
    // `[]`), e a abordagem fria não pode sair SEM a saída: neste caso a bolha é
    // só o rodapé.
    if (baloes.length === 0) baloes.push("");
    baloes[0] = comSaida(baloes[0]!, locale);
    let mensagem: Message | undefined;
    let falhouEm: Message | undefined;
    /** A conversa deixou de ser fria ENTRE bolhas: a pessoa respondeu ou um humano assumiu. */
    let parouEm: string | undefined;
    /** Bolhas FÍSICAS confirmadas — é o "o que saiu" que a trilha registra. */
    let entregues = 0;
    for (let i = 0; i < baloes.length; i++) {
      if (i > 0) {
        // Bolhas são mensagens FÍSICAS no mesmo número: saírem juntas é a cadência
        // de robô que a detecção procura. O ritmo do número (throttle + jitter,
        // knobs 0010) que decide a pausa — a primeira sai sem esperar.
        await dormir(
          (knobs.throttleMs ?? 1200) + Math.floor(Math.random() * (knobs.jitterMaxMs ?? 800)),
        );
        // A guarda de PRIMEIRO CONTATO já cumpriu o papel dela na 1ª bolha (é ela
        // que recusa conversa com `last_outbound_at` — carimbo que o PRÓPRIO
        // handler grava ao enviar a 1ª). Entre as seguintes vale a conferência
        // leve: a pessoa respondeu, foi bloqueada ou um humano assumiu → PARA,
        // mas só ESTE candidato: a campanha não é pausada, porque nada nela
        // falhou (e a pessoa responder é o desfecho que ela procura).
        try {
          await assertProspectingContinuation(admin, {
            organizationId: c.organization_id,
            candidateId: p.id,
            conversationId: p.conversation_id,
          });
        } catch (error) {
          parouEm =
            error instanceof ProspectingError
              ? error.message
              : "A abordagem foi interrompida entre bolhas.";
          break;
        }
      }
      mensagem = await sendMessageHandler(
        admin,
        {
          organization_id: c.organization_id,
          actor: { type: "ai_agent", id: p.id, agent_id: cfg.agent_id, role: "ai_operator" },
          requestId: `prospecting:${p.id}`,
          serviceBoundary: boundary,
          // O RECIBO E A IDEMPOTÊNCIA do candidato moram na PRIMEIRA bolha: é a
          // linha `messages` de id estável (`p.message_id`) que o `sending`
          // grava antes, e o eco do próprio envio casa por ela. As demais são
          // mensagens próprias — repetir o id faria o handler devolver a linha
          // de antes sem enviar (o ramo 23505).
          // A GUARDA CHEIA acompanha a PRIMEIRA bolha, e só ela: o handler a
          // roda na entrada de cada envio (`_handler.ts:437`) e ela recusa
          // conversa com `last_outbound_at` — que é o carimbo que o próprio
          // handler grava logo depois de enviar esta bolha. Repetida nas
          // seguintes, ela recusava a 2ª com 409 de escopo `campanha`, pausava a
          // campanha no primeiro contato e deixava a pessoa sem a saída.
          ...(i === 0
            ? { internalMessageId: p.message_id, prospectingDelivery: guard }
            : {}),
          proactiveContext: { organizationId: c.organization_id, contactId: p.contact_id },
          agentOperation: {
            organizationId: c.organization_id,
            agentId: cfg.agent_id,
            versionId: agent.published_version_id,
            revision: String(agent.operation_revision),
          },
        },
        {
          conversation_id: p.conversation_id,
          type: "text",
          body: baloes[i]!,
        },
      );
      // Veto/bloqueio/falha: para aqui, como o `sendInBubbles` do turno. Não se
      // segue mandando bolha atrás de um canal que acabou de recusar. A falha
      // numa bolha DEPOIS da primeira é do CANDIDATO: a abordagem dele parou no
      // meio. Nunca da campanha — as outras pessoas não têm nada a ver com o
      // canal ter recusado este texto, e pausar a fila inteira por isso é o que
      // a casa não faz em lugar nenhum.
      if (!["sent", "delivered", "read"].includes(mensagem.status)) {
        falhouEm = mensagem;
        break;
      }
      entregues++;
    }
    const sent = falhouEm === undefined && parouEm === undefined;
    if (falhouEm) {
      // This lane never auto-retries an uncertain send. The Inbox keeps the evidence.
      // O id é o da bolha que falhou (pode não ser a primeira).
      await db.query(
        "update messages set status='failed' where organization_id=$1 and id=$2 and status in ('queued','sending')",
        [c.organization_id, falhouEm.id ?? p.message_id],
      );
    }
    if (parouEm)
      logger.info("[prospecting] a conversa deixou de ser fria entre bolhas; a campanha segue", {
        organization_id: c.organization_id,
        campaign_id: c.id,
        candidate_id: p.id,
        sent_bubbles: entregues,
        reason: parouEm,
      });
    // A abordagem SAIU (e não falhou) em dois casos: todas as bolhas confirmadas,
    // ou a primeira saiu e as seguintes pararam porque a conversa deixou de ser
    // fria. Marcar este segundo caso como falha seria chamar de defeito a pessoa
    // ter respondido — que é o que a campanha inteira existe para conseguir. O
    // que não saiu fica na trilha, com a contagem de bolhas.
    const abordou = sent || parouEm !== undefined;
    await db.query(
      "update prospecting_candidates set status=$3,error=$4,updated_at=now() where organization_id=$1 and id=$2",
      [
        c.organization_id,
        p.id,
        abordou ? "sent" : "failed",
        abordou ? null : "Envio não confirmado. Consulte a conversa antes de reenviar.",
      ],
    );

    /*
     * A TRILHA DA ABORDAGEM FRIA — quem foi abordado, por qual campanha, quando.
     *
     * Esta é a única linha do produto que fala PRIMEIRO com alguém que nunca
     * falou com a empresa, e o titular pode perguntar "por que vocês me
     * escreveram?". Sem esta entrada, a resposta não existe em lugar nenhum:
     * `prospecting_candidates.status` guarda o ESTADO atual (e é reescrito no
     * próximo passo), não o fato de que a mensagem saiu naquele instante.
     *
     * Auditado quando houve EFEITO — a tentativa, bem ou malsucedida —, nunca
     * rodada de cron vazia: o tick sem candidato não passa por aqui, que é a
     * regra do CLAUDE.md ("rodada de cron que não fez nada NÃO é mutação").
     * `sent` entra no metadata em vez de virar duas ações: a pergunta que a
     * trilha responde é "houve abordagem para este contato", e a recusa do
     * transporte é parte dessa história, não outra.
     *
     * Com bolhas, `sent` (todas confirmadas) deixou de ser a resposta inteira: a
     * abordagem fatiada pode sair em parte — a 1ª bolha entregue e a 2ª recusada
     * —, e é justamente num caso desses que "por que vocês me escreveram?"
     * precisa de resposta. Por isso `bubbles_sent`/`bubbles_total` vão junto: a
     * trilha registra O QUE SAIU, não só que alguma coisa foi tentada.
     *
     * Sem PII: nem telefone, nem o texto gerado. Os ponteiros bastam para
     * chegar à conversa, e o texto vive nela.
     */
    void audit({
      action: "prospecting.approach_sent",
      organizationId: c.organization_id,
      bypassedRls: true,
      resourceType: "prospecting_candidate",
      resourceId: p.id,
      metadata: {
        campaign_id: c.id,
        contact_id: p.contact_id,
        conversation_id: p.conversation_id,
        agent_id: cfg.agent_id,
        channel_session_id: cfg.channel_session_id,
        sent,
        // Bolhas FÍSICAS confirmadas / bolhas em que o texto foi fatiado.
        bubbles_sent: entregues,
        bubbles_total: baloes.length,
        // Por que as seguintes não saíram, quando a conversa deixou de ser fria.
        ...(parouEm ? { stopped_reason: parouEm } : {}),
      },
      requestId: `prospecting:${p.id}`,
    });
  } catch (error) {
    // Organização parada: a porta de saída lança ANTES de qualquer envio, então
    // o candidato não foi tentado. Volta à fila (`queued`); marcá-lo `failed`
    // o tiraria da lista para sempre por algo que não é dele.
    if (error instanceof OrgNaoOperanteError) {
      await db.query(
        "update prospecting_candidates set status='queued',updated_at=now() where organization_id=$1 and id=$2",
        [c.organization_id, p.id],
      );
      throw error;
    }
    await db.query(
      "update prospecting_candidates set status='failed',error=$3,updated_at=now() where organization_id=$1 and id=$2",
      [
        c.organization_id,
        p.id,
        error instanceof ProspectingError
          ? error.message
          : "A abordagem foi interrompida. Verifique o agente, a conexão e o histórico.",
      ],
    );
    throw error;
  }
}

export async function tickProspecting(pool: pg.Pool, admin: SupabaseClient) {
  // Organização parada (suspensa, redigida, arquivada) não prospecta: a busca é
  // paga e a abordagem sai para fora. O corte é no SQL, antes do `limit 20`:
  // a ordem é `min(updated_at)`, e a org pulada nunca toca `updated_at` —
  // filtrar depois a deixaria no topo para sempre. A régua é a SQL
  // `fn_org_operante` (mesma de `organizations.status = 'active'`) — não se
  // trafega a lista de ids das paradas na consulta (cortaria em `max_rows`).
  const { rows: organizations } = await pool.query<{ organization_id: string }>(
    "select pc.organization_id from prospecting_campaigns pc where (pc.status='running' or pc.search_status in ('starting','running')) and public.fn_org_operante(pc.organization_id) group by pc.organization_id order by min(pc.updated_at) limit 20",
  );
  const deadline = Date.now() + 180000;
  let processed = 0;
  for (const { organization_id: org } of organizations) {
    if (Date.now() >= deadline) break;
    try {
      await withProspectingLock(pool, org, async (db) => {
        await db.query(
          "update prospecting_campaigns set search_status='unknown',error='Busca sem confirmação. Consulte o histórico no provedor antes de repetir.',updated_at=now() where organization_id=$1 and search_status='starting' and created_at<now()-interval '2 minutes'",
          [org],
        );
        await db.query(
          "update prospecting_candidates set status='failed',error='Execução interrompida; envio não será repetido automaticamente.',updated_at=now() where organization_id=$1 and status='sending' and attempted_at<now()-interval '10 minutes'",
          [org],
        );
        const searches = (
          await db.query<Campaign>(
            "select * from prospecting_campaigns where organization_id=$1 and search_status='running' order by created_at limit 2",
            [org],
          )
        ).rows;
        for (const c of searches) {
          try {
            await synchronizeSearch(db, admin, c);
          } catch (error) {
            await db.query(
              "update prospecting_campaigns set error=$3,updated_at=now() where organization_id=$1 and id=$2",
              [
                org,
                c.id,
                error instanceof ProspectingError
                  ? error.message
                  : "Falha ao consultar os resultados. A próxima rodada tentará novamente.",
              ],
            );
          }
        }
        const c = (
          await db.query<Campaign>(
            "select * from prospecting_campaigns where organization_id=$1 and status='running'",
            [org],
          )
        ).rows[0];
        if (c) {
          try {
            await sendNextCandidate(pool, db, admin, c);
          } catch (error) {
            // Organização parada entre a escolha do tick e o envio (a porta de
            // saída lança `OrgNaoOperanteError`): não é falha da campanha nem do
            // candidato. Pausar deixaria a lista parada DEPOIS da reativação,
            // esperando alguém retomar à mão. Ela segue `running`; o filtro do
            // tick (`idsDeOrgsParadas`) a deixa de fora até a org voltar. O
            // `return` pula o carimbo de `updated_at` e a contagem: nesta rodada
            // a org não devia nem estar aqui.
            if (error instanceof OrgNaoOperanteError) {
              logger.info("[prospecting] organização parada no envio; a campanha segue", {
                organization_id: org,
                campaign_id: c.id,
              });
              return;
            }
            // DE QUEM É A FALHA decide se a fila para.
            //
            // Antes, QUALQUER exceção pausava a campanha inteira: um número
            // inválido numa lista de mil, um contato que virou bloqueado entre a
            // busca e o envio, uma instabilidade de um segundo no provedor — e a
            // lista só voltava se alguém abrisse a tela e retomasse à mão. É o
            // oposto do que a casa faz em todo lugar: item ruim marca o ITEM.
            const doCandidato =
              error instanceof ProspectingError && error.escopo === "candidato";
            const motivo =
              error instanceof ProspectingError
                ? error.message
                : "Falha inesperada no envio. Confira o histórico antes de retomar.";

            if (doCandidato) {
              // Marca o candidato e SEGUE: a próxima rodada pega o próximo.
              // `attempted_at` já foi gravado antes do envio, então ele não
              // volta para a fila sozinho.
              await db.query(
                "update prospecting_candidates set status='failed',error=$3,updated_at=now() where organization_id=$1 and campaign_id=$2 and status='sending'",
                [org, c.id, motivo],
              );
              logger.warn("[prospecting] candidato falhou; a campanha segue", {
                organization_id: org,
                campaign_id: c.id,
                error: motivo,
              });
            } else {
              // Vale para todos: pausar é o certo, e o erro fica na campanha
              // para a tela explicar a quem for retomar.
              await db.query(
                "update prospecting_campaigns set status='paused',error=$3,updated_at=now() where organization_id=$1 and id=$2",
                [org, c.id, motivo],
              );
            }
          }
        }
        await db.query(
          "update prospecting_campaigns set updated_at=now() where organization_id=$1 and (status='running' or search_status='running')",
          [org],
        );
        processed++;
      });
    } catch (error) {
      if (!(error instanceof ProspectingError && error.status === 409))
        logger.error("[prospecting] rodada falhou", {
          organization_id: org,
          // Era a constante "prospecting_tick_failed". O erro estava capturado
          // na variável e descartado na hora de escrever: o log existia e não
          // dizia nada além de "falhou" — o que é quase pior que não logar,
          // porque parece cobertura. Agora vai a causa.
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
  return { processed };
}
