/**
 * A AUDIÊNCIA — quem recebe, escolhido por filtro sobre os dados que a
 * organização já tem.
 *
 * ═══ Por que filtro, e não lista colada ═══
 *
 * A primeira versão desta feature pedia os telefones num campo de texto, e a
 * lista do piloto foi montada por script. Isso é lista colada com CRM em volta:
 * o operador não confere o recorte, não repete amanhã, e "quem recebe" acaba
 * morando fora do sistema — numa planilha ou na cabeça de alguém.
 *
 * ═══ Uma regra, dois consumidores ═══
 *
 * A MESMA função monta a prévia (o que o operador vê antes de apertar) e o
 * snapshot (o que grava os destinatários). Duas implementações divergiriam no
 * dia em que alguém mexesse numa só, e a divergência apareceria como "a prévia
 * dizia 30 e foram 47".
 *
 * ═══ O que NÃO existe ═══
 *
 * Não existe "todos os contatos". Audiência sem recorte é o pedido que ninguém
 * revisa antes de apertar, e é assim que a organização inteira recebe por
 * engano. Pelo menos um critério é obrigatório.
 *
 * Nenhum nome de coluna vem do cliente: o filtro é um objeto fechado, validado
 * por Zod, e cada campo dele vira um predicado escrito aqui.
 */
import { z } from "zod";

/**
 * ⚠️ `CAMPANHAS_VIVAS` FOI REMOVIDA na 9039, e o vazio aqui é deliberado.
 *
 * Ela listava os estados em que uma campanha "ainda pretende falar com a lista
 * dela", e servia ao veto "já em campanha" nos DOIS lugares em que ele existe:
 * `contatosJaEmCampanha` (`consulta-de-audiencia.ts`, o conjunto do modo lista) e
 * `estaEmOutraCampanha` (`entrada-por-etapa.db.ts`, a pergunta por contato do
 * gatilho contínuo). Os dois saíram dela no mesmo commit — nenhum ficou
 * pendente.
 * Esse veto virou DOIS critérios (decisão do dono, 06/10/2026): quem RECEBEU nos
 * últimos 30 dias, que não olha estado de campanha nenhum, e quem está na FILA
 * ATIVA de uma campanha que ainda vai falar, que olha.
 *
 * O problema dela nunca foi listar estados — era ser a lista de SEIS estados
 * usada como se respondesse "ainda vai falar?", quando a autoridade sobre isso é
 * a máquina de estados. O critério (2) pergunta pelo complemento, derivado de
 * lá: `STATUS_TERMINAIS` (`lib/campanhas/maquina-de-estados.ts`). Duas listas de
 * estados divergem no primeiro estado novo, e a que ninguém lembrasse de
 * atualizar seria a que decide se uma pessoa recebe duas abordagens.
 *
 * Deixar a constante de pé sem consumidor convidaria a ressuscitar a regra
 * antiga, com o nome que ela tinha.
 */

/**
 * Os CRITÉRIOS de recorte: o que escolhe gente da base. É a forma do público
 * positivo e, sem mais nada, a do bloco `excluir` (quem sai do público).
 */
const criteriosShape = {
  /** Contato precisa ter TODAS estas etiquetas. */
  com_todas_tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  /** Contato precisa ter PELO MENOS UMA destas. */
  com_alguma_tag: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  /** Contato não pode ter NENHUMA destas. */
  sem_tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),

  /** Tem negócio aberto em algum destes funis. */
  funis: z.array(z.string().uuid()).max(20).default([]),
  /** ...em alguma destas etapas. */
  etapas: z.array(z.string().uuid()).max(50).default([]),
  /** ...com algum destes donos. */
  responsaveis: z.array(z.string().uuid()).max(50).default([]),
  /** Situação do negócio: `open`, `won`, `lost`. */
  situacoes_do_negocio: z.array(z.enum(["open", "won", "lost"])).max(3).default([]),

  /** Sem interação há N dias (silêncio) — o filtro de reativação. */
  sem_interacao_ha_dias: z.number().int().min(1).max(3650).nullable().default(null),
  /** Com interação nos últimos N dias. */
  com_interacao_ha_dias: z.number().int().min(0).max(3650).nullable().default(null),
  /** Cadastrado a partir de / até (ISO). */
  cadastrado_de: z.string().datetime().nullable().default(null),
  cadastrado_ate: z.string().datetime().nullable().default(null),
  /** `contacts.source` — de onde o contato veio. */
  origens: z.array(z.string().trim().min(1).max(40)).max(20).default([]),

  /**
   * COMPRA — a fonte é a tabela `orders`, nunca `custom_fields`. Só conta pedido
   * de compra efetiva (`STATUS_DE_COMPRA_EFETIVA`). Contato sem pedido efetivo
   * fica FORA de qualquer critério de compra.
   *
   * Borda dos dias (`casaCompra`): janela móvel de 24 h, não dia de calendário,
   * e as duas pontas são INCLUSIVAS. `min N` = última compra em ou antes de
   * `agora − N×24h`; `max N` = última compra em ou depois de `agora − N×24h`.
   * Quem comprou há exatamente 30×24h entra em `min 30` e em `max 30`.
   */
  ultima_compra_ha_dias_min: z.number().int().min(0).max(3650).nullable().default(null),
  ultima_compra_ha_dias_max: z.number().int().min(0).max(3650).nullable().default(null),
  /** Pelo menos N pedidos efetivos. */
  compras_min: z.number().int().min(1).max(100_000).nullable().default(null),
  /** Soma de `total_cents` dos pedidos efetivos maior ou igual a N. */
  gasto_min_centavos: z.number().int().min(0).max(100_000_000_000).nullable().default(null),
};

const janelaDeCompraCoerente = (c: {
  ultima_compra_ha_dias_min: number | null;
  ultima_compra_ha_dias_max: number | null;
}) =>
  c.ultima_compra_ha_dias_min === null ||
  c.ultima_compra_ha_dias_max === null ||
  c.ultima_compra_ha_dias_min <= c.ultima_compra_ha_dias_max;

const MENSAGEM_JANELA = "O mínimo de dias desde a última compra não pode passar do máximo.";

/**
 * O bloco `excluir`: a mesma forma dos critérios, sem `limite` nem listas à mão.
 * Quem casa com ELE sai do recorte (subtração). Bloco sem critério nenhum não
 * tira ninguém.
 */
export const criteriosDeExclusaoSchema = z
  .strictObject(criteriosShape)
  .refine(janelaDeCompraCoerente, { message: MENSAGEM_JANELA });

export type CriteriosDeAudiencia = z.infer<typeof criteriosDeExclusaoSchema>;

export const filtroDeAudienciaSchema = z
  .strictObject({
    ...criteriosShape,

    /** Contatos a incluir mesmo que o recorte não os pegue. */
    incluir_contatos: z.array(z.string().uuid()).max(5000).default([]),
    /** Contatos a tirar, mesmo que o recorte os pegue. */
    excluir_contatos: z.array(z.string().uuid()).max(5000).default([]),
    /**
     * Quem casa com estes critérios sai do recorte. Opcional e nulo por padrão:
     * filtro salvo antes deste campo continua válido.
     */
    excluir: criteriosDeExclusaoSchema.nullable().default(null),

    /** Teto do lote. A mesma régua do import de CSV para "quanta gente de uma vez". */
    limite: z.number().int().min(1).max(5000).default(500),
  })
  // Só exclusão não vale: o que conta é critério POSITIVO (ou incluído à mão).
  .refine((f) => temRecorte(f) || f.incluir_contatos.length > 0, {
    message: "Escolha pelo menos um critério — audiência sem recorte não se confere.",
  })
  .refine(janelaDeCompraCoerente, { message: MENSAGEM_JANELA });

export type FiltroDeAudiencia = z.infer<typeof filtroDeAudienciaSchema>;

const CHAVES_DO_FILTRO = new Set([
  ...Object.keys(criteriosShape),
  "incluir_contatos",
  "excluir_contatos",
  "excluir",
  "limite",
]);

/**
 * Lê o filtro SALVO descartando chave que o schema atual não conhece: o schema é
 * `strictObject`, e uma chave removida no futuro daria 422 em todo Salvar das
 * campanhas antigas. Só o nível de cima; o bloco `excluir` segue estrito.
 */
export function limparFiltroSalvo(bruto: unknown): Record<string, unknown> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return Object.fromEntries(Object.entries(bruto).filter(([k]) => CHAVES_DO_FILTRO.has(k)));
}

/** Um filtro vazio, para campanha recém-criada. Não passa no `refine` — e é o ponto. */
export const FILTRO_VAZIO = {
  com_todas_tags: [],
  com_alguma_tag: [],
  sem_tags: [],
  funis: [],
  etapas: [],
  responsaveis: [],
  situacoes_do_negocio: [],
  sem_interacao_ha_dias: null,
  com_interacao_ha_dias: null,
  cadastrado_de: null,
  cadastrado_ate: null,
  origens: [],
  ultima_compra_ha_dias_min: null,
  ultima_compra_ha_dias_max: null,
  compras_min: null,
  gasto_min_centavos: null,
  incluir_contatos: [],
  excluir_contatos: [],
  excluir: null,
  limite: 500,
} satisfies FiltroDeAudiencia;

/**
 * O filtro tem algum RECORTE (critério que escolhe gente da base), além dos
 * incluídos à mão?
 *
 * ⚠️ Sem recorte, a consulta principal de contatos não tem predicado nenhum e
 * devolveria a ORGANIZAÇÃO INTEIRA até o `limite`. O `refine` aceita
 * `incluir_contatos` sozinho como critério — e é o caso de "Adicionar à
 * campanha" (barra em lote do Funil) numa campanha recém-criada: a audiência
 * é exatamente quem foi incluído, ninguém mais. Quem consulta pergunta isto
 * antes (`buscarCandidatos`).
 */
export function temRecorte(filtro: CriteriosDeAudiencia): boolean {
  return temPredicadoDeContato(filtro) || usaNegocio(filtro) || usaCompra(filtro);
}

/** Algum critério que vira predicado direto em `contacts`? */
export function temPredicadoDeContato(filtro: CriteriosDeAudiencia): boolean {
  return (
    filtro.com_todas_tags.length > 0 ||
    filtro.com_alguma_tag.length > 0 ||
    filtro.sem_tags.length > 0 ||
    filtro.origens.length > 0 ||
    filtro.sem_interacao_ha_dias !== null ||
    filtro.com_interacao_ha_dias !== null ||
    filtro.cadastrado_de !== null ||
    filtro.cadastrado_ate !== null
  );
}

/** Precisa olhar `crm_leads`? Só então o join entra — join à toa custa em toda prévia. */
export function usaNegocio(filtro: CriteriosDeAudiencia): boolean {
  return (
    filtro.funis.length > 0 ||
    filtro.etapas.length > 0 ||
    filtro.responsaveis.length > 0 ||
    filtro.situacoes_do_negocio.length > 0
  );
}

/** A data-limite de "sem interação há N dias". Exportada para o teste não recalcular. */
export function limiteDeSilencio(dias: number, agora: Date): Date {
  return new Date(agora.getTime() - dias * 86_400_000);
}

/** Precisa olhar `orders`? */
export function usaCompra(filtro: CriteriosDeAudiencia): boolean {
  return (
    filtro.ultima_compra_ha_dias_min !== null ||
    filtro.ultima_compra_ha_dias_max !== null ||
    filtro.compras_min !== null ||
    filtro.gasto_min_centavos !== null
  );
}

/**
 * Status de `orders` que representam compra EFETIVA. Fora: `pending` (não
 * pagou), `cancelled` e `refunded` (desfeita).
 */
export const STATUS_DE_COMPRA_EFETIVA = ["paid", "fulfilled", "shipped", "delivered"] as const;

export interface ResumoDeCompras {
  /** `ordered_at` mais recente, em epoch ms. */
  ultima: number;
  compras: number;
  gastoCentavos: number;
}

/** Junta os pedidos por contato. Pedido fora de `STATUS_DE_COMPRA_EFETIVA` não conta. */
export function resumirPedidos(
  pedidos: Iterable<{
    contact_id: string;
    status: string;
    ordered_at: string;
    total_cents: number | string;
  }>,
): Map<string, ResumoDeCompras> {
  const efetivos = new Set<string>(STATUS_DE_COMPRA_EFETIVA);
  const mapa = new Map<string, ResumoDeCompras>();
  for (const p of pedidos) {
    if (!efetivos.has(p.status)) continue;
    const quando = Date.parse(p.ordered_at);
    // `total_cents` é bigint: o PostgREST pode devolver string.
    const total = Number(p.total_cents);
    const r = mapa.get(p.contact_id);
    if (!r) {
      mapa.set(p.contact_id, { ultima: quando, compras: 1, gastoCentavos: total });
    } else {
      r.ultima = Math.max(r.ultima, quando);
      r.compras += 1;
      r.gastoCentavos += total;
    }
  }
  return mapa;
}

/**
 * O contato casa com os critérios de compra? Sem resumo (nenhum pedido
 * efetivo) nunca casa. Borda dos dias: ver o comentário em `criteriosShape`.
 */
export function casaCompra(
  resumo: ResumoDeCompras | undefined,
  c: CriteriosDeAudiencia,
  agora: Date,
): boolean {
  if (!resumo) return false;
  if (
    c.ultima_compra_ha_dias_min !== null &&
    resumo.ultima > limiteDeSilencio(c.ultima_compra_ha_dias_min, agora).getTime()
  ) {
    return false;
  }
  if (
    c.ultima_compra_ha_dias_max !== null &&
    resumo.ultima < limiteDeSilencio(c.ultima_compra_ha_dias_max, agora).getTime()
  ) {
    return false;
  }
  if (c.compras_min !== null && resumo.compras < c.compras_min) return false;
  if (c.gasto_min_centavos !== null && resumo.gastoCentavos < c.gasto_min_centavos) return false;
  return true;
}
