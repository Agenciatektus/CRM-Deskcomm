/**
 * `crm_join_waitlist`: registra o interesse de um cliente num horário que está ocupado.
 *
 * Só anota na fila (`calendar_waitlist`); quem oferece a vaga é a recepção. Uma espera viva por
 * cliente e serviço: repetir a chamada devolve a que já existe em vez de duplicar.
 */
import { z } from "zod";

import type { McpToolDefinition } from "@/lib/mcp/types";

const shape = {
  contact_id: z.string().uuid().optional(),
  event_type_slug: z.string().min(1).max(100).optional(),
  owner_user_id: z.string().uuid().optional(),
  desired_window: z.string().min(1).max(300).optional(),
  notes: z.string().min(1).max(1000).optional(),
};

const SEM_CLIENTE = {
  permitido: false,
  motivo: "cliente_nao_encontrado",
  mensagem: "informe o contact_id de um cliente que exista nesta organização.",
} as const;

export const crmJoinWaitlist: McpToolDefinition<typeof shape> = {
  name: "crm_join_waitlist",
  description:
    "Coloca o cliente na fila de espera quando o horário que ele quer está ocupado e nada serve. " +
    "Use DEPOIS de `crm_find_free_slots` não ter horário que a pessoa aceite, e só com o consentimento " +
    "dela. `event_type_slug` vem de `crm_list_event_types`; `desired_window` é o que ela pediu, em " +
    "texto livre (sábado de manhã, qualquer dia depois das 18h); `owner_user_id` só se ela quer " +
    "uma profissional específica. Isto NÃO reserva horário nem promete vaga: diga que a equipe avisa " +
    "se algo abrir. Se ela já estiver na fila para esse serviço, a chamada devolve a espera existente. " +
    "Em notes, só o que a cliente disse. Em conversa de atendimento o cliente é sempre o desta conversa.",
  inputSchema: shape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const doTurno = ctx.contatoDoTurno;
    if (doTurno && input.contact_id !== undefined && input.contact_id !== doTurno) {
      return {
        permitido: false,
        motivo: "fora_da_conversa",
        mensagem:
          "esta conversa é com outra pessoa — a fila de espera de quem não é este cliente não é sua " +
          "para mexer; siga a conversa com quem está falando.",
      };
    }
    const contactId = doTurno ?? input.contact_id;
    if (!contactId) return SEM_CLIENTE;

    const { data: contato, error: eContato } = await ctx.supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("id", contactId)
      .maybeSingle();
    if (eContato) throw new Error(eContato.message);
    if (!contato) return SEM_CLIENTE;

    let eventTypeId: string | null = null;
    if (input.event_type_slug) {
      const { data: tipo, error: eTipo } = await ctx.supabase
        .from("calendar_event_types")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("slug", input.event_type_slug)
        .maybeSingle();
      if (eTipo) throw new Error(eTipo.message);
      if (!tipo) {
        return {
          registrada: false,
          motivo: "atendimento_nao_encontrado",
          mensagem: "não existe atendimento com esse slug; confira a lista em `crm_list_event_types`.",
        };
      }
      eventTypeId = (tipo as { id: string }).id;
    }

    if (input.owner_user_id) {
      const { data: dono, error: eDono } = await ctx.supabase
        .from("user_organizations")
        .select("user_id")
        .eq("organization_id", ctx.organizationId)
        .eq("user_id", input.owner_user_id)
        .is("revoked_at", null)
        .maybeSingle();
      if (eDono) throw new Error(eDono.message);
      if (!dono) {
        return {
          registrada: false,
          motivo: "profissional_nao_encontrada",
          mensagem: "não existe profissional com esse identificador nesta organização; deixe em branco para qualquer uma.",
        };
      }
    }

    const buscaViva = async () => {
      const base = ctx.supabase
        .from("calendar_waitlist")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("contact_id", contactId)
        .in("status", ["open", "offered"]);
      const r = await (eventTypeId ? base.eq("event_type_id", eventTypeId) : base.is("event_type_id", null))
        .limit(1)
        .maybeSingle();
      if (r.error) throw new Error(r.error.message);
      return r.data as { id: string } | null;
    };
    const existente = await buscaViva();
    if (existente) return { registrada: true, ja_estava_na_fila: true, espera_id: existente.id };

    const { data, error } = await ctx.supabase
      .from("calendar_waitlist")
      .insert({
        organization_id: ctx.organizationId,
        contact_id: contactId,
        event_type_id: eventTypeId,
        owner_user_id: input.owner_user_id ?? null,
        desired_window: input.desired_window ?? null,
        notes: input.notes ?? null,
        status: "open",
        created_by_kind: "ai",
      })
      .select("id")
      .single();
    if (error) {
      // 23505: outra chamada entrou primeiro (índice único da espera viva); devolve a que ficou.
      if ((error as { code?: string }).code === "23505") {
        const viva = await buscaViva();
        if (viva) return { registrada: true, ja_estava_na_fila: true, espera_id: viva.id };
      }
      throw new Error(error.message);
    }
    return { registrada: true, ja_estava_na_fila: false, espera_id: (data as { id: string }).id };
  },
};
