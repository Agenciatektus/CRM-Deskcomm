/**
 * O AVISO NA HORA DA TAREFA (migration 9043, decisão do Peterson em 06/10/2026).
 *
 * O "Próximo passo" do painel do lead virou tarefa (`crm_tasks`, com prazo e
 * responsável) e nada lia `due_date`: o prazo vencia em silêncio. Esta rodada,
 * chamada a cada minuto pelo cron `task-due-reminder`, avisa o RESPONSÁVEL
 * pelos dois canais que o CRM já tem para falar com a equipe:
 *
 *   - o sino (Central de avisos, `agent_inbox_items` kind `task_due`), com o
 *     botão levando à conversa do contato, senão ao negócio, senão ao contato;
 *   - o push do navegador, SÓ para o responsável (`enviarPushAoUsuario`, o
 *     mesmo de "Nova tarefa" em `criar-tarefa.ts`). `task_due` não está em
 *     `somDoAviso`, então o `central.aviso_criado` (0442) não o espalha para a
 *     organização inteira.
 *
 * Nunca fala com o cliente: tarefa é trabalho interno (o lembrete da Agenda,
 * `app/api/v1/cron/agenda-reminder`, é que manda WhatsApp ao contato).
 *
 * ═══ CONCORRÊNCIA E IDEMPOTÊNCIA ═══
 *
 * Cada tarefa é REIVINDICADA antes de qualquer efeito, com um UPDATE
 * condicional (`reminded_at is null` no filtro, `returning id`). Duas réplicas
 * do cron na mesma batida disputam a mesma linha e só uma recebe a linha de
 * volta — o mesmo efeito de `for update skip locked`, sem RPC nova. O carimbo é
 * da TENTATIVA, como na Agenda: se o push falhar, a tarefa não apita a cada
 * minuto. Reagendar (PATCH com `due_date`) zera o carimbo.
 *
 * ═══ AS DECISÕES ═══
 *
 * - **Janela de 24h.** Só avisa prazo vencido há até 24h. No primeiro deploy
 *   toda tarefa tem `reminded_at` nula; sem o corte, o time inteiro receberia
 *   de uma vez o push de cada tarefa atrasada da história.
 * - **Sem responsável, avisa quem criou.** Quem marcou um prazo numa tarefa sem
 *   dono ainda espera ser lembrado; silêncio seria a promessa quebrada que esta
 *   feature existe para consertar. Sem responsável E sem criador (tarefa de
 *   automação órfã), a tarefa nem entra na varredura.
 * - **Ex-membro não recebe.** O destinatário precisa ter vínculo ativo com a
 *   organização da TAREFA; senão a tarefa é carimbada e pulada.
 * - **O sino é da organização; só o push é do responsável.** A Central de
 *   avisos não tem destinatário: o aviso `task_due` aparece para todo mundo da
 *   organização que vê a Central (por isso o corpo nomeia o responsável). O
 *   que é exclusivo de quem precisa agir é o push.
 * - **Pouco dado do cliente.** O push (tela bloqueada) leva só o título que a
 *   equipe escreveu. A Central leva também o nome do contato, nunca o telefone
 *   (`nomeDoContato` devolve nulo em vez de cair no número).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { REFERENCIAS_DE_AVISO } from "@/lib/ai/inbox-destino";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma, type Idioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";
import { truncar, type PushPayload } from "@/lib/notifications/push_payload";

/** Tarefas avisadas por rodada. A rodada é de minuto em minuto. */
export const LIMITE_DA_RODADA = 200;
/** Prazo vencido há mais que isto não gera aviso (ver "Janela de 24h"). */
export const JANELA_MS = 24 * 60 * 60_000;
export const SITUACOES_ABERTAS = ["pending", "in_progress"] as const;

export interface TarefaAAvisar {
  id: string;
  organization_id: string;
  title: string;
  due_date: string;
  lead_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
}

export type EnviarPush = (org: string, userId: string, payload: PushPayload) => Promise<{ sent: number }>;

export interface ResultadoDaRodada {
  examinadas: number;
  avisadas: number;
  pulados: Record<string, number>;
}

type Destino = { ref_kind: "conversation" | "lead" | "contact"; ref_id: string; href: string } | null;

/** O texto do aviso, no idioma da organização (ninguém está logado no cron). */
export function textoDoAviso(input: {
  titulo: string;
  responsavel: string | null;
  contato: string | null;
  idioma: Idioma;
}): { title: string; body: string | null; push: { title: string; body: string } } {
  const t = (texto: string) => traduzir(texto, input.idioma);
  const partes = [
    input.responsavel ? `${t("Responsável")}: ${input.responsavel}.` : null,
    input.contato ? `${t("Contato")}: ${input.contato}.` : null,
  ].filter((p): p is string => p !== null);
  return {
    title: `${t("Hora da tarefa:")} ${input.titulo}`,
    body: partes.length > 0 ? partes.join(" ") : null,
    push: { title: t("Hora da tarefa"), body: truncar(input.titulo) },
  };
}

async function destinoDaTarefa(db: SupabaseClient, tarefa: TarefaAAvisar): Promise<Destino> {
  const org = tarefa.organization_id;
  if (tarefa.contact_id) {
    const { data: conversa } = await db
      .from("conversations")
      .select("id")
      .eq("organization_id", org)
      .eq("contact_id", tarefa.contact_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const id = (conversa as { id?: string } | null)?.id;
    if (id) return { ref_kind: "conversation", ref_id: id, href: REFERENCIAS_DE_AVISO.conversation.href(id) };
  }
  if (tarefa.lead_id) {
    const { data: lead } = await db
      .from("crm_leads")
      .select("id, pipeline_id")
      .eq("organization_id", org)
      .eq("id", tarefa.lead_id)
      .maybeSingle();
    const pipelineId = (lead as { pipeline_id?: string | null } | null)?.pipeline_id;
    if (lead && pipelineId) {
      return { ref_kind: "lead", ref_id: tarefa.lead_id, href: REFERENCIAS_DE_AVISO.lead.href(tarefa.lead_id, pipelineId) };
    }
  }
  if (tarefa.contact_id) {
    return { ref_kind: "contact", ref_id: tarefa.contact_id, href: REFERENCIAS_DE_AVISO.contact.href(tarefa.contact_id) };
  }
  return null;
}

async function nomeDoMembro(db: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    const nome = data?.user?.user_metadata?.full_name;
    return typeof nome === "string" && nome.trim() ? nome.trim() : null;
  } catch {
    return null;
  }
}

/** Uma tarefa já reivindicada: confere o destinatário, abre o aviso, manda o push. */
async function avisarUma(
  db: SupabaseClient,
  enviarPush: EnviarPush,
  tarefa: TarefaAAvisar,
  idiomaDe: (org: string) => Promise<Idioma>,
): Promise<string | null> {
  const org = tarefa.organization_id;
  const alvo = tarefa.assigned_to ?? tarefa.created_by;
  if (!alvo) return "sem_destinatario";

  const { data: vinculo } = await db
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", org)
    .eq("user_id", alvo)
    .is("revoked_at", null)
    .maybeSingle();
  if (!vinculo) return "destinatario_fora_da_org";

  const { data: contato } = tarefa.contact_id
    ? await db
        .from("contacts")
        .select("name, display_name")
        .eq("organization_id", org)
        .eq("id", tarefa.contact_id)
        .maybeSingle()
    : { data: null };

  const destino = await destinoDaTarefa(db, tarefa);
  const texto = textoDoAviso({
    titulo: tarefa.title,
    responsavel: await nomeDoMembro(db, alvo),
    contato: nomeDoContato(contato as { name?: string | null; display_name?: string | null } | null),
    idioma: await idiomaDe(org),
  });

  const { error } = await db.from("agent_inbox_items").insert({
    organization_id: org,
    kind: "task_due",
    severity: "warn",
    title: texto.title,
    body: texto.body,
    ref_kind: destino?.ref_kind ?? null,
    ref_id: destino?.ref_id ?? null,
  });
  if (error) {
    logger.warn("task_due_inbox_insert_failed", { organization_id: org, task_id: tarefa.id, error: error.message });
    return "falha_no_aviso";
  }

  // O aviso já está no sino: perder o push não desfaz nem repete nada.
  try {
    await enviarPush(org, alvo, { ...texto.push, tag: `task-due:${tarefa.id}`, href: destino?.href ?? "/app/tasks" });
  } catch (err) {
    logger.warn("task_due_push_failed", {
      organization_id: org,
      task_id: tarefa.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}

/** A rodada inteira. `agora` injetável para o teste não depender do relógio. */
export async function avisarTarefasNaHora(
  db: SupabaseClient,
  enviarPush: EnviarPush,
  agora: Date = new Date(),
): Promise<ResultadoDaRodada> {
  const { data, error } = await db
    .from("crm_tasks")
    .select("id, organization_id, title, due_date, lead_id, contact_id, assigned_to, created_by")
    .in("status", [...SITUACOES_ABERTAS])
    .is("reminded_at", null)
    .lte("due_date", agora.toISOString())
    .gt("due_date", new Date(agora.getTime() - JANELA_MS).toISOString())
    .or("assigned_to.not.is.null,created_by.not.is.null")
    .order("due_date", { ascending: true })
    .limit(LIMITE_DA_RODADA);
  if (error) throw new Error(`consulta das tarefas falhou: ${error.message}`);

  const tarefas = (data ?? []) as TarefaAAvisar[];
  const pulados: Record<string, number> = {};
  const pular = (motivo: string) => (pulados[motivo] = (pulados[motivo] ?? 0) + 1);
  const idiomas = new Map<string, Promise<Idioma>>();
  const idiomaDe = (org: string) => {
    if (!idiomas.has(org)) {
      idiomas.set(
        org,
        Promise.resolve(db.from("organizations").select("locale").eq("id", org).maybeSingle()).then(({ data: o }) =>
          normalizarIdioma((o as { locale?: string | null } | null)?.locale ?? null),
        ),
      );
    }
    return idiomas.get(org)!;
  };

  let avisadas = 0;
  for (const tarefa of tarefas) {
    // A REIVINDICAÇÃO: só quem recebe a linha de volta avisa.
    const { data: minha } = await db
      .from("crm_tasks")
      .update({ reminded_at: agora.toISOString() })
      .eq("id", tarefa.id)
      .eq("organization_id", tarefa.organization_id)
      .is("reminded_at", null)
      .in("status", [...SITUACOES_ABERTAS])
      .select("id");
    if (!minha || minha.length === 0) {
      pular("ja_reivindicada");
      continue;
    }
    try {
      const motivo = await avisarUma(db, enviarPush, tarefa, idiomaDe);
      if (motivo) pular(motivo);
      else avisadas += 1;
    } catch {
      pular("erro_no_aviso");
    }
  }
  return { examinadas: tarefas.length, avisadas, pulados };
}
