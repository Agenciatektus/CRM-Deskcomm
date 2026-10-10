/**
 * As larguras reguláveis da Inbox (G1-G3 da auditoria do visual v2), em funções
 * puras: o componente arrasta e desenha, a regra de quanto pode mora aqui e é
 * testada sem render.
 *
 * Faixas do protótipo: lista 280-480 (padrão 340), painel 300-520 (padrão 352)
 * e a conversa nunca abaixo de 420. Quando as três não cabem, quem cede é a
 * coluna que está sendo arrastada: a conversa é o trabalho, e as laterais
 * existem para servi-la.
 */
export const LARGURA_DA_LISTA = { min: 280, max: 480, padrao: 340 } as const;
export const LARGURA_DO_PAINEL = { min: 300, max: 520, padrao: 352 } as const;
export const MINIMO_DA_CONVERSA = 420;
/** O passo das setas do teclado; com Shift, o grande. */
export const PASSO = 8;
export const PASSO_GRANDE = 40;

export interface Larguras {
  lista: number;
  painel: number;
}

export const LARGURAS_PADRAO: Larguras = {
  lista: LARGURA_DA_LISTA.padrao,
  painel: LARGURA_DO_PAINEL.padrao,
};

export type Coluna = keyof Larguras;

function faixa(coluna: Coluna) {
  return coluna === "lista" ? LARGURA_DA_LISTA : LARGURA_DO_PAINEL;
}

/**
 * O máximo que `coluna` pode ter AGORA: o teto da faixa, ou o que sobra depois
 * de garantir a conversa mínima e a outra lateral. `total` é a largura útil do
 * cartão; sem medida (0) vale só a faixa.
 */
export function maximoDe(coluna: Coluna, larguras: Larguras, total: number, comPainel: boolean): number {
  const { min, max } = faixa(coluna);
  if (total <= 0) return max;
  const outra = coluna === "lista" ? (comPainel ? larguras.painel : 0) : larguras.lista;
  return Math.max(min, Math.min(max, total - MINIMO_DA_CONVERSA - outra));
}

/** Prende `valor` na faixa da coluna e no que cabe ao lado da conversa mínima. */
export function limitar(
  coluna: Coluna,
  valor: number,
  larguras: Larguras,
  total: number,
  comPainel: boolean,
): number {
  const { min } = faixa(coluna);
  const teto = maximoDe(coluna, larguras, total, comPainel);
  return Math.round(Math.max(min, Math.min(teto, valor)));
}

export const CHAVE_DAS_LARGURAS = "crm.inbox.larguras.v1";

/**
 * Lê o que foi salvo. Qualquer coisa estranha (JSON quebrado, número fora da
 * faixa, chave de outra versão) volta ao padrão: a preferência é conveniência,
 * e uma largura absurda salva não pode deixar a tela inutilizável.
 */
export function lerLarguras(bruto: string | null): Larguras {
  if (!bruto) return LARGURAS_PADRAO;
  try {
    const v = JSON.parse(bruto) as Partial<Larguras>;
    const ok = (n: unknown, f: { min: number; max: number }) =>
      typeof n === "number" && Number.isFinite(n) && n >= f.min && n <= f.max;
    return {
      lista: ok(v.lista, LARGURA_DA_LISTA) ? Math.round(v.lista!) : LARGURAS_PADRAO.lista,
      painel: ok(v.painel, LARGURA_DO_PAINEL) ? Math.round(v.painel!) : LARGURAS_PADRAO.painel,
    };
  } catch (erroDeLeitura) {
    void erroDeLeitura;
    return LARGURAS_PADRAO;
  }
}
