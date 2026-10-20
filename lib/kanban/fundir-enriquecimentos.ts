import type { Lead } from "@/lib/types/leads";

/**
 * Enriquecimento do quadro do Funil: as famílias rodam EM PARALELO e o
 * resultado é fundido por `id`.
 *
 * ─── Por que existe ───────────────────────────────────────────────────
 *
 * A rota do quadro (`app/api/v1/pipelines/[id]/board/route.ts`) encadeava sete
 * famílias de enriquecimento (dono IA, próxima ação, score, próximo passo,
 * tarefas, conversa, contato), cada uma recebendo a saída da anterior. Nenhuma
 * lê o que a outra acrescenta: todas partem de `id`, `contact_id` e
 * `owner_kind`, que já estão no lead antes de qualquer uma rodar. A fila era do
 * `map` funcional, não do grafo de dados, e custava relógio de parede: em
 * 20/10/2026 o funil "Pré-venda" (~404 leads) passou dos 10 s que o cliente
 * espera (`lib/api/client.ts`, DEFAULT_TIMEOUT_MS) com o banco tranquilo.
 * A PR #23 mediu o mesmo padrão em 8,8 s → 2,1 s com quatro famílias.
 *
 * Os LOTES dentro de cada família continuam em série (`lib/supabase/lotes.ts`);
 * o que passa a ser paralelo são as famílias.
 */

/** Duração, em ms, de cada família e do total. Vai para log e `Server-Timing`. */
export type TemposDoQuadro = Record<string, number>;

/**
 * Roda as famílias ao mesmo tempo e mede cada uma.
 *
 * `Promise.all` e não `allSettled`: o tratamento de erro continua sendo o de
 * cada família (as que degradam já devolvem o lead sem o campo; as que derrubam
 * devolvem `error`, que a rota transforma em 500). Exceção não tratada segue o
 * caminho de antes: sobe e vira 500 no handler.
 */
export async function enriquecerEmParalelo<T extends Record<string, () => Promise<unknown>>>(
  familias: T,
  agora: () => number = () => performance.now(),
): Promise<{ resultados: { [K in keyof T]: Awaited<ReturnType<T[K]>> }; tempos: TemposDoQuadro }> {
  const tempos: TemposDoQuadro = {};
  const nomes = Object.keys(familias) as Array<keyof T & string>;
  const valores = await Promise.all(
    nomes.map(async (nome) => {
      const inicio = agora();
      try {
        return await familias[nome]!();
      } finally {
        tempos[nome] = Math.round((agora() - inicio) * 10) / 10;
      }
    }),
  );
  const resultados = {} as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
  nomes.forEach((nome, i) => {
    (resultados as Record<string, unknown>)[nome] = valores[i];
  });
  return { resultados, tempos };
}

/** `Server-Timing: dono;dur=12.3, score;dur=40.1, total;dur=88` (só nomes e números, sem PII). */
export function cabecalhoServerTiming(tempos: TemposDoQuadro): string {
  return Object.entries(tempos)
    .map(([nome, dur]) => `${nome.replace(/[^A-Za-z0-9_-]/g, "_")};dur=${dur}`)
    .join(", ");
}

/**
 * Funde as versões enriquecidas sobre o MESMO quadro base.
 *
 * Cada família devolve `base.map(...)`: mesmo comprimento, mesma ordem, e cada
 * item é o próprio objeto do base ou `{ ...lead, extras }`. Todas só
 * ACRESCENTAM campos, então espalhar o base com cada versão dá o que a cadeia
 * dava.
 *
 * A conferência de `id` NÃO é zelo: se alguma família passar a reordenar ou
 * filtrar, a fusão por índice montaria o card do lead A com a conversa do lead
 * B, sem erro nenhum, num CRM multi-cliente. Melhor parar alto.
 */
export function fundirEnriquecimentos(base: Lead[], enriquecidos: Lead[][]): Lead[] {
  for (const versao of enriquecidos) {
    if (versao.length !== base.length) {
      throw new Error(
        `[board] enriquecimento mudou o tamanho do quadro: esperava ${base.length}, veio ${versao.length}`,
      );
    }
  }
  return base.map((leadBase, i) => {
    let fundido: Lead = leadBase;
    for (const versao of enriquecidos) {
      const parte = versao[i]!;
      if (parte.id !== leadBase.id) {
        throw new Error(
          `[board] enriquecimento fora de ordem na posição ${i}: esperava ${leadBase.id}, veio ${parte.id}`,
        );
      }
      if (parte === leadBase) continue;
      fundido = { ...fundido, ...parte };
    }
    return fundido;
  });
}
