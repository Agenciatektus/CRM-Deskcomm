import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { inventarioDeTagsSchema } from "@/lib/schemas/tags";
import { createClient } from "@/lib/supabase/server";
import { TagsClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * ETIQUETAS — a curadoria do vocabulário que só existia por SQL (migration 9005).
 *
 * ─── POR QUE PÁGINA PRÓPRIA, E NÃO UMA SEÇÃO DE `tenant/pipelines` ──────────
 *
 * A página de pipelines é sobre UM funil: as etapas daquele funil, os campos
 * daquele funil, os motivos de perda daquele funil — tudo escopado por
 * `pipeline_id`. Etiqueta não pertence a funil nenhum: ela atravessa as
 * conversas e os contatos da organização inteira, e é gravada em
 * `organizations.settings`, não em `crm_pipelines.settings`.
 *
 * Pendurada lá, a tela ensinaria a coisa errada. Quem tem dois funis veria o
 * mesmo bloco de etiquetas repetido em cada card e concluiria, razoavelmente,
 * que editar um não mexe no outro — e mexe, porque é a mesma lista.
 *
 * ─── A PÁGINA É manager+, E TRÊS DAS CINCO AÇÕES SÃO admin ──────────────────
 *
 * Mesma forma de `pipelines/page.tsx`: o piso da página é o da ação mais barata
 * que ela oferece, e as ações caras se escondem sozinhas. Um gerente entra,
 * enxerga o inventário inteiro, cria e arquiva; renomear, mesclar e apagar nem
 * aparecem para ele, porque a Server Action as recusaria de qualquer forma.
 *
 * ─── O INVENTÁRIO VEM DE UMA CHAMADA SÓ ─────────────────────────────────────
 *
 * `fn_tags_inventario` devolve os dois vocabulários e as duas contagens no mesmo
 * instante. Com seis consultas separadas a tela mostraria vocabulário de um
 * momento e contagem de outro, e o número ao lado da etiqueta — que é o que o
 * operador lê antes de apagar — seria de um estado que já passou.
 */
export default async function TagsSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const ehPlatformAdmin = user.is_platform_admin && !user.support;
  if (!ehPlatformAdmin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  /**
   * ⚠️ `podeCurar` NÃO herda o bypass de platform admin, e a assimetria é o
   * ponto.
   *
   * O bypass acima é sobre ENTRAR, que é leitura. Mas quem decide as escritas é
   * `fn_tags_guarda` → `fn_role_at_least` → `fn_user_role_in_org`, e essa cadeia
   * resolve o papel por `user_organizations` — ela não conhece
   * `platform_admins`. Um platform admin que seja `viewer` nesta organização
   * veria renomear, mesclar e apagar, e levaria `sem_permissao` nos três.
   *
   * Não é escalação (o servidor manda, e recusa), é promessa falsa — o oposto do
   * que o resto desta tela faz ao esconder o que a ação recusaria.
   */
  const podeCurar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_tags_inventario", { p_org: activeOrg.orgId });

  // A FALHA SOBE, e não vira lista vazia. Engolir mostraria "nenhuma etiqueta"
  // a uma organização que tem oito — e o operador concluiria que a curadoria já
  // estava feita. É a mesma decisão, pelo mesmo motivo, que a rota
  // `GET /api/v1/conversation-tags` tomou para a RPC de tags em uso.
  if (error) throw new Error(error.message);
  const inventario = inventarioDeTagsSchema.parse(data ?? {});
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Etiquetas", idioma)}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {traduzir(
            "As palavras que a equipe usa para marcar conversas e contatos. Aqui você escolhe quais o sistema sugere, junta as que viraram duas por engano e tira de circulação as que não usa mais.",
            idioma,
          )}
        </p>
      </header>
      <TagsClient inventario={inventario} podeCurar={podeCurar} />
    </div>
  );
}
