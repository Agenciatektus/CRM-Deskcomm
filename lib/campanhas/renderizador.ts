/**
 * O texto que vai para a pessoa.
 *
 * ═══ O vocabulário não é novo ═══
 *
 * `{{nome}}` e `{{primeiro_nome}}` são as MESMAS variáveis de
 * `lib/inbox/template-vars.ts`. Campanha não inventa vocabulário próprio: quem
 * aprendeu a escrever template no Inbox escreve igual aqui. A única que a
 * campanha acrescenta é `{{saudacao}}`, que sai do relógio.
 *
 * ═══ Por que `{{saudacao}}` é resolvida no ENVIO, e não na preparação ═══
 *
 * A janela de envio cobre o dia inteiro e a campanha anda devagar de propósito.
 * Um "Bom dia!" cravado no texto (ou congelado às 9h) chega às 16h dizendo bom
 * dia — numa mensagem que se apresenta como alguém escrevendo, isso denuncia o
 * disparo automático na primeira palavra, que é o que a lista não perdoa. Foi o
 * defeito do primeiro piloto desta feature.
 *
 * ═══ Por que variável sem valor PULA a pessoa ═══
 *
 * "Olá , tudo bem?" é pior que não mandar: é a mesma denúncia, com o agravante
 * de ir para um contato que se queima uma vez só. O renderizador devolve o que
 * faltou e quem chama decide — na preparação vira exclusão visível
 * (`variavel_ausente`), com o operador vendo o número antes de apertar.
 *
 * Sem `eval`, sem HTML, sem travessia de propriedade: é `replace` sobre um mapa
 * fechado de resolvedores.
 */

import {
  VARIANTE_TAMANHO_MAXIMO,
  escolherVariante,
  geradorDe,
  resolverSpintax,
  spintaxValido,
} from "@/lib/texto/variacao";

import { horaNoFuso } from "./relogio";

/** As variáveis que existem. Oferecer uma que não resolve é prometer dado que não há. */
export const VARIAVEIS_DA_CAMPANHA = ["nome", "primeiro_nome", "saudacao"] as const;

export type VariavelDaCampanha = (typeof VARIAVEIS_DA_CAMPANHA)[number];

/** O que a tela mostra ao lado de cada variável. */
export const DESCRICAO_DA_VARIAVEL: Record<VariavelDaCampanha, string> = {
  nome: "Nome do contato, como está no cadastro",
  primeiro_nome: "Só a primeira palavra do nome",
  saudacao: "Bom dia / Boa tarde / Boa noite, na hora do envio",
};

/** Os valores congelados no snapshot. `saudacao` não entra: ela é da hora do envio. */
export interface ValoresDoDestinatario {
  nome: string | null;
}

/**
 * `{{variavel}}` e `{{variavel|texto se faltar}}`.
 *
 * O `|` entrou por PARIDADE com a cadência (`lib/cadencia/render.ts`), e a razão
 * é o operador, não a simetria: ele aprende `{{primeiro_nome|tudo bem}}` lá e
 * escreve o mesmo aqui. Enquanto o pipe não era lido, `{{nome|lojista}}` não
 * casava este TOKEN — logo não entrava em `faltando` NEM em `desconhecidas` — e
 * saía LITERAL no WhatsApp, sem nada avisando. A caixa nova ainda ensina `{a|b}`
 * logo ao lado, o que torna o engano provável em vez de teórico.
 */
const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g;

export interface TextoRenderizado {
  texto: string;
  /** Variáveis usadas no texto que não tinham valor. Vazio = pode enviar. */
  faltando: VariavelDaCampanha[];
  /** Tokens que não são variáveis conhecidas — ficam literais, como no Inbox. */
  desconhecidas: string[];
  /**
   * O texto ficou VAZIO depois de renderizar — `{Olá|}` cai aqui na metade das
   * sementes. Quem chama trata como falta e pula a pessoa: mensagem em branco
   * sai do mesmo jeito pelo WhatsApp e é pior que não mandar nada.
   */
  vazio: boolean;
}

export function renderizar(
  template: string,
  valores: ValoresDoDestinatario,
  quando?: { agora: Date; fuso: string },
): TextoRenderizado {
  const nome = (valores.nome ?? "").trim();
  const faltando = new Set<VariavelDaCampanha>();
  const desconhecidas = new Set<string>();

  const texto = template.replace(TOKEN, (literal, bruto: string, fallback?: string) => {
    const chave = bruto.toLowerCase();
    // O fallback cobre a falta ANTES de ela virar exclusão: quem escreveu
    // `{{primeiro_nome|tudo bem}}` já disse o que quer no lugar do nome.
    const semValor = (variavel: VariavelDaCampanha) =>
      fallback !== undefined ? fallback.trim() : marcarFalta(faltando, variavel, literal);
    switch (chave) {
      case "nome": {
        if (nome === "") return semValor("nome");
        return nome;
      }
      case "primeiro_nome": {
        const primeiro = nome.split(/\s+/)[0] ?? "";
        if (primeiro === "") return semValor("primeiro_nome");
        return primeiro;
      }
      case "saudacao": {
        // Sem instante, a saudação fica literal: quem renderiza a PRÉVIA não
        // sabe a hora do envio, e cravar uma ali ensinaria o operador a esperar
        // aquela. A prévia mostra `{{saudacao}}`; o envio resolve.
        if (!quando) return literal;
        return saudacaoDaHora(quando.agora, quando.fuso);
      }
      default:
        desconhecidas.add(bruto);
        return literal;
    }
  });

  // GUARD DE NÃO-VAZIO — paridade com `lib/cadencia/render.ts`, que já o tinha
  // e que a extração do motor deixou de fora. Medido pelo @Cassio_SecRev: com
  // `{Olá|}` (um pipe sobrando), 139 de 300 sementes rendiam string vazia, o
  // `rendered_body` era congelado em branco e o envio seguia — nenhuma das
  // quatro camadas de validação via, porque o texto É spintax válido e nenhuma
  // variável faltou.
  return {
    texto,
    faltando: [...faltando],
    desconhecidas: [...desconhecidas],
    vazio: texto.trim() === "",
  };
}

function marcarFalta(
  destino: Set<VariavelDaCampanha>,
  variavel: VariavelDaCampanha,
  literal: string,
): string {
  destino.add(variavel);
  return literal;
}

/**
 * A ÚLTIMA passada sobre o corpo já congelado: troca só `{{saudacao}}`.
 *
 * Existe porque o despacho precisa da saudação da hora do ENVIO, e o corpo que
 * ele tem na mão já passou pelo render na preparação — com o nome do contato
 * dentro. Rodar `renderizar` inteiro de novo ali relê esse texto como template,
 * e um cadastro chamado `Loja {{saudacao}}` virava `Loja Boa tarde` no WhatsApp:
 * dado de cliente executado como comando, que é exatamente o que a ordem
 * "spintax antes das variáveis" existe para impedir no resto do caminho.
 *
 * Com regex dedicada, nada mais do corpo é reinterpretado.
 */
export function resolverSaudacao(congelado: string, quando: { agora: Date; fuso: string }): string {
  return congelado.replace(/\{\{\s*saudacao\s*(?:\|[^}]*)?\}\}/gi, () =>
    saudacaoDaHora(quando.agora, quando.fuso),
  );
}

/** Quais variáveis um texto usa — para a tela avisar antes, não depois. */
export function variaveisUsadas(template: string): VariavelDaCampanha[] {
  const achadas = new Set<VariavelDaCampanha>();
  for (const [, bruto] of template.matchAll(TOKEN)) {
    const chave = (bruto ?? "").toLowerCase();
    if ((VARIAVEIS_DA_CAMPANHA as readonly string[]).includes(chave)) {
      achadas.add(chave as VariavelDaCampanha);
    }
  }
  return [...achadas];
}

/**
 * "Bom dia" / "Boa tarde" / "Boa noite" — no fuso do canal, nunca no do servidor.
 *
 * Os cortes são os do português falado, não os do relógio: tarde começa ao
 * meio-dia e noite às 18h.
 */
export function saudacaoDaHora(agora: Date, fuso: string): string {
  const hora = horaNoFuso(agora, fuso);
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/* ═════════════════════════════════════════════════════════════════════════════
 * VARIAÇÕES DA MESMA ABORDAGEM
 *
 * ═══ Por que variação, e por que determinística ═══
 *
 * Quinhentas pessoas recebendo o MESMO texto, do mesmo número, na mesma tarde, é
 * o padrão que o WhatsApp mede. As variações quebram o padrão sem mentir sobre o
 * conteúdo: são textos que o operador escreveu, não geração automática.
 *
 * A escolha é por PESSOA (semente = `contact_id`), não por sorteio a cada
 * passada. Duas consequências, e as duas são o ponto:
 *   * a prévia mostra o que vai sair, porque é a mesma conta;
 *   * repreparar a campanha dá a MESMA variação à mesma pessoa — quem reabre a
 *     lista não vê o texto de todo mundo trocar de lugar sem motivo.
 *
 * ═══ A lista efetiva é `[message_body, ...message_variants]` ═══
 *
 * O corpo principal continua sendo o `message_body`, com o CHECK de não-vazio e
 * o teto de 4.096 do banco. As variações são EXTRAS. Campanha que nunca abriu
 * esta seção tem lista de um item e se comporta exatamente como antes —
 * `escolherVariante` devolve 0 para total 1, sem hash nenhum.
 *
 * ═══ Spintax é do TEXTO, variável é da PESSOA ═══
 *
 * `{a|b}` quebrado (chave sem fechar, aninhado demais) não é "falta um dado
 * deste contato": é a campanha que não pode sair, e tratá-lo como exclusão
 * individual pintaria a lista inteira de `variavel_ausente` — motivo errado na
 * tela do operador. Por isso `spintaxDasVariantes` existe separado e é cobrado
 * ANTES da preparação (`lib/campanhas/acoes.ts`, `preparacao.ts`).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Quantas variações EXTRAS cabem além do corpo principal. */
export const MAX_VARIACOES_EXTRAS = 5;

export { VARIANTE_TAMANHO_MAXIMO };

/**
 * A lista efetiva de variantes. Extra em branco é DESCARTADA: a tela deixa abrir
 * uma aba vazia, e uma variante vazia escolhida por hash mandaria mensagem sem
 * texto para um quinto da lista.
 */
export function variantesDaCampanha(
  corpo: string | null | undefined,
  extras: readonly (string | null)[] | null | undefined,
): string[] {
  const alternativas = (extras ?? [])
    .map((v) => (v ?? "").trim())
    .filter((v) => v !== "")
    .slice(0, MAX_VARIACOES_EXTRAS);
  return [corpo ?? "", ...alternativas];
}

export interface VariacaoRenderizada extends TextoRenderizado {
  /** Qual variante saiu — vai para `campaign_recipients.variables.variante_index`. */
  varianteIndex: number;
}

/**
 * Escolhe a variante desta pessoa, gira o spintax e troca as variáveis — nesta
 * ordem, para que valor de cadastro nunca seja reinterpretado como template.
 *
 * `semente` é o `contact_id`. Spintax inválido NÃO é mascarado aqui: o texto
 * bruto segue para a troca de variáveis (a prévia mostra as chaves como o
 * operador as escreveu) e quem barra o envio é a cobrança de
 * `spintaxDasVariantes` na preparação.
 */
export function renderizarVariacao(entrada: {
  variantes: readonly string[];
  semente: string;
  valores: ValoresDoDestinatario;
  quando?: { agora: Date; fuso: string };
}): VariacaoRenderizada {
  const lista = entrada.variantes.length > 0 ? entrada.variantes : [""];
  const varianteIndex = escolherVariante(entrada.semente, lista.length);
  const bruta = lista[varianteIndex] ?? "";
  // Sem `slice` no teto: o corpo principal aceita 4.096 no banco, e cortar aqui
  // mutilaria em silêncio a campanha longa que já existe. O teto de 1.000 é das
  // variações EXTRAS e é cobrado onde elas entram (Zod + CHECK da 9034).
  const girada = resolverSpintax(bruta, geradorDe(`spintax:${entrada.semente}`));
  return { ...renderizar(girada ?? bruta, entrada.valores, entrada.quando), varianteIndex };
}

/** Índices (na lista efetiva) das variantes cujo `{a|b}` não resolve. Vazio = pode. */
export function spintaxDasVariantes(variantes: readonly string[]): number[] {
  return variantes.map((v, i) => (spintaxValido(v) ? -1 : i)).filter((i) => i >= 0);
}
