import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from "@/components/pagina";
/**
 * Configurações → Meta Ads. Onde o token de LEITURA da conta de anúncios é
 * conectado.
 *
 * ─── Por que uma tela separada de Configurações › Conversões ────────────────
 *
 * As duas conectam "a Meta", e juntá-las é tentador. São credenciais
 * diferentes, com escopos diferentes na plataforma (uma escreve conversões, a
 * outra lê `ads_read`), guardadas em tabelas diferentes pelas razões no
 * cabeçalho da migration 0214 — e com consequências diferentes quando falham:
 * um token de leitura vencido deixa uma tela vazia; o de conversões vencido faz
 * a empresa parar de reportar vendas sem ninguém perceber.
 *
 * Uma tela só, com dois campos de token que se parecem, é como alguém cola o
 * token errado no campo errado e passa uma semana achando que a integração
 * quebrou.
 *
 * ─── Por que ADMIN CLIENT para ler ──────────────────────────────────────────
 *
 * `ad_insights_connections` tem RLS ligada com ZERO policies e grants revogados
 * de anon/authenticated (0214). Pelo client de sessão esta página mostraria
 * "não conectado" para todo mundo — o gate de papel abaixo é o que autoriza, e a
 * leitura privilegiada acontece no servidor.
 *
 * O token NÃO é lido aqui, nem decifrado: `existeConexaoDeLeitura` responde
 * apenas se a linha existe. A tela nunca mostra o token de volta.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { existeConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import {
  faltaParaConectarOMetaAds,
  metaAdsEstaConfigurado,
} from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { diasParaVencer } from "@/lib/plataformas-de-anuncio/meta/oauth/validade";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDeMetaAds } from "./_form";

export const metadata = { title: "Meta Ads" };
export const dynamic = "force-dynamic";

/** Código curto do `?erro=` que o callback do OAuth devolve, já em português. */
const ERRO_DO_RETORNO: Record<string, string> = {
  cancelado: "Você cancelou a autorização na Meta. Nada foi alterado.",
  estado_invalido:
    "O retorno da Meta expirou ou não é desta sessão. Clique em Conectar com Meta de novo.",
  sem_codigo: "A Meta não devolveu o código de autorização. Tente conectar de novo.",
  troca_falhou: "Não consegui concluir a autorização com a Meta. Tente de novo em instantes.",
  meta_nao_configurado: "Conectar com a Meta ainda não está configurado nesta instalação.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e o token não foi gravado. Quem instalou o sistema precisa configurá-la.",
  erro_ao_gravar: "Não consegui gravar a conexão agora. Tente de novo em instantes.",
};

export default async function MetaAdsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const parametros = await searchParams;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // Mesmo gate de `settings/conversoes`: o objeto é uma credencial da conta de
  // anúncios da empresa, ao lado de billing e API tokens na mesma prancheta.
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const admin = createAdminClient();
  const conexao = await existeConexaoDeLeitura(admin, activeOrg.orgId, "meta_ads");

  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  const dias = diasParaVencer(conexao.tokenExpiraEm);
  const expiraEm = conexao.tokenExpiraEm
    ? new Date(conexao.tokenExpiraEm).toLocaleDateString(tagDeIdioma(idioma), { timeZone: "UTC" })
    : null;
  const erroDoRetorno = parametros.erro ? parametros.erro in ERRO_DO_RETORNO : false;

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo={t("Meta Ads")}
        descricao={t(
          "Conecte um token de acesso para o sistema ler o desempenho das suas campanhas e mostrá-lo em Análise › Meta Ads. É uma conexão só de leitura: nada é criado, pausado ou alterado na sua conta de anúncios.",
        )}
      />
      <SecaoDaPagina>
        {parametros.conectado === "1" && (
          <div
            role="status"
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm"
          >
            {t("Conta conectada com a Meta.")}
          </div>
        )}
        {erroDoRetorno && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
          >
            {t(ERRO_DO_RETORNO[parametros.erro ?? ""] ?? "")}
          </div>
        )}

        <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-4 text-sm">
          {/*
            A permissão exata está escrita aqui porque é o erro nº 1 desta
            integração: um token gerado sem `ads_read` conecta, salva, e só falha
            na hora de abrir a tabela — longe daqui, com uma mensagem que parece
            problema de outra coisa.
          */}
          {t(
            "O token precisa da permissão ads_read. Gere-o no Meta for Developers, na sua conta de aplicativo, e cole abaixo — ele fica guardado criptografado e nunca é mostrado de volta.",
          )}
        </div>

        <FormularioDeMetaAds
          conectada={conexao.conectada}
          contaPadrao={conexao.contaPadrao}
          via={conexao.via}
          expiraEm={expiraEm}
          diasParaVencer={dias}
          oauthDisponivel={metaAdsEstaConfigurado()}
          oauthFalta={faltaParaConectarOMetaAds()}
          idioma={idioma}
        />

        {conexao.conectada && (
          <p className="text-sm text-muted-foreground">
            {t(
              "Para trocar apenas a conta padrão, deixe o campo do token em branco — o token guardado é mantido.",
            )}
          </p>
        )}
      </SecaoDaPagina>
    </Pagina>
  );
}
