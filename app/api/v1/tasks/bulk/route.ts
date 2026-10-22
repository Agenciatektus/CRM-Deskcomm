import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/tasks/bulk — ações em massa da tela de Tarefas: concluir,
 * adiar, reatribuir, mudar a prioridade e apagar. Discriminado por `action`
 * (`lib/tarefas/lote.ts`), até 50 tarefas por chamada.
 *
 * A AUTORIZAÇÃO é a MESMA das rotas de uma tarefa (`tasks/[id]`), item por
 * item, e não uma régua nova:
 *  - suporte temporário somente-leitura é recusado antes do efeito
 *    (`requireSupportWrite`);
 *  - papel `agent` ou acima (`requireRole`, que já cobra o 2º fator quando a
 *    política da organização ou o fator cadastrado o exigem);
 *  - a organização é a do COOKIE (`authz.org`), nunca do corpo; toda leitura e
 *    escrita filtra por ela à mão, além da RLS;
 *  - responsável novo passa por `conferirResponsavel` (membro ativo, acima de
 *    `viewer`), com o mesmo admin client filtrado pela org da sessão;
 *  - prazo novo no passado é recusado (`prazoNoPassado`), e prazo que muda
 *    re-arma o aviso (`reminded_at = null`), como no PATCH.
 *
 * Id de outra organização (ou que a policy não deixa a pessoa alcançar) não
 * dá erro: volta em `ignoradas`, sem dizer se existe. O que conta como feito é
 * o que o banco DEVOLVEU da escrita (`.select("id")`), não o que foi pedido.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { registraAtividadeDaTarefa } from "@/lib/tarefas/atividade";
import { idsDoLote, loteDeTarefasSchema, type ResultadoDoLoteDeTarefas } from "@/lib/tarefas/lote";
import { prazoNoPassado } from "@/lib/tarefas/prazo-no-passado";
import { conferirResponsavel } from "@/lib/tarefas/responsavel";
import { estaEncerrada, type Tarefa } from "@/lib/tarefas/tipos";

export const dynamic = "force-dynamic";

type Alvo = Pick<Tarefa, "id" | "title" | "status" | "due_date" | "priority" | "lead_id" | "contact_id">;

const instante = (v: string | null | undefined) => (v ? Math.floor(new Date(v).getTime() / 60_000) : null);

/**
 * 42501 = a policy de `crm_tasks` recusou a linha nova (o `WITH CHECK`): o
 * caso típico é um `agent` passar a tarefa para alguém e, com isso, perder o
 * direito de escrevê-la. É recusa de PERMISSÃO, não falha do servidor: 403
 * com o motivo, nunca 500.
 */
const RECUSA_DA_POLICY = "42501";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();

  const authz = await requireRole("agent", { requestId, resource: "crm_tasks" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const parsed = loteDeTarefasSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const lote = parsed.data;
  const pedidos = idsDoLote(lote);

  if (lote.action === "postpone" && lote.itens.some((i) => prazoNoPassado(i.due_date, "pending"))) {
    return fail("validation_failed", t("O prazo da tarefa não pode estar no passado."), 422, {
      requestId,
      details: { campo: "due_date" },
    });
  }

  if (lote.action === "assign" && lote.assigned_to) {
    // A régua e o porquê do admin client: `lib/tarefas/responsavel.ts`.
    const equipe = isServiceRoleConfigured() ? createAdminClient() : await createClient();
    const veredito = await conferirResponsavel(equipe, orgId, lote.assigned_to);
    if (veredito === "falha_na_consulta") {
      return fail("internal_error", t("Erro ao salvar a tarefa."), 500, { requestId });
    }
    if (veredito === "fora_da_equipe") {
      return fail("validation_failed", t("O responsável escolhido não faz parte da equipe."), 422, {
        requestId,
        details: { campo: "assigned_to" },
      });
    }
  }

  const supabase = await createClient();

  // O ESCOPO: quais dos ids pedidos são desta organização e visíveis a quem
  // pede. O resto não é tocado, e volta em `ignoradas`.
  const { data: achadas, error: erroDoEscopo } = await supabase
    .from("crm_tasks")
    .select("id, title, status, due_date, priority, lead_id, contact_id")
    .eq("organization_id", orgId)
    .in("id", pedidos);
  if (erroDoEscopo) {
    return fail("internal_error", t("Erro ao salvar a tarefa."), 500, { requestId });
  }
  const alvos = (achadas ?? []) as Alvo[];
  const porId = new Map(alvos.map((a) => [a.id, a]));
  const ignoradas = pedidos.filter((id) => !porId.has(id));

  let feitas: string[] = [];
  let campos: string[] = [];
  let acaoDeAuditoria: "crm_task.updated" | "crm_task.deleted" = "crm_task.updated";
  // A falha que interrompeu o lote no meio (adiar vai item a item): o que já
  // foi gravado AUDITA mesmo assim, antes da resposta de erro.
  let falha: Response | null = null;
  const recusa = (codigo: string | undefined, mensagemDeErro: string): Response =>
    codigo === RECUSA_DA_POLICY
      ? fail("forbidden", t("Você não tem permissão para fazer esta alteração em uma ou mais tarefas selecionadas."), 403, { requestId })
      : fail("internal_error", mensagemDeErro, 500, { requestId });

  if (lote.action === "delete") {
    acaoDeAuditoria = "crm_task.deleted";
    const ids = alvos.map((a) => a.id);
    if (ids.length > 0) {
      const { data, error } = await supabase.from("crm_tasks").delete().eq("organization_id", orgId).in("id", ids).select("id");
      if (error) return recusa(error.code, t("Erro ao apagar a tarefa."));
      feitas = (data ?? []).map((r: { id: string }) => r.id);
    }
  } else if (lote.action === "postpone") {
    campos = ["due_date"];
    // Encerrada não é adiada (é registro do que já aconteceu), e o MESMO prazo
    // no minuto não é prazo novo (não re-arma o aviso) — a régua do PATCH.
    for (const item of lote.itens) {
      const alvo = porId.get(item.id);
      if (!alvo || estaEncerrada(alvo) || instante(item.due_date) === instante(alvo.due_date)) continue;
      const { data, error } = await supabase
        .from("crm_tasks")
        .update({ due_date: item.due_date, reminded_at: null })
        .eq("organization_id", orgId)
        .eq("id", item.id)
        .select("id");
      if (error) {
        falha = recusa(error.code, t("Erro ao salvar a tarefa."));
        break;
      }
      feitas.push(...(data ?? []).map((r: { id: string }) => r.id));
    }
  } else {
    // complete / priority / assign: um UPDATE só, com o mesmo valor para todas.
    let mudanca: Record<string, unknown>;
    let ids = alvos.map((a) => a.id);
    if (lote.action === "complete") {
      mudanca = { status: "done" };
      // Só o que ainda pede ação fecha: concluir de novo a já concluída emitiria
      // outra "Tarefa concluída" na timeline, e a cancelada não vira feita.
      ids = alvos.filter((a) => !estaEncerrada(a)).map((a) => a.id);
    } else if (lote.action === "priority") {
      mudanca = { priority: lote.priority };
    } else {
      mudanca = { assigned_to: lote.assigned_to };
    }
    campos = Object.keys(mudanca);
    if (ids.length > 0) {
      const { data, error } = await supabase.from("crm_tasks").update(mudanca).eq("organization_id", orgId).in("id", ids).select("id");
      if (error) return recusa(error.code, t("Erro ao salvar a tarefa."));
      feitas = (data ?? []).map((r: { id: string }) => r.id);
    }
  }

  await Promise.all(
    feitas.map((id) =>
      audit({
        organizationId: orgId,
        actorUserId: authz.user.id,
        action: acaoDeAuditoria,
        resourceType: "crm_tasks",
        resourceId: id,
        requestId,
        metadata: { lote: lote.action, ...(campos.length ? { campos } : {}) },
      }),
    ),
  );

  if (falha) return falha;

  // O laço de retorno, como no PATCH: tarefa presa a um negócio que FECHOU
  // agora aparece na linha do tempo dele.
  if (lote.action === "complete") {
    for (const id of feitas) {
      const alvo = porId.get(id);
      if (!alvo) continue;
      await registraAtividadeDaTarefa(supabase, {
        organizationId: orgId,
        tarefa: alvo,
        tipo: "task_completed",
        actor: { type: "user", id: authz.user.id },
      });
    }
  }

  const resultado: ResultadoDoLoteDeTarefas = { feitas: feitas.length, ignoradas };
  return ok(resultado, { requestId });
}
