/**
 * ESCOLHA DE VARIANTE E SPINTAX — o motor puro, sem dono.
 *
 * Mora fora de `lib/cadencia/` e de `lib/campanhas/` porque os DOIS o usam, e a
 * alternativa seria uma das duas features importar a outra (campanha dependendo
 * de cadência para escolher um texto) ou — pior — uma cópia. Cópia de motor
 * determinístico é o anti-pattern caro: o dia em que uma das duas consertar o
 * aninhamento do spintax e a outra não, o mesmo `{a|{b|c}}` sai diferente em
 * telas que prometem o mesmo vocabulário ao operador.
 *
 * ─── Tudo aqui é PURO ───────────────────────────────────────────────────────
 *
 * Sem banco, sem relógio, sem `Math.random`. A mesma semente devolve sempre o
 * mesmo texto: é isso que faz a prévia da tela ser o que sai no WhatsApp, e uma
 * repetição de job depois de queda ser o MESMO envio, não um segundo.
 *
 * ─── Ordem das passadas (quem chama é responsável por ela) ──────────────────
 *
 *   1. escolhe a variante (`escolherVariante`, hash da semente);
 *   2. resolve o spintax `{a|b|c}` do TEXTO DO OPERADOR (`resolverSpintax`);
 *   3. só então troca `{{variavel}}` pelo valor do contato.
 *
 * Spintax ANTES das variáveis: um valor vindo do cadastro (nome, empresa) com
 * `{a|b}` ou `{{x}}` dentro nunca é reinterpretado — dado de cliente não vira
 * comando de template.
 */

/** Teto de aninhamento do spintax — `{a|{b|{c|d}}}` já é o máximo razoável. */
export const SPINTAX_PROFUNDIDADE_MAXIMA = 3;
/** Teto de tamanho de UMA variante, antes do render. */
export const VARIANTE_TAMANHO_MAXIMO = 1000;

/**
 * FNV-1a 32 bits — hash estável entre processos e versões do Node (ao contrário
 * de qualquer coisa baseada em `Math.random` ou na ordem de um Map).
 */
export function hashEstavel(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Gerador determinístico a partir de uma semente — cada chamada avança o estado. */
export function geradorDe(semente: string): () => number {
  let estado = hashEstavel(semente) || 1;
  return () => {
    // xorshift32
    estado ^= estado << 13;
    estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    estado >>>= 0;
    return estado / 0x100000000;
  };
}

/** Índice da variante para esta semente. `total` >= 1. */
export function escolherVariante(semente: string, total: number): number {
  if (total <= 1) return 0;
  return hashEstavel(`variante:${semente}`) % total;
}

/**
 * Resolve `{a|b|c}` (com aninhamento) escolhendo com o gerador. Chaves duplas
 * `{{…}}` são VARIÁVEIS e passam intactas para a passada seguinte.
 * Devolve `null` quando o texto é inválido (chave sem fechar, profundo demais).
 */
export function resolverSpintax(texto: string, rng: () => number): string | null {
  let pos = 0;

  function lerAte(fechamento: boolean, profundidade: number): string[] | null {
    // Devolve as ALTERNATIVAS do grupo corrente (uma só quando fora de grupo).
    const alternativas: string[] = [];
    let atual = "";
    while (pos < texto.length) {
      const ch = texto[pos]!;
      const prox = texto[pos + 1];
      if (ch === "{" && prox === "{") {
        // Variável: copia até `}}` sem interpretar.
        const fim = texto.indexOf("}}", pos + 2);
        if (fim === -1) return null;
        atual += texto.slice(pos, fim + 2);
        pos = fim + 2;
        continue;
      }
      if (ch === "{") {
        if (profundidade >= SPINTAX_PROFUNDIDADE_MAXIMA) return null;
        pos += 1;
        const grupo = lerAte(true, profundidade + 1);
        if (grupo === null) return null;
        const escolhida = grupo[Math.floor(rng() * grupo.length)] ?? "";
        atual += escolhida;
        continue;
      }
      if (ch === "}") {
        if (!fechamento) return null; // fecha sem abrir
        pos += 1;
        alternativas.push(atual);
        return alternativas;
      }
      if (ch === "|" && fechamento) {
        alternativas.push(atual);
        atual = "";
        pos += 1;
        continue;
      }
      atual += ch;
      pos += 1;
    }
    if (fechamento) return null; // abriu e não fechou
    alternativas.push(atual);
    return alternativas;
  }

  const resultado = lerAte(false, 0);
  return resultado === null ? null : resultado[0]!;
}

/**
 * O texto do operador resolve? Pergunta separada do render porque ela é do
 * TEXTO, não da pessoa: spintax quebrado não é "falta um dado deste contato",
 * é a campanha inteira que não pode sair — e confundir as duas coisas excluiria
 * a lista toda com o motivo errado na tela.
 */
export function spintaxValido(texto: string): boolean {
  return resolverSpintax(texto, () => 0) !== null && !temAlternativaVazia(texto);
}

/**
 * Tem grupo com alternativa VAZIA — `{a|}`, `{|a}`, `{a||b}`, `{}`?
 *
 * Isso é sempre typo, nunca intenção: ninguém escreve "metade das pessoas
 * recebe esta palavra e metade não recebe nada". E é typo CARO, porque o texto
 * continua sendo spintax válido — `resolverSpintax` devolve string, o render
 * não acusa falta de variável, e a mensagem sai mutilada ou em branco para a
 * fração das sementes que cai no lado vazio. Medido num `{Olá|Oi|}`: 89 de 300
 * pessoas recebiam a frase sem a saudação.
 *
 * Recusar na validação é o conserto barato — o operador vê o erro na tela, com
 * a campanha ainda em rascunho, em vez de descobrir pelo que chegou ao cliente.
 * O guard de não-vazio do render continua existindo como última linha, para o
 * texto que entrou por outro caminho.
 */
export function temAlternativaVazia(texto: string): boolean {
  let pos = 0;
  let profundidade = 0;
  let desdeOSeparador = "";
  while (pos < texto.length) {
    const ch = texto[pos]!;
    if (ch === "{" && texto[pos + 1] === "{") {
      // Variável, não grupo: `{{nome}}` passa inteiro e conta como conteúdo.
      const fim = texto.indexOf("}}", pos + 2);
      if (fim === -1) return false;
      desdeOSeparador += texto.slice(pos, fim + 2);
      pos = fim + 2;
      continue;
    }
    if (ch === "{") {
      profundidade += 1;
      desdeOSeparador = "";
      pos += 1;
      continue;
    }
    if ((ch === "|" || ch === "}") && profundidade > 0) {
      if (desdeOSeparador.trim() === "") return true;
      desdeOSeparador = "";
      if (ch === "}") profundidade -= 1;
      pos += 1;
      continue;
    }
    desdeOSeparador += ch;
    pos += 1;
  }
  return false;
}
