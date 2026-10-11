"use client";

import { useT } from "@/hooks/i18n/useT";

import { Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";
import { SecaoBotoes } from "./SecaoBotoes";
import { SecaoCampos } from "./SecaoCampos";
import { SecaoConteudo } from "./SecaoConteudo";
import { SecaoMarcadores } from "./SecaoMarcadores";
import { SecaoSobreposicoes } from "./SecaoSobreposicoes";

/**
 * "Componentes básicos", com as três subseções do quadro (Botões, Indicadores
 * e pílulas, Navegação e campos) e, depois delas, o que só o CRM tem: cartão,
 * tabela, vazio e as camadas que abrem por cima.
 */
export function SecaoComponentesBasicos({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`componentes-${tema}`}
      titulo={t("Componentes básicos")}
      mapa="ds:componentes"
      tema={tema}
      apoio={t("Cada componente interativo tem padrão, hover, foco, ativo e desabilitado. Pílulas e botões nunca quebram o texto: se faltar espaço, o item inteiro desce de linha.")}
    >
      <SecaoBotoes tema={tema} />
      <SecaoMarcadores tema={tema} />
      <SecaoCampos tema={tema} />
      <SecaoConteudo tema={tema} />
      <SecaoSobreposicoes tema={tema} />
    </Secao>
  );
}
