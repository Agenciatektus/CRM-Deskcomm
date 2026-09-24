import type { Lead } from "@/lib/types/leads";

/**
 * Funde os enriquecimentos que rodaram em paralelo sobre o MESMO quadro base.
 *
 * ─── Por que existe ───────────────────────────────────────────────────
 *
 * Os quatro enriquecimentos (`withNextActions`, `withScores`, `withConversas`,
 * `withMarcadoresDoContato`) leem só `id` e `contact_id` do lead, que já estão
 * lá antes de qualquer um deles rodar. Estavam encadeados pelo `map` funcional,
 * não por dependência de dado: cada um recebia a saída do anterior só porque
 * foi escrito assim.
 *
 * O custo desse encadeamento é relógio de parede. Medido em 24/09/2026 contra
 * o gateway de produção, no funil "Prospecção Lojistas" da Lior (1.098 leads):
 * 43 requisições em série, 4,2 a 4,5 s com `service_role`, e mais sob RLS —
 * `contacts` sozinha custa 563 ms de banco, `crm_leads` 434 ms. O cliente
 * desiste em 10 s (`lib/api/client.ts`, DEFAULT_TIMEOUT_MS), então a folga era
 * fina o bastante para qualquer soluço aparecer como
 * "A requisição não respondeu em 10000ms".
 *
 * Os LOTES dentro de cada família continuam em série, como o cabeçalho de
 * `lib/supabase/lotes.ts` decidiu e explicou. O que passa a ser paralelo são as
 * FAMÍLIAS — quatro conexões, não quarenta e três. E isso já era prática aqui:
 * `withNextActions` sempre rodou suas duas consultas em `Promise.all`.
 *
 * ─── Por que fundir assim é seguro ──────────────────────────────────
 *
 * Cada enriquecimento devolve `base.map(...)`: mesmo comprimento, mesma ordem,
 * e cada item é ou o próprio objeto do base, ou `{ ...lead, extras }`. Os quatro
 * só ACRESCENTAM campos — nenhum reescreve campo do base. Então espalhar o base
 * com os quatro na sequência dá o mesmo resultado que a cadeia dava, com as
 * chaves do base sendo reatribuídas ao mesmo valor.
 *
 * "Só acrescentam" é a premissa da qual tudo isso depende, e premissa que vale
 * hoje é premissa que alguém quebra amanhã sem perceber. Por isso a conferência
 * de `id` abaixo não é zelo: se algum enriquecimento passar a reordenar ou
 * filtrar, a fusão por índice montaria cards com os dados do vizinho — um
 * defeito silencioso e horrível de achar. Melhor parar alto.
 */
export function fundirEnriquecimentos(base: Lead[], enriquecidos: Lead[][]): Lead[] {
  return base.map((leadBase, i) => {
    let fundido: Lead = leadBase;
    for (const versao of enriquecidos) {
      const parte = versao[i];
      if (!parte) continue;
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

