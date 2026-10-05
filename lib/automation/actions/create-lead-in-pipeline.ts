/**
 * Ação `create_lead_in_pipeline` — "Criar card em outro funil".
 *
 * ─── O caso que ela resolve ─────────────────────────────────────────────────
 *
 * Uma loja trabalha com três funis: Vendas → Pós-venda (envio/troca) →
 * Recompra. Quando o card de Vendas entra em "Pago" (etapa de ganho), um card
 * NOVO precisa nascer no Pós-venda para o mesmo contato — e o de Vendas tem de
 * ficar como está: ganho, contando na receita.
 *
 * As duas portas que existiam não servem, e é de propósito que esta ação não
 * reusa nenhuma delas:
 *
 *   - `create_or_move_lead` MOVE: com gatilho de lead e funil diferente ela
 *     recusa (`cross_pipeline_move_not_allowed`), e com gatilho de contato ela
 *     TRANSFERE — encerra a origem como perdida (#992). Aqui a origem fica
 *     intocada;
 *   - `POST /api/v1/leads/:id/clone` só aceita negócio aberto e também fecha a
 *     origem. É troca de funil, não "próximo funil".
 *
 * ─── Idempotência: a chave natural ─────────────────────────────────────────
 *
 * O card nasce com `source='automation'` e um `external_id` derivado de quem o
 * causou, e o índice único `uniq_crm_leads_org_source_external`
 * (organization_id, source, external_id) garante no BANCO que não nasce dois:
 *
 *   - gatilho de LEAD:    `proximo-funil:lead:<lead_origem>:<funil_destino>` —
 *     um card de origem gera no máximo UM card por funil de destino, para
 *     sempre. Tirar o card de "Pago" e pôr de volta não cria um segundo, nem
 *     depois de o primeiro já ter fechado no Pós-venda;
 *   - gatilho de CONTATO: `proximo-funil:evento:<event_id>:<funil_destino>` —
 *     não há card de origem, então a chave é o EVENTO (o reprocessamento do
 *     mesmo evento não duplica). Um gatilho de contato que se repete (o
 *     aniversário do ano que vem) é um evento novo e pode criar de novo — desde
 *     que o contato não tenha card aberto lá (a checagem abaixo).
 *
 * Antes da chave, uma checagem de negócio: se o contato já tem card ABERTO no
 * funil de destino, nada nasce — não importa quem criou aquele card. Essa
 * checagem é ler-e-depois-escrever, sem garantia no banco (duas regras
 * diferentes podem passar por ela ao mesmo tempo); a garantia que o banco dá é
 * SÓ a da chave. E a chave `lead:<id>:<funil>` faz um gatilho recorrente sobre
 * o mesmo card (etapa, tag, data) criar no máximo UMA vez por funil de destino.
 *
 * Nos dois casos de "já existe" o resultado é `success` com `reason`, e não
 * `skipped`: o agregador do motor (`engine.ts`) conta `skipped` junto de
 * `failed`, e a regra que já fez o trabalho apareceria como "Falhou" na aba
 * Atividade só porque alguém mexeu no card duas vezes. É o mesmo desenho do
 * `add_tag` quando a etiqueta já estava lá.
 *
 * ─── Anti-loop ─────────────────────────────────────────────────────────────
 *
 * A criação passa por `createLeadHandler` com `requestId = rule:<id>`, e o
 * `lead.created` que ele emite carrega esse prefixo: o motor NÃO roda regras
 * sobre esse evento (profundidade 1, `engine.ts`). Consequência que se precisa
 * saber: uma regra "quando um lead for criado" no funil de destino não dispara
 * para o card nascido aqui. O encadeamento Vendas → Pós-venda → Recompra não
 * depende disso: são duas mudanças de etapa feitas por gente, cada uma um
 * evento de origem humana.
 *
 * O `organization_id` vem da regra (`ctx.organizationId`), nunca da config; o
 * funil e a etapa da config são conferidos contra ele com o client de serviço,
 * que não tem RLS.
 */
import { createLeadHandler } from "@/app/api/v1/leads/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { originFromAutomationEvent } from "@/lib/atendimento/origem-automacao";
import { registerAction } from "@/lib/automation/actions";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { viaHerdada } from "@/lib/leads/criacao-em-lote";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { registraFalhaDeAtividade } from "@/lib/leads/activity-write-failure";

export const TYPE = "create_lead_in_pipeline";

/** Prefixo do `external_id`: identifica a origem da chave sem ler o código. */
export const PREFIXO_DA_CHAVE = "proximo-funil";

/** As colunas do card de origem que esta ação usa. */
const COLUNAS_DA_ORIGEM =
  "id, pipeline_id, contact_id, title, value_cents, currency, owner_user_id, owner_agent_id";

interface Origem {
  id: string;
  pipeline_id: string;
  contact_id: string | null;
  title: string | null;
  value_cents: number | null;
  currency: string | null;
  owner_user_id: string | null;
  owner_agent_id: string | null;
}

interface Contato {
  id: string;
  name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
}

/** A chave natural do card nascido — ver o cabeçalho. */
export function chaveDoCard(
  origem: { leadId: string } | { eventId: string },
  pipelineId: string,
): string {
  return "leadId" in origem
    ? `${PREFIXO_DA_CHAVE}:lead:${origem.leadId}:${pipelineId}`
    : `${PREFIXO_DA_CHAVE}:evento:${origem.eventId}:${pipelineId}`;
}

/** Falha com a mensagem CRUA do banco — texto de gente, não código. */
function falhaDoBanco(mensagem: string): ActionResultDetail {
  return { type: TYPE, status: "failed", error: mensagem };
}

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const pipelineId = typeof config.pipeline_id === "string" ? config.pipeline_id : null;
  const stageId = typeof config.stage_id === "string" ? config.stage_id : null;
  if (!pipelineId || !stageId) return { type: TYPE, status: "failed", error: "missing_config" };
  const copiarValor = config.copiar_valor === true;
  const copiarDono = config.copiar_dono === true;
  const org = ctx.organizationId;

  try {
    // ── 1. A ORIGEM: o card do evento, relido do banco com a org da regra ────
    const leadDoEvento = ctx.context.lead as { id?: string } | undefined;
    let origem: Origem | null = null;
    if (typeof leadDoEvento?.id === "string") {
      const { data, error } = await ctx.admin
        .from("crm_leads")
        .select(COLUNAS_DA_ORIGEM)
        .eq("id", leadDoEvento.id)
        .eq("organization_id", org)
        .maybeSingle();
      if (error) return falhaDoBanco(error.message);
      origem = (data as Origem | null) ?? null;
      if (!origem) return { type: TYPE, status: "failed", error: "lead_de_origem_nao_encontrado" };
    }
    const contato = ctx.context.contact as Contato | undefined;
    const contactId = origem ? origem.contact_id : (contato?.id ?? null);
    if (!origem && !contactId) {
      return { type: TYPE, status: "skipped", detail: { reason: "no_lead_or_contact" } };
    }
    if (origem && origem.pipeline_id === pipelineId) return { type: TYPE, status: "failed", error: "destino_e_o_mesmo_funil" };

    // ── 2. O DESTINO: funil e etapa conferidos contra a org da regra ─────────
    const { data: funil, error: funilErr } = await ctx.admin
      .from("crm_pipelines")
      .select("id, name, is_archived")
      .eq("id", pipelineId)
      .eq("organization_id", org)
      .maybeSingle();
    if (funilErr) return falhaDoBanco(funilErr.message);
    const funilDestino = funil as { id: string; name: string | null; is_archived?: boolean } | null;
    if (!funilDestino || funilDestino.is_archived) return { type: TYPE, status: "failed", error: "funil_de_destino_indisponivel" };

    const { data: etapa, error: etapaErr } = await ctx.admin
      .from("crm_stages")
      .select("id, pipeline_id, is_won, is_lost, is_archived")
      .eq("id", stageId)
      .eq("organization_id", org)
      .eq("pipeline_id", pipelineId)
      .maybeSingle();
    if (etapaErr) return falhaDoBanco(etapaErr.message);
    const etapaDestino = etapa as { is_won: boolean; is_lost: boolean; is_archived: boolean } | null;
    if (!etapaDestino || etapaDestino.is_archived) return { type: TYPE, status: "failed", error: "etapa_de_destino_invalida" };
    if (etapaDestino.is_won || etapaDestino.is_lost) return { type: TYPE, status: "failed", error: "etapa_de_destino_de_fechamento" };

    // ── 3. IDEMPOTÊNCIA: a chave natural, depois o card aberto do contato ────
    const externalId = chaveDoCard(
      origem ? { leadId: origem.id } : { eventId: ctx.event?.id ?? ctx.requestId },
      pipelineId,
    );
    const jaCriado = await cardDaChave(ctx, externalId);
    if (jaCriado) {
      return { type: TYPE, status: "success", detail: { reason: "card_ja_criado", lead_id: jaCriado } };
    }
    if (contactId) {
      const aberto = await cardAbertoDoContato(ctx, contactId, pipelineId);
      if (aberto) {
        return { type: TYPE, status: "success", detail: { reason: "contato_ja_tem_card_aberto", lead_id: aberto } };
      }
    }

    // ── 4. A CRIAÇÃO, pela mesma porta da REST/MCP ──────────────────────────
    const handlerCtx: HandlerCtx = {
      organization_id: org,
      actor: { type: "webhook_source", id: ctx.ruleId },
      requestId: `rule:${ctx.ruleId}`,
    };
    handlerCtx.serviceOrigin = contactId
      ? ((await originFromAutomationEvent(ctx, contactId)) ?? { kind: "unavailable", reason: "origin_capture_failed" })
      : { kind: "unavailable", reason: "origin_capture_failed" };

    const titulo =
      origem?.title?.trim() ||
      (contato ? (nomeDoContato(contato) ?? contato.phone_number ?? null) : null) ||
      "Card da automação";
    const { dono, naoCopiado } =
      copiarDono && origem ? await donoQuePodeSerCopiado(ctx, origem) : { dono: {}, naoCopiado: null };

    let criado: Record<string, unknown>;
    try {
      criado = await createLeadHandler(ctx.admin, handlerCtx, {
        pipeline_id: pipelineId,
        stage_id: stageId,
        title: titulo,
        contact_id: contactId,
        ...(copiarValor && origem
          ? { value_cents: origem.value_cents ?? null, ...(origem.currency ? { currency: origem.currency } : {}) }
          : {}),
        ...dono,
        tags: [],
        source: "automation",
        external_id: externalId,
        source_metadata: {
          criado_pela_automacao: {
            rule_id: ctx.ruleId,
            ...(origem ? { lead_id: origem.id, pipeline_id: origem.pipeline_id } : {}),
          },
        },
        // A MARCA DE LOTE do evento de origem viaja com o card que esta ação
        // cria. Sem ela, a cadeia dava a volta: a campanha cria 500 cards em
        // lote, o motor pula as ações que FALAM, roda esta — e os 500
        // `lead.created` novos saem sem marca, com `requestId = 'rule:…'` que o
        // gatilho de follow-up não olha. Resultado: 500 mensagens proativas no
        // mesmo minuto da abordagem, pelo salto seguinte da cadeia.
        ...viaHerdada(ctx.event.metadata),
      } as Parameters<typeof createLeadHandler>[2]);
    } catch (err) {
      // Corrida: outro processamento do mesmo evento criou o card entre a
      // checagem e o INSERT, e o índice único recusou este. O card existe —
      // é o desfecho certo, não uma falha. SÓ para a violação da chave: um
      // erro qualquer depois de um card com a mesma chave aparecer (ele pode
      // ter nascido de outro jeito) não pode ser mascarado como sucesso.
      if (!ehViolacaoDaChave(err)) throw err;
      const vencedor = await cardDaChave(ctx, externalId);
      if (vencedor) {
        return { type: TYPE, status: "success", detail: { reason: "card_ja_criado", lead_id: vencedor } };
      }
      throw err;
    }

    await registraNasDuasTimelines(ctx, {
      novoId: String(criado.id),
      origem,
      contactId,
      funilDestinoNome: funilDestino.name ?? null,
      pipelineDestinoId: pipelineId,
    });

    const criadoId = String(criado.id);
    const origemId = origem ? { origem: origem.id } : {};
    // O card nasceu; o dono só não foi junto. É sucesso — mas quem montou a
    // regra precisa ler POR QUE o card novo está sem responsável.
    if (naoCopiado === "dono_inativo_nao_copiado") {
      return {
        type: TYPE,
        status: "success",
        detail: { created: criadoId, ...origemId, reason: "dono_inativo_nao_copiado" },
      };
    }
    if (naoCopiado === "dono_indeterminado_nao_copiado") {
      return {
        type: TYPE,
        status: "success",
        detail: { created: criadoId, ...origemId, reason: "dono_indeterminado_nao_copiado" },
      };
    }
    return { type: TYPE, status: "success", detail: { created: criadoId, ...origemId } };
  } catch (err) {
    return { type: TYPE, status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * O erro é a recusa do índice único da chave natural?
 *
 * O `createLeadHandler` não propaga o `code` do PostgREST: ele lança
 * `ApiError(500, "internal_error", …, insErr.message)`, então o 23505 chega só
 * na MENSAGEM ("duplicate key value violates unique constraint
 * \"uniq_crm_leads_org_source_external\""). O NOME DO ÍNDICE é o sinal: um
 * 23505 de outra constraint (ou qualquer outro erro) não é esta corrida. Se um
 * dia o handler propagar o erro do PostgREST cru, o nome segue em `message` ou
 * em `details`, e o teste cobre os dois formatos.
 */
export function ehViolacaoDaChave(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { message?: unknown; details?: unknown };
  return [e.message, e.details].some(
    (campo) => typeof campo === "string" && campo.includes("uniq_crm_leads_org_source_external"),
  );
}

type MotivoDoDono = "dono_inativo_nao_copiado" | "dono_indeterminado_nao_copiado";

/**
 * O dono da origem só vai para o card novo se AINDA pode atender.
 *
 * Mesma régua do `assign_owner` (`user_organizations` da org, `revoked_at is
 * null`, papel acima de viewer): um card de Vendas ganho há meses pode ter
 * dono que saiu da equipe, e copiá-lo poria o Pós-venda nas mãos de quem não
 * tem mais acesso. Dono agente: o agente precisa existir na org e não estar
 * arquivado (é a mesma conferência que o `createLeadHandler` faria — só que lá
 * ela derrubaria a criação inteira).
 *
 * Nos dois casos o card nasce SEM dono em vez de a ação falhar: o card é o que
 * a regra existe para entregar, e o responsável se escolhe depois na tela.
 */
async function donoQuePodeSerCopiado(
  ctx: ActionCtx,
  origem: Origem,
): Promise<{ dono: { owner_user_id?: string; owner_agent_id?: string }; naoCopiado: MotivoDoDono | null }> {
  if (origem.owner_user_id) {
    const { data, error } = await ctx.admin
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", ctx.organizationId)
      .eq("user_id", origem.owner_user_id)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) return { dono: {}, naoCopiado: "dono_indeterminado_nao_copiado" };
    const membro = data as { role?: string } | null;
    if (!membro || membro.role === "viewer") return { dono: {}, naoCopiado: "dono_inativo_nao_copiado" };
    return { dono: { owner_user_id: origem.owner_user_id }, naoCopiado: null };
  }
  if (origem.owner_agent_id) {
    const { data, error } = await ctx.admin
      .from("ai_agents")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("id", origem.owner_agent_id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { dono: {}, naoCopiado: "dono_indeterminado_nao_copiado" };
    if (!data) return { dono: {}, naoCopiado: "dono_inativo_nao_copiado" };
    return { dono: { owner_agent_id: origem.owner_agent_id }, naoCopiado: null };
  }
  return { dono: {}, naoCopiado: null };
}

/** O card que esta chave já criou (qualquer status), se houver. */
async function cardDaChave(ctx: ActionCtx, externalId: string): Promise<string | null> {
  const { data } = await ctx.admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("source", "automation")
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** O card ABERTO do contato no funil de destino, se houver. */
async function cardAbertoDoContato(ctx: ActionCtx, contactId: string, pipelineId: string): Promise<string | null> {
  const { data } = await ctx.admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("contact_id", contactId)
    .eq("pipeline_id", pipelineId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * A história dos dois lados: o card novo diz de onde veio; o de origem, que
 * gerou um card em outro funil. Fire-and-forget contado, como no clone: o card
 * já existe, e prender a ação à timeline a deixaria refém do registro.
 */
async function registraNasDuasTimelines(
  ctx: ActionCtx,
  a: {
    novoId: string;
    origem: Origem | null;
    contactId: string | null;
    funilDestinoNome: string | null;
    pipelineDestinoId: string;
  },
): Promise<void> {
  const actor = { type: "webhook_source" as const, id: ctx.ruleId };
  let nomeDoFunilDeOrigem: string | null = null;
  if (a.origem) {
    const { data } = await ctx.admin
      .from("crm_pipelines")
      .select("name")
      .eq("id", a.origem.pipeline_id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    nomeDoFunilDeOrigem = (data as { name?: string | null } | null)?.name ?? null;
  }

  const linhas = [
    {
      leadId: a.novoId,
      type: "created_from_pipeline" as const,
      reason: nomeDoFunilDeOrigem
        ? `Criado pela automação a partir do funil ${nomeDoFunilDeOrigem}`
        : "Criado pela automação",
      payload: {
        rule_id: ctx.ruleId,
        from_lead_id: a.origem?.id ?? null,
        from_pipeline_id: a.origem?.pipeline_id ?? null,
      },
    },
    ...(a.origem
      ? [
          {
            leadId: a.origem.id,
            type: "spawned_in_pipeline" as const,
            reason: a.funilDestinoNome
              ? `Card criado no funil ${a.funilDestinoNome} pela automação`
              : "Card criado em outro funil pela automação",
            payload: { rule_id: ctx.ruleId, to_lead_id: a.novoId, to_pipeline_id: a.pipelineDestinoId },
          },
        ]
      : []),
  ];

  for (const linha of linhas) {
    const r = await emitLeadActivity(ctx.admin, {
      organizationId: ctx.organizationId,
      leadId: linha.leadId,
      contactId: a.contactId,
      type: linha.type,
      sourceModule: "automation",
      sourceId: ctx.ruleId,
      actor,
      reason: linha.reason,
      payload: linha.payload,
    });
    if (!r.ok) {
      await registraFalhaDeAtividade(ctx.admin, {
        organizationId: ctx.organizationId,
        leadId: linha.leadId,
        tipo: linha.type,
        origem: "lib/automation/actions/create-lead-in-pipeline",
        erro: r.error,
        requestId: `rule:${ctx.ruleId}`,
      });
    }
  }
}

registerAction({ type: TYPE, execute });
