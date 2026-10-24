import {
  AGENTE,
  ETAPAS,
  FAQ,
  HERO,
  IMPLANTACAO,
  NICHOS,
  PROBLEMAS,
  SEGURANCA,
  SITE,
} from "./conteudo";

/**
 * `llms.txt` (resumo e índice) e `llms-full.txt` (conteúdo completo), gerados da
 * mesma fonte que a página (`lib/conteudo.ts`): o que a IA cita e o que o
 * visitante lê não divergem.
 */

const CABECALHO = `# ${SITE.nome}

> ${SITE.descricao}

Atualizado em ${SITE.atualizadoEm}. Idioma: português do Brasil. Quem implanta e acompanha: a Tektus.`;

export function llmsResumo(): string {
  return `${CABECALHO}

## Páginas

- [Página inicial](${SITE.url}/): ${HERO.titulo}
- [Entrar no sistema](${SITE.url}/login): acesso de quem já é cliente
- [Política de Privacidade](${SITE.url}/legal/privacy)
- [Termos de Uso](${SITE.url}/legal/terms)

## Em poucas palavras

- ${HERO.texto}
- Preço: depende do tamanho da operação; a proposta sai de um diagnóstico feito pela Tektus. Não há preço de tabela.
- Contato comercial: WhatsApp da Tektus, pelo botão "Pedir um diagnóstico" da página inicial.

## Perguntas frequentes

${FAQ.map((f) => `- ${f.p} ${f.r}`).join("\n")}
`;
}

export function llmsCompleto(): string {
  return `${CABECALHO}

## O que é

${HERO.texto}

## Onde a venda se perde

${PROBLEMAS.map((p) => `### ${p.titulo}\n\n${p.texto}`).join("\n\n")}

## A vida de um lead

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

## ${SEGURANCA.titulo}

${SEGURANCA.itens.map((i) => `- **${i.rotulo}.** ${i.texto}`).join("\n")}

## Perguntas frequentes

${FAQ.map((f) => `### ${f.p}\n\n${f.r}`).join("\n\n")}
`;
}

export const CABECALHOS_TEXTO = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
} as const;
