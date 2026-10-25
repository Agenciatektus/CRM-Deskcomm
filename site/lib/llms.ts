import {
  AGENTE,
  CTA,
  ESTATISTICA_RD,
  ETAPAS,
  FAQ,
  HERO,
  IMPLANTACAO,
  MECANISMO,
  NICHOS,
  OBJECOES,
  OFERTA,
  PROBLEMAS,
  PROBLEMAS_TITULO,
  SITE,
} from "./conteudo";

/**
 * `llms.txt` (resumo e índice) e `llms-full.txt` (conteúdo completo), gerados da
 * mesma fonte que a página (`lib/conteudo.ts`): o que a IA cita e o que o
 * visitante lê não divergem.
 */

const CABECALHO = `# ${SITE.nome}

> ${SITE.descricao}

Atualizado em ${SITE.atualizadoEm}. Idioma: português do Brasil. Implantação e acompanhamento opcionais pela Tektus.`;

const PRECO = OFERTA.planos.map((p) => `${p.nome}: ${p.preco} ${p.periodo}`).join(". ");

export function llmsResumo(): string {
  return `${CABECALHO}

## Páginas

- [Página inicial](${SITE.url}/): ${HERO.titulo}
- [Entrar no sistema](${SITE.url}/login): acesso de quem já é cliente
- [Política de Privacidade](${SITE.url}/legal/privacy)
- [Termos de Uso](${SITE.url}/legal/terms)

## Em poucas palavras

- ${HERO.texto}
- Preço: ${PRECO}. Implantação opcional pela Tektus, pagamento único de ${OFERTA.implantacao.preco} ${OFERTA.implantacao.parcelas}.
- Contato comercial: WhatsApp da Tektus, pelo botão "${CTA.comprar.rotulo}" ou "${CTA.duvida.rotulo}" da página inicial.

## Perguntas frequentes

${FAQ.map((f) => `- ${f.p} ${f.r}`).join("\n")}
`;
}

export function llmsCompleto(): string {
  return `${CABECALHO}

## O que é

${HERO.texto}

## ${PROBLEMAS_TITULO}

${PROBLEMAS.map((p) => `### ${p.titulo}\n\n${p.texto} ${p.saida}`).join("\n\n")}

${ESTATISTICA_RD}

## ${MECANISMO.titulo}

${MECANISMO.texto}

${ETAPAS.map((e, i) => `${i + 1}. **${e.titulo}.** ${e.texto}`).join("\n")}

## ${AGENTE.titulo}

${AGENTE.texto}

${AGENTE.itens.map((i) => `- **${i.rotulo}.** ${i.texto}`).join("\n")}

## ${NICHOS.titulo}

${NICHOS.texto}

${NICHOS.exemplos.map((e) => `- ${e.negocio}: o lead vira ${e.lead} e o ganho vira ${e.ganho}.`).join("\n")}

## ${IMPLANTACAO.titulo}

${IMPLANTACAO.texto}

${IMPLANTACAO.passos.map((p, i) => `${i + 1}. **${p.titulo}.** ${p.texto}`).join("\n")}

## ${OFERTA.nome}: ${OFERTA.precoTitulo.toLowerCase()}

${OFERTA.itens.map((i) => `- **${i.titulo}.** ${i.texto}`).join("\n")}

${OFERTA.planos.map((p) => `- **${p.nome}, ${p.preco} ${p.periodo}.** ${p.detalhes.join(" ")}`).join("\n")}
- **Implantação, ${OFERTA.implantacao.preco} ${OFERTA.implantacao.parcelas}.** ${OFERTA.implantacao.detalhe} ${OFERTA.implantacao.aviso}

## Objeções comuns

${OBJECOES.map((o) => `### ${o.p}\n\n${o.r}`).join("\n\n")}

## Perguntas frequentes

${FAQ.map((f) => `### ${f.p}\n\n${f.r}`).join("\n\n")}
`;
}

export const CABECALHOS_TEXTO = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
} as const;
