import type pg from "pg";
import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { extrairObjetoJsonDoTexto } from "@/lib/agent-engine/texto/extrair-json-do-texto";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import type { LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/credentials";
import type { CrmEdgeConfig } from "@/lib/agent-engine/edge/crm/mcp-client";
import { vocabularioDeMotivos } from "@/lib/leads/motivo-da-perda";
import {
  decide,
  montaPrompt,
  saidaDoOrganizadorSchema,
  type Decisao,
  type EtapaDoFunil,
  type MensagemDaConversa,
} from "./decidir";

/**
 * Uma passada do Organizador sobre UM negócio: lê a conversa, pergunta ao modelo
 * em que etapa o card deveria estar (uma chamada, sem ferramentas, sem canal) e
 * aplica pelo MESMO `moveLeadHandler` do board, do lote e do agente, que já
 * cobra campos obrigatórios, motivo de perda e funil.
 *
 * `dryRun` registra a decisão em `organizador_passadas` e NÃO move: é como se
 * confere uma amostra antes de liberar o lote.
 */
export interface Logger {
  info: (msg: string, f?: Record<string, unknown>) => void;
  warn: (msg: string, f?: Record<string, unknown>) => void;
}

export interface ResultadoDaPassada {
  leadId: string;
  decisao: Decisao | { mover: false; porque: string };
  aplicado: boolean;
  justificativa?: string;
}

const MENSAGENS_LIDAS = 40;

export async function organizaLead(
  pool: pg.Pool,
  cfg: { llm: LlmEdgeConfig; crm: CrmEdgeConfig },
  input: { organizationId: string; leadId: string; dryRun: boolean },
  log: Logger,
): Promise<ResultadoDaPassada> {
  const { organizationId, leadId, dryRun } = input;
  const grava = async (decisao: Record<string, unknown>, ultimaMsg: string | null) => {
    await pool.query(
      `insert into organizador_passadas (lead_id, organization_id, ultima_msg_em, passou_em, decisao)
       values ($1, $2, $3, now(), $4::jsonb)
       on conflict (lead_id) do update
         set ultima_msg_em = excluded.ultima_msg_em, passou_em = now(), decisao = excluded.decisao`,
      [leadId, organizationId, ultimaMsg, JSON.stringify({ ...decisao, dry_run: dryRun })],
    );
  };

  const { rows: leads } = await pool.query<{
    contact_id: string;
    pipeline_id: string;
    stage_id: string;
    settings: unknown;
  }>(
    `select l.contact_id, l.pipeline_id, l.stage_id, p.settings
       from crm_leads l join crm_pipelines p on p.id = l.pipeline_id
      where l.id = $1 and l.organization_id = $2 and l.status = 'open'`,
    [leadId, organizationId],
  );
  const lead = leads[0];
  if (!lead) return { leadId, decisao: { mover: false, porque: "lead_nao_aberto" }, aplicado: false };

  const { rows: historicoDesc } = await pool.query<MensagemDaConversa>(
    `select m.direction, m.body, m.sent_at::text as sent_at
       from messages m
      where m.organization_id = $1
        and m.conversation_id = (select c.id from conversations c
                                  where c.organization_id = $1 and c.contact_id = $2
                                  order by c.last_message_at desc nulls last limit 1)
        and m.direction in ('inbound', 'outbound')
      order by m.sent_at desc limit ${MENSAGENS_LIDAS}`,
    [organizationId, lead.contact_id],
  );
  const historico = historicoDesc.reverse();
  const ultimaMsg = historico.length > 0 ? historico[historico.length - 1]?.sent_at ?? null : null;
  if (historico.every((m) => (m.body ?? "").trim() === "")) {
    await grava({ mover: false, porque: "sem_conversa" }, ultimaMsg);
    return { leadId, decisao: { mover: false, porque: "sem_conversa" }, aplicado: false };
  }

  const { rows: etapas } = await pool.query<EtapaDoFunil>(
    `select id, name, position, is_won, is_lost, is_archived from crm_stages where pipeline_id = $1`,
    [lead.pipeline_id],
  );
  const motivos = vocabularioDeMotivos(lead.settings);
  const { system, user } = montaPrompt({ etapas, atualId: lead.stage_id, historico, motivos });

  const chamada = await runModelCall(
    pool,
    cfg.llm,
    { tenantId: organizationId, purpose: "organizador", system, messages: [{ role: "user", content: user }] },
    { log: log as never },
  );
  const bruto = extrairObjetoJsonDoTexto(chamada.result.text);
  const saida = saidaDoOrganizadorSchema.safeParse(bruto);
  if (!saida.success) {
    // Saída ilegível não vira movimento: registra e segue; a próxima passada reler.
    await grava({ mover: false, porque: "saida_ilegivel" }, null);
    return { leadId, decisao: { mover: false, porque: "saida_ilegivel" }, aplicado: false };
  }

  const decisao = decide(saida.data, etapas, lead.stage_id, motivos);
  let aplicado = false;
  let recusa: string | undefined;
  if (decisao.mover && !dryRun) {
    try {
      await moveLeadHandler(
        cfg.crm.supabase,
        {
          organization_id: organizationId,
          actor: { type: "webhook_source", id: "organizador" },
          requestId: `organizador:${leadId}`,
        },
        leadId,
        {
          to_stage_id: decisao.etapa.id,
          reason: `Movido pelo organizador: ${decisao.justificativa}`,
          ...(decisao.lostReason !== undefined ? { lost_reason: decisao.lostReason } : {}),
        },
      );
      aplicado = true;
    } catch (err) {
      // A régua do funil (campo obrigatório, reabertura…) venceu: vira rótulo, não incidente.
      recusa = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    }
  }
  await grava(
    {
      mover: decisao.mover,
      para: decisao.mover ? decisao.etapa.name : null,
      porque: decisao.mover ? undefined : decisao.porque,
      lost_reason: decisao.mover ? decisao.lostReason : undefined,
      justificativa: saida.data.justificativa,
      aplicado,
      recusa_do_funil: recusa,
    },
    ultimaMsg,
  );
  log.info("organizador: passada", { lead_id: leadId, mover: decisao.mover, aplicado, dry_run: dryRun });
  return { leadId, decisao, aplicado, justificativa: saida.data.justificativa };
}

/**
 * Quem precisa de passada: lead aberto de funil ligado, com conversa que teve
 * mensagem depois da última passada, e parada há `quietoMin` minutos (a conversa
 * assentou), dentro da janela `janelaDias`. O mais antigo primeiro, `limite` por vez.
 */
export async function leadsParaOrganizar(
  pool: pg.Pool,
  input: { organizationId: string; pipelineIds: string[]; janelaDias: number; quietoMin: number; limite: number },
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select l.id
       from crm_leads l
       join lateral (select max(m.sent_at) as ultima
                       from messages m join conversations c on c.id = m.conversation_id
                      where c.organization_id = l.organization_id and c.contact_id = l.contact_id
                        and m.direction in ('inbound', 'outbound')) u on true
       left join organizador_passadas p on p.lead_id = l.id
      where l.organization_id = $1 and l.status = 'open' and l.pipeline_id = any($2::uuid[])
        and u.ultima is not null
        and u.ultima > now() - make_interval(days => $3)
        and u.ultima < now() - make_interval(mins => $4)
        and (p.ultima_msg_em is null or u.ultima > p.ultima_msg_em)
      order by u.ultima asc limit $5`,
    [input.organizationId, input.pipelineIds, input.janelaDias, input.quietoMin, input.limite],
  );
  return rows.map((r) => r.id);
}

/** Um tick: cada org ligada em `settings.organizador` ({ligado, pipeline_ids, dry_run}). */
export async function tickDoOrganizador(
  pool: pg.Pool,
  cfg: { llm: LlmEdgeConfig; crm: CrmEdgeConfig },
  log: Logger,
  limitePorOrg = 15,
): Promise<void> {
  const { rows: orgs } = await pool.query<{ id: string; organizador: { pipeline_ids?: string[]; dry_run?: boolean; janela_dias?: number } }>(
    `select id, settings->'organizador' as organizador from organizations
      where status = 'active' and settings->'organizador'->>'ligado' = 'true'`,
  );
  for (const org of orgs) {
    const pipelineIds = org.organizador.pipeline_ids ?? [];
    if (pipelineIds.length === 0) continue;
    const ids = await leadsParaOrganizar(pool, {
      organizationId: org.id,
      pipelineIds,
      janelaDias: org.organizador.janela_dias ?? 7,
      quietoMin: 5,
      limite: limitePorOrg,
    });
    for (const leadId of ids) {
      try {
        await organizaLead(pool, cfg, { organizationId: org.id, leadId, dryRun: org.organizador.dry_run === true }, log);
      } catch (err) {
        log.warn("organizador: passada falhou", { lead_id: leadId, error: (err instanceof Error ? err.message : String(err)).slice(0, 160) });
      }
    }
  }
}

export async function runOrganizadorLoop(
  pool: pg.Pool,
  cfg: { llm: LlmEdgeConfig; crm: CrmEdgeConfig },
  opts: { intervalMs: number },
  log: Logger,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await tickDoOrganizador(pool, cfg, log);
    } catch (err) {
      log.warn("organizador: tick falhou", { error: (err instanceof Error ? err.message : String(err)).slice(0, 160) });
    }
    await new Promise<void>((r) => {
      const t = setTimeout(r, opts.intervalMs);
      signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
    });
  }
}
