/**
 * O texto do aviso de etapa (`crm_stages.avisar_na_central`, migration 0440).
 *
 * Módulo PURO, sem banco — roda no servidor e no navegador: quem escreve o
 * aviso (`./aviso-de-etapa.handler.ts`) monta o título por aqui, e é por este
 * mesmo título que o handler reconhece um aviso já aberto e que o som da
 * Central (`lib/notifications/sons-da-org.ts`) reconhece o aviso de etapa. As
 * pontas não podem divergir.
 *
 * O título diz só a ETAPA, entre aspas angulares: o título do negócio costuma
 * ser o nome ou o telefone do cliente, e a Central mostra o texto como foi
 * gravado. Quem abre o aviso vê o negócio com a permissão que tem.
 */
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

import { INICIO_DO_TITULO } from "./aviso-de-etapa-marca";

export function tituloDoAvisoDeEtapa(etapa: string, idioma: Idioma): string {
  return `${traduzir(INICIO_DO_TITULO, idioma)} «${etapa}»`;
}

export function corpoDoAvisoDeEtapa(idioma: Idioma): string {
  return traduzir(
    "Abra o negócio para dar o próximo passo. Este aviso foi pedido na configuração da etapa.",
    idioma,
  );
}

export { ehAvisoDeEtapa } from "./aviso-de-etapa-marca";
