/**
 * O servidor recusa o gatilho por data apontado para um campo do CONTATO.
 *
 * A varredura `app/api/v1/cron/lead-date-field-due` lê `crm_leads.custom_fields`;
 * o valor de um campo de escopo `contato` (#2791) mora em `contacts.custom_fields`.
 * Uma regra assim seria salva e nunca dispararia, sem erro e sem log. O seletor
 * da tela já não oferece o campo (`camposDeDataDoNegocio`); esta é a mesma regra
 * pela porta da API e da regra antiga regravada.
 */
import { z } from "zod";

import { configDoGatilhoDeData, GATILHO_DE_DATA_DO_FUNIL } from "@/lib/automation/gatilho-de-data-do-funil";
import { campoEhDoContato } from "@/lib/leads/campos-do-funil";
import type { createClient } from "@/lib/supabase/server";

export const MENSAGEM_CAMPO_DE_DATA_DO_CONTATO =
  "Este campo de data é do contato, e o gatilho por data só lê campos do negócio. Escolha um campo de data do negócio.";

/**
 * `{ doContato: true }` quando a regra é do gatilho por data e a chave está
 * declarada no funil como campo do contato. Erro de banco sobe como `{ erro }`.
 */
export async function campoDoGatilhoDeDataEhDoContato(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  triggerEvent: string,
  triggerConfig: unknown,
): Promise<{ erro: string } | { doContato: boolean }> {
  if (triggerEvent !== GATILHO_DE_DATA_DO_FUNIL) return { doContato: false };
  const config = configDoGatilhoDeData(triggerConfig);
  // ponytail: funil que não é uuid não casa com negócio nenhum; recusar isso é outra regra.
  if (!config || !z.uuid().safeParse(config.pipeline_id).success) return { doContato: false };

  const { data, error } = await supabase
    .from("crm_pipelines")
    .select("settings")
    .eq("id", config.pipeline_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return { erro: error.message };

  const settings = (data?.settings ?? null) as Record<string, unknown> | null;
  return { doContato: campoEhDoContato(settings, config.campo) };
}
