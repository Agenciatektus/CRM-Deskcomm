/**
 * LEVAR UM NEGÓCIO PARA OUTRO FUNIL — a parte DECIDÍVEL da troca (quando recusar,
 * qual etapa recebe o card). Quem escreve é `lib/leads/mover-de-funil.ts`.
 *
 * Desde a migration 9053 (decisão do Peterson, 19/10/2026) a troca MOVE o mesmo
 * card: o nome do arquivo e da rota (`/clone`) ficaram pelo contrato, mas nada
 * aqui clona mais. A P-01 antiga (clonar e encerrar a origem como "Levado para
 * outro funil") e a nova tentativa da #205 (clonar o encerrado) saíram.
 */

/** As colunas de `crm_stages` que a escolha da etapa destino precisa. */
export interface EtapaDoFunil {
  id: string;
  pipeline_id: string;
  /** `numeric` no Postgres chega como string pelo PostgREST. */
  position: number | string;
  is_won: boolean;
  is_lost: boolean;
  is_archived: boolean;
}

/**
 * A recusa de fronteira de funil (P-01), UMA string para os DOIS call sites: a
 * rota `/move` (o quadro) e o `moveLeadHandler` (IA, lote e automações).
 *
 * ⚠️ Constante, e não literal repetido, porque o texto é CHAVE do dicionário: o
 * PR que a reescreveu mudou os dois lugares e deixou as duas entradas de espanhol
 * órfãs, então quem usa o produto em espanhol voltou a ler português. O gate de
 * i18n não pega isso — `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` varre
 * `app` e `components`, e ignora `api`. Com uma fonte só, mudar a frase e
 * esquecer a tradução deixa `tests/unit/recusa-de-funil-fala-espanhol.test.ts`
 * vermelho.
 */
export const RECUSA_DE_TROCA_DE_FUNIL =
  "Move cross-pipeline não é permitido. Use POST /api/v1/leads/[id]/clone para levar o negócio a outro funil.";

/** Recusa da rota quando o funil de destino não existe na organização. */
export const FUNIL_DE_DESTINO_NAO_ENCONTRADO = "Funil de destino não encontrado.";

export interface Recusa {
  status: number;
  code: string;
  /** Texto em pt-BR — a rota traduz com `traduzir`. */
  texto: string;
}

export type ResultadoDaEtapa =
  | { ok: true; etapa: EtapaDoFunil }
  | { ok: false; status: number; code: string; texto: string };

/**
 * A única troca que esta rota não faz: para o MESMO funil (isso é `/move`, que só
 * troca a etapa). Negócio aberto ou encerrado pode ir para outro funil: o card é
 * o mesmo e a origem segue contando o desfecho pela passagem (9053).
 */
export function recusaTrocaDeFunil(
  origem: { pipeline_id: string },
  pipelineDestinoId: string,
): Recusa | null {
  if (origem.pipeline_id === pipelineDestinoId) {
    return {
      status: 422,
      code: "pipeline_unchanged",
      texto: "O negócio já está neste funil. Para trocar de etapa use /api/v1/leads/[id]/move.",
    };
  }
  return null;
}

/**
 * Qual etapa recebe o card no funil de destino.
 *
 * Com `stage_id` informado, ele precisa ser uma etapa do funil destino — a rota
 * só carrega as etapas daquele funil, então "não está na lista" é exatamente
 * "é de outro funil". Sem `stage_id`, a primeira etapa aberta (menor `position`):
 * `is_won`/`is_lost` não entram, porque nascer dentro de uma etapa de desfecho
 * fecharia o card no mesmo instante em que ele chega.
 */
export function escolheEtapaDeDestino(
  etapas: EtapaDoFunil[],
  etapaInformadaId?: string | null,
): ResultadoDaEtapa {
  const abertas = etapas.filter((etapa) => !etapa.is_archived);

  if (etapaInformadaId) {
    const encontrada = abertas.find((etapa) => etapa.id === etapaInformadaId);
    if (!encontrada) {
      return {
        ok: false,
        status: 422,
        code: "stage_pipeline_mismatch",
        texto: "A etapa não pertence ao funil de destino.",
      };
    }
    if (encontrada.is_won || encontrada.is_lost) {
      return {
        ok: false,
        status: 422,
        code: "stage_destino_terminal",
        texto: "A etapa de destino é de fechamento: escolha uma etapa aberta do funil.",
      };
    }
    return { ok: true, etapa: encontrada };
  }

  const inicial = abertas
    .filter((etapa) => !etapa.is_won && !etapa.is_lost)
    .sort((a, b) => Number(a.position) - Number(b.position))[0];

  if (!inicial) {
    return {
      ok: false,
      status: 422,
      code: "pipeline_without_initial_stage",
      texto: "O funil de destino não tem etapa aberta para receber o negócio.",
    };
  }
  return { ok: true, etapa: inicial };
}
