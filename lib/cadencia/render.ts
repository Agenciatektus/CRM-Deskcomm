/**
 * O TEXTO QUE A CADÊNCIA MANDA — escolha da variante, spintax e variáveis.
 *
 * Função PURA (sem banco, sem relógio, sem aleatório de verdade): o mesmo
 * enrollment no mesmo passo produz SEMPRE o mesmo texto. É isso que deixa o
 * preview da tela igual ao que sai no WhatsApp, e o reenvio de um job repetido
 * igual ao original — um texto sorteado de novo a cada tentativa seria um
 * segundo "envio" aos olhos do anti-repetição.
 *
 * ─── Ordem das passadas (e por que ela importa) ─────────────────────────────
 *
 *   1. escolhe a variante (hash de `semente`);
 *   2. resolve o spintax `{a|b|c}` do TEXTO DO OPERADOR;
 *   3. só então troca `{{variavel}}` pelo valor do lead.
 *
 * Spintax antes das variáveis, numa passada só: um valor vindo do lead (nome,
 * campo personalizado) com `{a|b}` ou `{{x}}` dentro NUNCA é reinterpretado —
 * dado de cliente não vira comando de template.
 *
 * ─── Variável sem valor falha ALTO ──────────────────────────────────────────
 *
 * `{{primeiro_nome}}` sem nome no cadastro, e sem fallback, não vira "Oi , tudo
 * bem?". A renderização devolve `ok:false` com a lista do que faltou e o motor
 * PULA o passo registrando o motivo (LRN-20260710-006: template vazio saindo é
 * pior que nada saindo). Com `{{primeiro_nome|tudo bem}}` o fallback cobre.
 */

/** Teto de aninhamento do spintax — `{a|{b|{c|d}}}` já é o máximo razoável. */
export const SPINTAX_PROFUNDIDADE_MAXIMA = 3;
/** Teto de tamanho de UMA variante, antes do render. */
export const VARIANTE_TAMANHO_MAXIMO = 1000;

/** Variáveis que o operador pode usar. A lista É o contrato: nome fora dela não renderiza. */
export const VARIAVEIS_DA_CADENCIA = [
  "primeiro_nome",
  "nome",
  "empresa",
  "etapa",
  "atendente",
] as const;
export type VariavelDaCadencia = (typeof VARIAVEIS_DA_CADENCIA)[number];

export type ValoresDaCadencia = Partial<Record<VariavelDaCadencia, string | null>>;

export type RenderDaCadencia =
  | { ok: true; texto: string; varianteIndex: number }
  | { ok: false; varianteIndex: number; faltando: string[]; motivo: "variavel_sem_valor" | "variavel_desconhecida" | "spintax_invalido" };

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
function geradorDe(semente: string): () => number {
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

const PADRAO_VARIAVEL = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g;

/** Primeiro nome "de gente": primeira palavra, capitalizada, sem número. */
export function primeiroNome(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primeiro || /\d/.test(primeiro) || primeiro.length < 2) return null;
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

/**
 * Renderiza a variante escolhida para `semente` (use `${enrollment_id}:${node_id}`).
 * `variantes[0]` é o corpo principal; as demais são alternativas.
 */
export function renderizarMensagemDaCadencia(input: {
  variantes: readonly string[];
  semente: string;
  valores: ValoresDaCadencia;
}): RenderDaCadencia {
  const total = Math.max(1, input.variantes.length);
  const varianteIndex = escolherVariante(input.semente, total);
  const bruto = (input.variantes[varianteIndex] ?? "").slice(0, VARIANTE_TAMANHO_MAXIMO);

  const girado = resolverSpintax(bruto, geradorDe(`spintax:${input.semente}`));
  if (girado === null) {
    return { ok: false, varianteIndex, faltando: [], motivo: "spintax_invalido" };
  }

  const faltando: string[] = [];
  const desconhecidas: string[] = [];
  const texto = girado.replace(PADRAO_VARIAVEL, (_todo, nome: string, fallback?: string) => {
    if (!(VARIAVEIS_DA_CADENCIA as readonly string[]).includes(nome)) {
      desconhecidas.push(nome);
      return "";
    }
    const valor = input.valores[nome as VariavelDaCadencia]?.trim();
    if (valor) return valor;
    if (fallback !== undefined) return fallback.trim();
    faltando.push(nome);
    return "";
  });

  if (desconhecidas.length > 0) {
    return { ok: false, varianteIndex, faltando: desconhecidas, motivo: "variavel_desconhecida" };
  }
  if (faltando.length > 0) {
    return { ok: false, varianteIndex, faltando, motivo: "variavel_sem_valor" };
  }
  const final = texto.replace(/[ \t]{2,}/g, " ").trim();
  if (!final) return { ok: false, varianteIndex, faltando: [], motivo: "variavel_sem_valor" };
  return { ok: true, texto: final, varianteIndex };
}

/** Variáveis citadas num texto (para a validação de publicação e para a tela). */
export function variaveisCitadas(texto: string): string[] {
  const nomes = new Set<string>();
  for (const m of texto.matchAll(PADRAO_VARIAVEL)) nomes.add(m[1]!);
  return [...nomes];
}
