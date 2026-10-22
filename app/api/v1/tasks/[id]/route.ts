import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH  /api/v1/tasks/[id] — edita uma tarefa.
 * DELETE /api/v1/tasks/[id] — apaga uma tarefa.
 *
 * Extraído do PR #418 (@clinicacentrodosorrisosc-code), sem o fallback para
 * `custom_fields.tasks` — o motivo inteiro está no cabeçalho de
 * `app/api/v1/tasks/route.ts`.
 *
 * ⚠️ O `.eq("organization_id", ...)` não é decoração: sem ele o PATCH casaria
 * 0 linhas numa tarefa de outra organização e o PostgREST devolveria `PGRST116`
 * — que esta rota já traduz para 404, o desfecho certo. Mantê-lo explícito é a
 * regra do CLAUDE.md e o que segura o dia em que alguém trocar o client.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { registraAtividadeDaTarefa } from "@/lib/tarefas/atividade";
import { COLUNAS_DA_TAREFA } from "@/lib/tarefas/colunas";
import { recusaDeVinculoDaTarefa } from "@/lib/tarefas/vinculos-da-tarefa";
import { prazoNoPassado } from "@/lib/tarefas/prazo-no-passado";
import { conferirDemanda } from "@/lib/tarefas/demanda";
import { conferirResponsavel } from "@/lib/tarefas/responsavel";
import { PRIORIDADES_DA_TAREFA, SITUACOES_DA_TAREFA, type Tarefa } from "@/lib/tarefas/tipos";

export const dynamic = "force-dynamic";

/** As colunas que a tela lê — a lista e o porquê dos embutidos em `lib/tarefas/colunas.ts`. */
const COLUNAS = COLUNAS_DA_TAREFA;

const edicaoSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    due_date: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(PRIORIDADES_DA_TAREFA).optional(),
    status: z.enum(SITUACOES_DA_TAREFA).optional(),
    lead_id: z.string().uuid().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    /** Vincular (`<uuid>`) e desvincular (`null`) a demanda do atendimento (#2818). */
    demanda_id: z.string().uuid().nullable().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  // PATCH vazio gravaria só o `updated_at` e devolveria 200: a tela diria
  // "salvo" sobre uma edição que não existiu.
  .refine((v) => Object.keys(v).length > 0, { message: "Nada para alterar." });

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: Contexto): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "crm_tasks" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = edicaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  if (parsed.data.assigned_to) {
    // A chave estrangeira de `assigned_to` é só para `auth.users`: sem esta conferência, um id de
    // outra organização (ou de quem saiu da equipe) gravaria sem erro. A régua
    // e o porquê do admin client estão em `lib/tarefas/responsavel.ts`.
    const equipe = isServiceRoleConfigured() ? createAdminClient() : await createClient();
    const veredito = await conferirResponsavel(equipe, authz.org.orgId, parsed.data.assigned_to);
    if (veredito === "falha_na_consulta") {
      return fail("internal_error", t("Erro ao salvar a tarefa."), 500, { requestId });
    }
    if (veredito === "fora_da_equipe") {
      return fail("validation_failed", t("O responsável escolhido não faz parte da equipe."), 422, {
        requestId,
        // O mesmo contrato das outras recusas de vínculo: a tela sabe QUAL campo marcar.
        details: { campo: "assigned_to" },
      });
    }
  }

  const supabase = await createClient();

  // Vínculo trocado no PATCH passa pela MESMA régua da criação: a FK não passa
  // por RLS, e sem isto bastava editar a tarefa para apontá-la a outra org.
  const recusa = await recusaDeVinculoDaTarefa(supabase, authz.org.orgId, parsed.data, t);
  if (recusa) {
    return fail("validation_failed", recusa.mensagem, 422, { requestId, details: { campo: recusa.campo } });
  }

  if (parsed.data.demanda_id) {
    // A chave estrangeira não passa pela RLS: sem esta conferência, a demanda
    // de outra organização gravaria sem erro. A régua está em `lib/tarefas/demanda.ts`.
    const veredito = await conferirDemanda(supabase, authz.org.orgId, parsed.data.demanda_id);
    if (veredito === "falha_na_consulta") {
      return fail("internal_error", t("Erro ao salvar a tarefa."), 500, { requestId });
    }
    if (veredito === "fora_da_organizacao") {
      return fail("validation_failed", t("O negócio, o contato ou a demanda vinculada não existe."), 422, {
        requestId,
      });
    }
    if (veredito === "encerrada") {
      return fail("state_conflict", t("Esta demanda já foi encerrada. Crie a tarefa numa demanda em andamento."), 409, {
        requestId,
      });
    }
  }

  // A situação ANTES da edição decide se esta é a vez em que a tarefa fechou.
  // Sem ler antes, marcar "concluída" duas vezes emitiria duas linhas na
  // timeline do negócio — e a segunda seria mentira.
  const { data: antes } = await supabase
    .from("crm_tasks")
    .select("status, due_date")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  // REAGENDAR RE-ARMA O AVISO (migration 9043): o cron `task-due-reminder`
  // só avisa tarefa com `reminded_at` nula. Sem zerar aqui, a tarefa que já
  // apitou uma vez ficaria muda no prazo novo. Só quando o prazo MUDOU de
  // fato (no minuto, ver abaixo; nulo↔valor conta): reenviar o mesmo
  // prazo num PATCH de título faria a tarefa já avisada apitar de novo.
  // `reminded_at` não está no schema do corpo: só esta linha o escreve, e só
  // para nulo.
  // Comparado no MINUTO: a tela trabalha em dia + hora:minuto, e a tarefa de
  // automação nasce com segundos e milissegundos (`criar-tarefa.ts`). Reenviar
  // o mesmo prazo visto na tela não é prazo novo, nem re-arma o aviso, nem cai
  // na recusa do passado (P1 do Cassio na #172).
  const instante = (v: string | null | undefined) => (v ? Math.floor(new Date(v).getTime() / 60_000) : null);
  const prazoMudou =
    "due_date" in parsed.data &&
    instante(parsed.data.due_date) !== instante((antes as { due_date?: string | null } | null)?.due_date);
  // Prazo novo no passado é recusado; reenviar o MESMO prazo (PATCH de título)
  // não, senão editar uma tarefa atrasada viraria impossível.
  const situacaoFinal = parsed.data.status ?? (antes as { status?: string } | null)?.status;
  if (prazoMudou && prazoNoPassado(parsed.data.due_date, situacaoFinal)) {
    return fail("validation_failed", t("O prazo da tarefa não pode estar no passado."), 422, {
      requestId,
      details: { campo: "due_date" },
    });
  }
  const mudancas = prazoMudou ? { ...parsed.data, reminded_at: null } : parsed.data;

  const { data, error } = await supabase
    .from("crm_tasks")
    .update(mudancas)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return fail("not_found", t("Tarefa não encontrada."), 404, { requestId });
    }
    // 23503 = uuid que não existe em organização nenhuma (outra org já foi
    // recusada acima, porque a FK aceitaria).
    if (error.code === "23503") {
      return fail("validation_failed", t("O negócio, o contato ou a demanda vinculada não existe."), 422, {
        requestId,
      });
    }
    return fail("internal_error", t("Erro ao salvar a tarefa."), 500, { requestId });
  }

  const tarefa = data as unknown as Tarefa;

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "crm_task.updated",
    resourceType: "crm_tasks",
    resourceId: tarefa.id,
    requestId,
    metadata: { campos: Object.keys(parsed.data) },
  });

  const fechouAgora =
    tarefa.status === "done" && (antes as { status?: string } | null)?.status !== "done";
  if (fechouAgora) {
    await registraAtividadeDaTarefa(supabase, {
      organizationId: authz.org.orgId,
      tarefa,
      tipo: "task_completed",
      actor: { type: "user", id: authz.user.id },
    });
  }

  return ok({ task: tarefa }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Contexto): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "crm_tasks" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const supabase = await createClient();
  // `.select()` no delete para saber se ALGUMA linha saiu. Sem isso, apagar uma
  // tarefa de outra organização devolveria 200 — e a tela sumiria com a linha
  // do próprio usuário na próxima recarga, sem que nada tivesse sido apagado.
  const { data, error } = await supabase
    .from("crm_tasks")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id");

  if (error) {
    return fail("internal_error", t("Erro ao apagar a tarefa."), 500, { requestId });
  }
  if (!data || data.length === 0) {
    return fail("not_found", t("Tarefa não encontrada."), 404, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "crm_task.deleted",
    resourceType: "crm_tasks",
    resourceId: id,
    requestId,
  });

  return ok({ deleted: true }, { requestId });
}
