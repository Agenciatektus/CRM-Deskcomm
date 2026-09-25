import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Kanban } from "@/lib/ui/icons";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_FUNIL } from "@/app/api/v1/pipelines/_funis";
import { FunisClient, type FunilDaLista } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Funis" };

/**
 * A lista de funis — e o lugar onde eles se gerenciam.
 *
 * ⚠️ O FILTRO DE `organization_id` NÃO É REDUNDANTE COM A RLS, e a falta dele era
 * um bug visível: a policy `crm_pipelines_select` libera TODAS as organizações do
 * usuário (`organization_id in fn_user_org_ids()`) e libera tudo para
 * `fn_is_platform_admin()`. Quem participa de duas organizações via as duas
 * listas misturadas — e como o gatilho `trg_seed_default_pipeline_for_org` semeia
 * um funil "Pedidos" em toda organização nova, a tela mostrava várias linhas
 * idênticas, indistinguíveis, cada uma levando a um quadro diferente. A RLS
 * responde "pode ver?"; a tela precisa responder "quer ver agora?".
 *
 * ⚠️ A LEITURA É ABERTA, A ESCRITA É manager+. Ver a lista e abrir o quadro é
 * trabalho de qualquer papel; criar, renomear, reordenar e arquivar é
 * configuração — e é o que `requireRole("manager")` cobra nas rotas.
 * `podeGerenciar` usa o MESMO critério delas (o papel na organização ativa, sem
 * atalho de platform admin, que as rotas não concedem por padrão): mostrar um
 * botão que o servidor recusaria seria prometer o que não se cumpre.
 */
export default async function KanbanPickerPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_pipelines")
    // ─── UMA LISTA SÓ, COMPARTILHADA COM A ROTA ──────────────────────────
    //
    // Aqui havia uma lista LITERAL de colunas, e ela divergiu da que a rota
    // usa: `fontes` estava lá e faltava aqui. Como o componente faz
    // `funil.fontes ?? ["whatsapp"]`, a coluna ausente virava o default — a
    // caixa "Direct do Instagram" aparecia desmarcada mesmo com o valor
    // gravado, e voltava sozinha no primeiro refresh depois do clique. Sem
    // erro, sem log.
    //
    // O comentário que estava aqui contava que `is_client_pipeline` tinha sido
    // acrescentada pelo MESMO motivo (o selo "Clientes" não aparecia ao
    // carregar, só o corpo de um PATCH trazia a coluna). Duas vezes a mesma
    // armadilha é desenho, não descuido: a lista agora é uma só.
    //
    // ⚠️ `is_archived` é COLUNA, não filtro (#979). Antes a consulta cortava os
    // arquivados no banco, e o resultado era um funil invisível e
    // indestrutível: quem arquivou não tinha como ver, tirar do arquivo nem
    // excluir o que arquivou. A separação acontece abaixo, em memória — a lista
    // de trabalho continua só com os vivos.
    .select(COLUNAS_DO_FUNIL)
    .eq("organization_id", activeOrg.orgId)
    .order("position");

  // ─── FALHA DE CONSULTA NÃO PODE VIRAR "NENHUM FUNIL" ──────────────────────
  //
  // `const { data }` sozinho descartava o `error`, e o `?? []` abaixo
  // transformava qualquer falha em lista vazia: a tela dizia, com toda a calma,
  // que a organização não tem funil nenhum. Quem visse isso concluiria que
  // perdeu os funis.
  //
  // O caso concreto não é hipotético: num banco que ainda não aplicou a 9012, o
  // PostgREST devolve 42703 para a coluna `fontes` e a consulta INTEIRA falha —
  // não vem linha com o campo `undefined`, não vem linha nenhuma. Esta base já
  // teve migration gerada e não aplicada.
  //
  // Estourar é o comportamento certo aqui: o error boundary do App Router mostra
  // que algo quebrou, que é a verdade, em vez de uma lista vazia que mente.
  if (error) {
    throw new Error(`Não consegui carregar os funis: ${error.message}`);
  }

  const todos = (data ?? []) as Array<FunilDaLista & { is_archived: boolean }>;
  const funis = todos.filter((f) => !f.is_archived);
  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  // O arquivo só vai para quem pode mexer nele: tirar do arquivo e excluir são
  // `requireRole("manager")` nas rotas, e mostrar a gaveta a quem receberia 403
  // seria prometer o que não se cumpre — mesmo critério de `podeGerenciar`.
  const arquivados = podeGerenciar ? todos.filter((f) => f.is_archived) : [];
  // Importar planilha é ESCRITA DE OPERAÇÃO, não configuração: quem atende
  // sobe a lista que recebeu. Espelha o `requireRole("agent")` da rota.
  const podeImportar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <Kanban size={28} className="text-muted-foreground" weight="duotone" />
        {/* Era "Pipelines" — nome de quem construiu o sistema, não de quem
            vende. O comentário anterior aqui listava o preço de trocá-lo
            (`rbac-roles.spec.ts` e `invite-lifecycle.spec.ts`) e dizia que
            uniformizar era decisão do dono do produto. Ela foi tomada, e o preço
            era maior do que o comentário contava: são QUATRO assertions em TRÊS
            specs, e `pipelines-gestao.spec.ts` — a spec da própria feature que
            gerou o comentário — é uma delas. Todas atualizadas junto. */}
        <h1 className="text-2xl font-semibold tracking-tight">{t("Funis")}</h1>
      </header>

      <FunisClient
        funis={funis}
        arquivados={arquivados}
        podeGerenciar={podeGerenciar}
        podeImportar={podeImportar}
      />
    </div>
  );
}
