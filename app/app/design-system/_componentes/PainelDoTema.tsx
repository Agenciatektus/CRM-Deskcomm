"use client";

import { useT } from "@/hooks/i18n/useT";

import { SecaoBolhas } from "../_secoes/SecaoBolhas";
import { SecaoBotoes } from "../_secoes/SecaoBotoes";
import { SecaoCampos } from "../_secoes/SecaoCampos";
import { SecaoConteudo } from "../_secoes/SecaoConteudo";
import { SecaoCores } from "../_secoes/SecaoCores";
import { SecaoEspacoForma } from "../_secoes/SecaoEspacoForma";
import { SecaoMarcadores } from "../_secoes/SecaoMarcadores";
import { SecaoSobreposicoes } from "../_secoes/SecaoSobreposicoes";
import { SecaoTipografia } from "../_secoes/SecaoTipografia";
import { ATRIBUTO_DO_TEMA, type Tema } from "./tema";

/**
 * Um painel com todas as seções num tema. `subarvore` liga o
 * `data-theme` no próprio painel (o lado a lado); sem ele o painel herda o tema
 * do <html>, que a vitrine já ajustou.
 */
export function PainelDoTema({ tema, subarvore = false }: { tema: Tema; subarvore?: boolean }) {
  const t = useT();
  return (
    <div
      data-theme={subarvore ? ATRIBUTO_DO_TEMA[tema] : undefined}
      data-painel-do-tema={tema}
      className="pele-moldura flex min-w-0 flex-col gap-10 rounded-xl border border-border bg-bg p-6 text-text"
    >
      <p className="text-meta font-bold uppercase tracking-wider text-text-subtle">
        {tema === "claro" ? t("Tema claro") : t("Tema escuro")}
      </p>
      <SecaoCores tema={tema} />
      <SecaoTipografia tema={tema} />
      <SecaoEspacoForma tema={tema} />
      <SecaoBotoes tema={tema} />
      <SecaoCampos tema={tema} />
      <SecaoMarcadores tema={tema} />
      <SecaoConteudo tema={tema} />
      <SecaoSobreposicoes tema={tema} />
      <SecaoBolhas tema={tema} />
    </div>
  );
}
