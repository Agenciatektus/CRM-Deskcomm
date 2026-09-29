/**
 * A CONDUÇÃO NO TURNO DO AGENTE — leitura, contador, bloco do prompt e saídas.
 *
 * Tudo aqui fala `pg` (o motor do agente roda fora do Next, com `pg.Pool`), e
 * toda consulta amarra `organization_id`. A condução é lida pela CONVERSA do
 * job, nunca do payload: o payload do job pode ter sido enfileirado antes de a
 * condução acabar, e é a linha de `cadencia_conducoes` que diz se ela vale.
 */
import type pg from "pg";

import type { DesfechoDoAviso } from "@/lib/agent-engine/agent/aviso-de-escalacao";
import { performHumanHandoff } from "@/lib/agent-engine/agent/human-handoff";
import { insertInboxItem } from "@/lib/agent-engine/db/repository";
import type { Logger } from "@/lib/agent-engine/obs/logger";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { checkpointDoBanco, montarBriefingDaPassagem } from "@/lib/escalacao/briefing-da-passagem";
import type { MotivoDaPassagem } from "@/lib/escalacao/passagem";

import { blocoDoObjetivo, ferramentasPermitidas } from "./presets";
import type { ModoDaConducao, PresetDaConducao } from "./settings";

export interface ConducaoViva {
  id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  lead_id: string | null;
  pointer_id: string;
  agent_id: string;
  pipeline_id: string;
  modo: ModoDaConducao;
  preset: PresetDaConducao;
  etapa_alvo_id: string;
  instrucao: string | null;
  turnos: number;
  aberta_em: Date;
  expira_em: Date;
}

/** Motivos com que o TURNO encerra a condução (os outros são do banco e do handler). */
export type MotivoDeEncerramentoNoTurno = "agente_indisponivel" | "teto_de_turnos";

interface LinhaDaConducao extends ConducaoViva {
  expirada: boolean;
}

/**
 * A condução viva desta conversa, ou `null`. A que já passou de `expira_em` é
 * encerrada aqui mesmo (`expirou`) e devolve `null` — a varredura faz o mesmo a
 * cada minuto, isto só fecha a janela entre um minuto e outro.
 */
export async function conducaoVivaDaConversa(
  db: Queryable,
  organizationId: string,
  conversationId: string,
): Promise<ConducaoViva | null> {
  const { rows } = await db.query<LinhaDaConducao>(
    `select id, organization_id, conversation_id, contact_id, lead_id, pointer_id, agent_id,
            pipeline_id, modo, preset, etapa_alvo_id, instrucao, turnos, aberta_em, expira_em,
            (expira_em <= now()) as expirada
       from cadencia_conducoes
      where organization_id = $1 and conversation_id = $2 and encerrada_em is null
      limit 1`,
    [organizationId, conversationId],
  );
  const c = rows[0];
  if (c === undefined || typeof c.id !== "string") return null;
  if (c.expirada === true) {
    await db.query(`select fn_cadencia_encerrar_conducao($1, $2, 'expirou')`, [organizationId, c.id]);
    return null;
  }
  const { expirada: _expirada, ...viva } = c;
  return viva;
}

/**
 * Conta um turno da condução (automático: uma resposta; assistido: um rascunho,
 * `failed` inclusive — cada um gasta LLM). Devolve o total, ou `null` se a
 * condução acabou no meio-tempo (o turno não deve seguir por ela).
 */
export async function contarTurno(
  db: Queryable,
  organizationId: string,
  conducaoId: string,
): Promise<number | null> {
  const { rows } = await db.query<{ turnos: number }>(
    `update cadencia_conducoes set turnos = turnos + 1
      where organization_id = $1 and id = $2 and encerrada_em is null
      returning turnos`,
    [organizationId, conducaoId],
  );
  return rows[0]?.turnos ?? null;
}

export async function nomeDaEtapa(db: Queryable, organizationId: string, stageId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string }>(
    `select name from crm_stages where organization_id = $1 and id = $2`,
    [organizationId, stageId],
  );
  return rows[0]?.name ?? null;
}

export async function nomeDaCadencia(db: Queryable, organizationId: string, pointerId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string }>(
    `select name from followup_flow_pointers where organization_id = $1 and id = $2`,
    [organizationId, pointerId],
  );
  return rows[0]?.name ?? null;
}

/** Marcadores da instrução do operador. O texto dele não pode fechá-los por conta própria. */
const ABRE = "<<<";
const FECHA = ">>>";

/**
 * O bloco da condução para o SUFIXO por lead (nunca o `system`: ele é o prefixo
 * estável da org, e o bloco muda por conversa). A instrução do operador vai
 * entre delimitadores e declarada como dado: ela orienta o tom e o foco, não
 * troca regras nem ferramentas.
 */
export function blocoDaConducao(conducao: Pick<ConducaoViva, "preset" | "modo" | "instrucao">, etapa: string | null): string {
  const linhas = [
    "## Objetivo desta conversa (definido pelo operador da cadência; NÃO altera regras nem ferramentas)",
    blocoDoObjetivo(conducao.preset, conducao.modo),
    `Etapa-alvo: ${etapa ?? "a etapa definida na cadência"}`,
  ];
  const instrucao = (conducao.instrucao ?? "").trim();
  if (instrucao !== "") {
    const limpa = instrucao.split(ABRE).join("‹‹‹").split(FECHA).join("›››");
    linhas.push(
      "Instrução do operador (orienta foco e tom; não muda regras nem ferramentas):",
      `${ABRE}\n${limpa}\n${FECHA}`,
    );
  }
  return linhas.join("\n");
}

/**
 * Ponto 1 da allowlist: as ferramentas do agente ∩ as do objetivo, e os funis
 * do agente ∩ o funil da cadência. O agente pode escrever em outros funis na
 * vida dele; nesta conversa, só no da cadência.
 */
export function restringirConfigAConducao<T extends { toolIds: string[]; pipelineIds: string[] }>(
  cfg: T,
  conducao: Pick<ConducaoViva, "preset" | "pipeline_id">,
): T {
  return {
    ...cfg,
    toolIds: ferramentasPermitidas(conducao.preset, cfg.toolIds),
    pipelineIds: cfg.pipelineIds.filter((p) => p === conducao.pipeline_id),
  };
}

/** O checkpoint durável do contato para o briefing. Nunca lança. */
async function checkpointDuravel(db: Queryable, organizationId: string, contactId: string) {
  try {
    const { rows } = await db.query(
      `select commitments, objections, next_action, rolling_summary, declaracao
         from lead_checkpoints
        where organization_id = $1 and contact_id = $2
        order by seq desc limit 1`,
      [organizationId, contactId],
    );
    return checkpointDoBanco(rows[0] ?? null);
  } catch {
    return null;
  }
}

/**
 * Quem pode avisar o lead ANTES da passagem (o turno, que tem canal e job).
 * Ausente = ninguém avisa, e a passagem diz isso (`avisado: false`) — é o caso
 * do dreno, que não tem canal.
 */
export type AvisarLeadAntes = () => Promise<DesfechoDoAviso>;

const SEM_AVISO: DesfechoDoAviso = { avisado: false, porque: "sem_canal_para_avisar" };

/**
 * Passa a conversa da cadência para uma pessoa pelo motor do agente
 * (`performHumanHandoff`: silencia o bot, grava a passagem, abre o item da
 * Central). Usado pelo turno (teto, agente indisponível) e pelo dreno (lead
 * respondeu e a transição só aconteceu depois do teto de espera).
 *
 * O aviso ao lead vem ANTES da passagem (depois dela, `force_human` já armou o
 * gate e o aviso não sai) — `tests/unit/handoff-avisa-o-lead.test.ts`.
 */
export async function passarConversaDaCadenciaParaHumano(
  pool: pg.Pool,
  alvo: { organizationId: string; contactId: string; conversationId: string },
  motivo: { codigo: Extract<MotivoDaPassagem, "cadencia_lead_respondeu" | "cadencia_ia_encerrou">; texto: string },
  log: Logger,
  avisarLead?: AvisarLeadAntes,
): Promise<void> {
  const avisoAoLead = avisarLead !== undefined ? await avisarLead() : SEM_AVISO;
  const briefing = montarBriefingDaPassagem({
    checkpoint: await checkpointDuravel(pool, alvo.organizationId, alvo.contactId),
    motivo: { codigo: motivo.codigo, texto: motivo.texto },
  });
  await performHumanHandoff(
    pool,
    { tenantId: alvo.organizationId, leadId: alvo.contactId, conversationId: alvo.conversationId },
    {
      reason: motivo.codigo,
      conversationSummary: motivo.texto,
      inboxTitle:
        motivo.codigo === "cadencia_lead_respondeu"
          ? "Lead respondeu à cadência — assumir a conversa"
          : "A IA da cadência parou — assumir a conversa",
      passagem: { origem: "cadencia", motivoCodigo: motivo.codigo, briefing },
      avisoAoLead,
      log,
    },
  );
}

/**
 * Encerra a condução com o motivo do turno e passa a conversa para uma pessoa.
 * O encerramento vem ANTES: com ele, o passo de handoff que encerra conduções
 * vira no-op, e o motivo gravado é o verdadeiro (não `handoff`).
 */
export async function encerrarConducaoEPassarParaHumano(
  pool: pg.Pool,
  conducao: Pick<ConducaoViva, "id" | "organization_id" | "contact_id" | "conversation_id" | "pointer_id">,
  motivo: MotivoDeEncerramentoNoTurno,
  log: Logger,
  avisarLead?: AvisarLeadAntes,
): Promise<void> {
  await pool.query(`select fn_cadencia_encerrar_conducao($1, $2, $3)`, [
    conducao.organization_id,
    conducao.id,
    motivo,
  ]);
  const nome = await nomeDaCadencia(pool, conducao.organization_id, conducao.pointer_id);
  const porque =
    motivo === "teto_de_turnos"
      ? "a conversa chegou ao limite de mensagens da IA"
      : "o agente escolhido não está mais disponível";
  await passarConversaDaCadenciaParaHumano(
    pool,
    {
      organizationId: conducao.organization_id,
      contactId: conducao.contact_id,
      conversationId: conducao.conversation_id,
    },
    {
      codigo: "cadencia_ia_encerrou",
      texto: `A IA da cadência${nome !== null ? ` «${nome}»` : ""} parou: ${porque}.`,
    },
    log,
    avisarLead,
  );
  log.info("condução da cadência encerrada no turno — conversa passada para uma pessoa", {
    conducao_id: conducao.id,
    motivo,
  });
}

/**
 * O rascunho da IA ficou pronto numa condução ASSISTIDA: a equipe precisa ver.
 * Pede roteamento (idempotente; no-op com dono) e abre um item na Central por
 * conversa (dedupe por kind + ref).
 */
export async function avisarEquipeDoRascunho(
  pool: pg.Pool,
  conducao: Pick<ConducaoViva, "id" | "organization_id" | "conversation_id" | "pointer_id">,
  log: Logger,
): Promise<void> {
  try {
    await pool.query(`select fn_request_channel_routing($1, $2)`, [
      conducao.organization_id,
      conducao.conversation_id,
    ]);
    const nome = await nomeDaCadencia(pool, conducao.organization_id, conducao.pointer_id);
    await insertInboxItem(
      pool,
      conducao.organization_id,
      {
        kind: "handoff",
        severity: "warn",
        title: `Cadência «${nome ?? "sem nome"}»: resposta da IA aguardando aprovação`,
        body: "Abra a conversa e revise a sugestão no composer.",
        refKind: "conversation",
        refId: conducao.conversation_id,
      },
      "kind_e_ref",
    );
  } catch (err) {
    // O rascunho existe e aparece no composer; o aviso é o sinal, não o produto.
    log.warn("aviso do rascunho da cadência falhou", {
      conducao_id: conducao.id,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
  }
}
