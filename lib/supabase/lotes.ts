/**
 * Consulta `.in(...)` que não estoura o tamanho da URL.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * O PostgREST recebe `.in("id", [...])` como QUERY STRING, e cada UUID custa 37
 * bytes com a vírgula. Um quadro com mil e poucos leads monta uma URL de 40 KB,
 * e o gateway a recusa antes de o Postgres ver qualquer coisa.
 *
 * Medido em 24/09/2026 contra o gateway do próprio CRM, com uuids gerados:
 *
 *   200 ids →  7.399 b → 200
 *   600 ids → 22.199 b → 200
 *   700 ids → 25.899 b → 400 "Bad Request"
 *   1097 ids → 40.588 b → 400 "Bad Request"
 *
 * O limite fica por volta de 24 KB. E o 400 chega ao operador como
 * "Não consegui carregar este funil: Bad Request" — uma mensagem que não diz
 * nem que o problema é tamanho, nem que ele cresce com a base do cliente. O
 * funil "Prospecção Lojistas" da Lior (1.097 leads) não abria; o do Dr. Paulo
 * (178 leads) abria, e é essa diferença que fazia o defeito parecer aleatório.
 *
 * ─── Por que 150 e não "o máximo que couber" ────────────────────────────────
 *
 * 150 ids são ~5,6 KB, menos de um quarto do limite medido. A folga existe
 * porque a URL carrega mais coisa além dos ids — a lista de `select`, os
 * filtros de organização, a ordenação — e porque o limite não é o mesmo em todo
 * gateway: o Supabase self-hosted do Verdash, no mesmo dia, recusou já em
 * 18,5 KB (com 414 em vez de 400). Um lote calibrado no limite de hoje volta a
 * quebrar quando a instalação muda de gateway.
 */

/**
 * ⚠️ Já existiam DOIS outros helpers de lote neste repositório quando este
 * nasceu, com constantes diferentes para o mesmo limite de URL:
 * `lib/extensions/service.ts` (`IN_BATCH = 64`, em paralelo, deduplicando) e
 * `lib/lgpd/cascata.ts` (`CONTATOS_POR_BLOCO = 100`). Três números para a mesma
 * pergunta é convite para a próxima pessoa copiar o errado — se for unificar,
 * este é o único dos três com a medição registrada.
 */

/** Ids por requisição. Ver a medição no cabeçalho antes de aumentar. */
export const IDS_POR_CONSULTA = 150;

export function lotesDeIds<T>(ids: readonly T[], tamanho = IDS_POR_CONSULTA): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) {
    lotes.push(ids.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Roda a consulta uma vez por lote e concatena o resultado.
 *
 * O primeiro erro interrompe e volta — o chamador trata erro parcial do mesmo
 * jeito que trataria o erro inteiro, e devolver meia página de dados junto com
 * um erro produziria um quadro que parece completo e não está.
 *
 * Os lotes vão em SÉRIE, não em paralelo: oito requisições simultâneas por
 * quadro multiplicam a chance de esbarrar em limite de conexão do lado do
 * PostgREST, e o ganho de latência não paga o risco numa tela que já carrega.
 */
export async function consultarEmLotes<T>(
  ids: readonly string[],
  consulta: (
    lote: string[],
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanho = IDS_POR_CONSULTA,
): Promise<{ data: T[]; error: string | null }> {
  // Deduplica como o `readInBatches` das extensões já fazia: id repetido só
  // engorda a URL, que é exatamente o recurso escasso aqui. Os chamadores da
  // rota do quadro já deduplicam por conta própria, menos um — e fazer isto
  // aqui vale para todo chamador futuro, de graça.
  const unicos = [...new Set(ids)];
  const saida: T[] = [];
  for (const lote of lotesDeIds(unicos, tamanho)) {
    const { data, error } = await consulta(lote);
    if (error) return { data: [], error: error.message };
    if (data) saida.push(...data);
  }
  return { data: saida, error: null };
}
