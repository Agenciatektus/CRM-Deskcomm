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

import {
  VARIANTE_TAMANHO_MAXIMO,
  escolherVariante,
  geradorDe,
  resolverSpintax,
} from "@/lib/texto/variacao";

/**
 * O motor determinístico (hash, escolha da variante, spintax) mora em
 * `lib/texto/variacao.ts`: a CAMPANHA usa o mesmo, e cópia de motor
 * determinístico é o anti-pattern caro — consertado num lado, o mesmo
 * `{a|{b|c}}` sairia diferente no outro. O que fica aqui é o que é da cadência:
 * o vocabulário de variáveis e a regra de "variável sem valor falha alto".
 *
 * Os nomes são REEXPORTADOS porque eram o contrato público deste módulo
 * (`validar-publicacao.ts`, `settings.ts`, `PassoMensagem.tsx`, `followup/engine.ts`
 * importam daqui) — mudar quinze imports para provar que o motor se mudou de
 * casa seria diff sem informação.
 */
export {
  SPINTAX_PROFUNDIDADE_MAXIMA,
  VARIANTE_TAMANHO_MAXIMO,
  escolherVariante,
  hashEstavel,
  resolverSpintax,
} from "@/lib/texto/variacao";

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
