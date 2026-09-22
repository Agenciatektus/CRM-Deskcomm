/**
 * Curadoria do vocabulário de etiquetas — o contrato TypeScript da migration 9005.
 *
 * ARQUIVO NOVO, e não um acréscimo a `lib/schemas/settings.ts`, porque aquele é
 * do upstream e a política de fork deste repo é "customização só em arquivo
 * novo": o que se escreve lá conflita em todo merge com `melgarafael/DeskcommCRM`,
 * que faz ~60 commits por dia.
 *
 * `canonicalConversationTagsSchema` continua onde estava e não muda de forma —
 * a rota `GET /api/v1/conversation-tags` e o seletor do Inbox dependem dela, e
 * as quatro chaves desta feature são todas `array de text`, o mesmo formato.
 */
import { z } from "zod";

import { conversationTagSchema } from "./messaging";

/**
 * Os dois vocabulários, e eles continuam dois.
 *
 * `conversations.tags` é a etiqueta do ATENDIMENTO (dúvida, troca, urgente);
 * `contacts.tags` é a etiqueta da PESSOA (vip, inadimplente). São distintos de
 * propósito — o comentário de `components/inbox/ContactTagsEditor.tsx` já dizia
 * isso — e esta tela cura os dois lado a lado sem fundi-los.
 */
export const ESCOPOS_DE_TAG = ["conversa", "contato"] as const;
export type EscopoDeTag = (typeof ESCOPOS_DE_TAG)[number];
export const escopoDeTagSchema = z.enum(ESCOPOS_DE_TAG);

/**
 * A MESMA régua do Inbox: `conversationTagSchema` faz trim + lowercase + 40.
 *
 * Reusar em vez de reescrever não é economia de linha. Uma régua própria aqui
 * deixaria a curadoria gravar `Urgente` como canônica, e o editor do Inbox (que
 * faz lowercase antes de comparar) nunca casaria a sugestão com o que o
 * atendente digita — a etiqueta apareceria na lista e não funcionaria ao ser
 * clicada. A função SQL normaliza de novo, porque RPC é alcançável por qualquer
 * pessoa logada e schema de cliente não é fronteira.
 */
export const nomeDeTagSchema = conversationTagSchema;

/** Teto de 50, o mesmo de `canonicalConversationTagsSchema`. Ver a migration. */
const LIMITE_VOCABULARIO = 50;

export const tagEmUsoSchema = z.object({
  tag: z.string(),
  n: z.coerce.number().int().nonnegative(),
});
export type TagEmUso = z.infer<typeof tagEmUsoSchema>;

/**
 * Um vocabulário como a tela precisa dele.
 *
 * `.catch([])` em cada lista pelo mesmo motivo que o schema do upstream tem:
 * uma organização que nunca gravou a chave (três das quatro desta instalação,
 * medido em 18/09) devolve `undefined`, e um campo obrigatório transformaria
 * "ainda não curei nada" em erro de tela.
 */
export const vocabularioSchema = z.object({
  canonicas: z.array(z.string()).max(LIMITE_VOCABULARIO).catch([]),
  arquivadas: z.array(z.string()).max(LIMITE_VOCABULARIO).catch([]),
  em_uso: z.array(tagEmUsoSchema).catch([]),
});
export type Vocabulario = z.infer<typeof vocabularioSchema>;

/** O corpo de `fn_tags_inventario`. */
export const inventarioDeTagsSchema = z.object({
  conversa: vocabularioSchema,
  contato: vocabularioSchema,
  /**
   * A etiqueta `cliente` está reservada nesta organização?
   *
   * A tela precisa saber ANTES de desenhar os botões: oferecer "renomear" numa
   * etiqueta que o servidor vai recusar é prometer o que não se cumpre, e o
   * operador só descobriria depois de digitar o nome novo e confirmar.
   */
  cliente_pela_agenda: z.boolean().catch(false),
});
export type InventarioDeTags = z.infer<typeof inventarioDeTagsSchema>;

/**
 * Códigos, e não frases — a tela traduz (pt-BR/es).
 *
 * Mesma decisão de `definirClientePelaAgenda`: uma frase pronta no servidor
 * chegaria em português a quem usa o produto em espanhol.
 */
export type ErroDeCuradoria =
  | "sessao"
  | "somente_leitura"
  | "sem_empresa"
  | "sem_permissao"
  | "mfa"
  | "nome_invalido"
  | "destino_ja_existe"
  | "etiqueta_do_sistema"
  | "limite"
  | "tente_de_novo"
  | "falha";

export type RespostaDeCuradoria =
  | { ok: true; registros: number; motivo?: string }
  | { ok: false; erro: ErroDeCuradoria };

/**
 * A tradução de erro do Postgres para código de tela, num lugar só.
 *
 * Com o `switch` repetido nas cinco actions, a sexta esqueceria um caso e o
 * operador receberia "Não consegui salvar" onde o banco tinha dito exatamente
 * o que estava errado — que é a diferença entre um erro que ensina e um que
 * manda tentar de novo para sempre.
 */
export function erroDeCuradoria(code: string | undefined, message: string): ErroDeCuradoria {
  if (message.includes("tags_etiqueta_do_sistema")) return "etiqueta_do_sistema";
  if (message.includes("tags_destino_ja_existe")) return "destino_ja_existe";
  if (message.includes("tags_mfa_required")) return "mfa";
  if (message.includes("tags_limite")) return "limite";
  if (message.includes("tags_nome_invalido") || message.includes("tags_escopo_invalido")) {
    return "nome_invalido";
  }
  if (code === "42501") return "sem_permissao";
  // As três que voltam a transação inteira — nada foi gravado e tentar de novo
  // resolve. Mesma lista de `definirClientePelaAgenda`: prazo de statement do
  // papel `authenticated` (0243), deadlock escolhido pelo Postgres, e conflito
  // de serialização.
  if (code === "55P03" || code === "40P01" || code === "40001") return "tente_de_novo";
  return "falha";
}
