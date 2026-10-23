"use client";

import { useT } from "@/hooks/i18n/useT";

import { SecaoColunaDoLead } from "../_secoes/SecaoColunaDoLead";
import { SecaoComponentesBasicos } from "../_secoes/SecaoComponentesBasicos";
import { SecaoCores } from "../_secoes/SecaoCores";
import { SecaoEspacoForma } from "../_secoes/SecaoEspacoForma";
import { SecaoLayoutInbox } from "../_secoes/SecaoLayoutInbox";
import { SecaoMensagens } from "../_secoes/SecaoMensagens";
import { SecaoMenusAvisosBusca } from "../_secoes/SecaoMenusAvisosBusca";
import { SecaoNavegacao } from "../_secoes/SecaoNavegacao";
import { SecaoRegras } from "../_secoes/SecaoRegras";
import { SecaoRetorno } from "../_secoes/SecaoRetorno";
import { SecaoTelaDeLogin } from "../_secoes/SecaoTelaDeLogin";
import { SecaoTarefas } from "../_secoes/SecaoTarefas";
import { SecaoTipografia } from "../_secoes/SecaoTipografia";
import { ATRIBUTO_DO_TEMA, type Tema } from "./tema";

/**
 * Um painel com todas as seções num tema.
 *
 * `subarvore` liga o `data-theme` no próprio painel (o lado a lado: os DOIS
 * painéis o levam, e nenhum depende do tema do <html>). Sem ele o painel herda
 * o tema da página, que a vitrine ajustou.
 *
 * A moldura (`pele-moldura`) fica num filho, e não no elemento do tema: a regra
 * da pele é `[data-theme="dark"] .pele-moldura`, que pede o tema num ANCESTRAL.
 */
export function PainelDoTema({ tema, subarvore = false }: { tema: Tema; subarvore?: boolean }) {
  const t = useT();
  return (
    <div
      data-theme={subarvore ? ATRIBUTO_DO_TEMA[tema] : undefined}
      data-painel-do-tema={tema}
      className="min-w-0 rounded-xl text-text"
    >
      <div className="pele-moldura flex min-w-0 flex-col gap-10 rounded-xl border border-border bg-bg p-6">
        <p className="text-meta font-bold uppercase tracking-wider text-text-subtle">
          {tema === "claro" ? t("Tema claro") : t("Tema escuro")}
        </p>
        {/* A ordem é a dos quadros DesignSystem.dc.html e DesignSystemVerdash.dc.html. */}
        <SecaoCores tema={tema} />
        <SecaoTipografia tema={tema} />
        <SecaoEspacoForma tema={tema} />
        <SecaoNavegacao tema={tema} />
        <SecaoComponentesBasicos tema={tema} />
        <SecaoMensagens tema={tema} />
        <SecaoColunaDoLead tema={tema} />
        {/* Só do CRM (o protótipo não desenhou): as peças da tela de Tarefas. */}
        <SecaoTarefas tema={tema} />
        <SecaoMenusAvisosBusca tema={tema} />
        <SecaoRetorno tema={tema} />
        <SecaoLayoutInbox tema={tema} />
        {/* Só do CRM (o protótipo da Inbox não tem): a tela de acesso dividida. */}
        <SecaoTelaDeLogin tema={tema} />
        <SecaoRegras tema={tema} />
      </div>
    </div>
  );
}
