/**
 * TODA AÇÃO DE AUTOMAÇÃO EXISTE NOS TRÊS LUGARES QUE A FAZEM FUNCIONAR.
 *
 * Uma ação é três coisas que moram em arquivos diferentes, e nada as amarrava:
 *
 *   1. o schema (`actionSchema` em `lib/schemas/webhooks.ts`) — sem ele, a
 *      REST recusa salvar a regra;
 *   2. o executor registrado (`lib/automation/actions/register-all.ts`) — sem
 *      ele, a regra SALVA, o evento acontece e a execução termina em
 *      `unknown_action`: o pior desfecho, porque a tela disse "salvo";
 *   3. o rótulo da tela (`ACTION_LABELS` em `app/app/webhooks/_components/labels.ts`)
 *      — sem ele, a ação não aparece no seletor do editor de regras.
 *
 * O compilador amarra rótulo ↔ formulário (`ActionItem`/`defaultActionConfig`
 * são exaustivos), mas não amarra schema ↔ executor ↔ rótulo: são três listas
 * de strings. Este teste as compara — acrescentou num, esqueceu noutro, reprova
 * com o nome da ação.
 *
 * Nasceu com `create_lead_in_pipeline` ("Criar card em outro funil").
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: vi.fn() }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));

import { ACTION_LABELS } from "@/app/app/webhooks/_components/labels";
import { getAction } from "@/lib/automation/actions";
import "@/lib/automation/actions/register-all";
import { actionSchema } from "@/lib/schemas/webhooks";

const doSchema = actionSchema.options.map((o) => o.shape.type.value as string).sort();
const daTela = Object.keys(ACTION_LABELS).sort();

describe("ação de automação: schema, executor e tela concordam", () => {
  it("a lista do schema não está vazia (o verde abaixo não é vacuidade)", () => {
    expect(doSchema.length).toBeGreaterThan(5);
    expect(doSchema).toContain("create_lead_in_pipeline");
  });

  it.each(doSchema)("%s tem executor registrado no motor", (tipo) => {
    expect(getAction(tipo), `${tipo}: falta import em lib/automation/actions/register-all.ts`).toBeDefined();
  });

  it("o seletor da tela oferece exatamente as ações que o schema aceita", () => {
    expect(daTela).toEqual(doSchema);
  });
});
