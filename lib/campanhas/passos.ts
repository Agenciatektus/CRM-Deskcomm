/**
 * OS PASSOS DA CAMPANHA — do 2º toque em diante.
 *
 * ═══ Por que a campanha não ganha motor nenhum ═══
 *
 * A cadência já resolveu isto, e resolveu SEM motor próprio: `lib/regua/timeline.ts`
 * converte a lista de passos num grafo linear e quem executa é o motor de
 * follow-up (o mesmo claim com SKIP LOCKED, o mesmo CAS por `revision`, a mesma
 * reação à resposta). A cadência é "um pointer de follow-up com
 * `surface='cadence'`"; a campanha passa a ser um pointer com
 * `surface='campaign'` (migration 9035). Nada aqui agenda, envia ou espera —
 * este módulo só valida a lista e a entrega ao conversor.
 *
 * ═══ Por que a PRIMEIRA mensagem não é um passo ═══
 *
 * Ela continua sendo o `rendered_body` congelado na preparação e enviado pelo
 * `campaign-worker` (`lib/campanhas/rodada.ts`). É isso que faz o operador ver,
 * destinatário por destinatário, o texto exato antes de apertar Iniciar — a
 * prévia da campanha é a promessa do produto. Transformá-la no primeiro nó do
 * grafo jogaria essa prévia fora para ganhar simetria.
 *
 * Então a lista daqui é o 2º toque em diante, e o destinatário entra na régua
 * quando a 1ª mensagem SAI com sucesso. Campanha sem passos não publica régua
 * nenhuma e se comporta exatamente como antes desta fatia.
 */
import { z } from "zod";

import { ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS, type PassoDaRegua } from "@/lib/regua/timeline";
import { VARIANTE_TAMANHO_MAXIMO, spintaxValido } from "@/lib/texto/variacao";

/**
 * Teto de passos por campanha. Vinte é largo para a régua real (abordagem,
 * espera, lembrete, espera, etiqueta) e estreito o bastante para o grafo
 * publicado não virar um documento de centenas de nós que ninguém revisa.
 */
export const MAX_PASSOS_DA_CAMPANHA = 20;

/** Variações por passo de mensagem — o mesmo teto do passo da cadência. */
export const MAX_VARIANTES_DO_PASSO = 10;

const idDoPasso = z
  .string()
  .trim()
  .min(1)
  .max(40)
  // Vira id de NÓ no grafo publicado, e as arestas são montadas por
  // concatenação (`a->b`): um id com seta ou espaço produziria aresta que o
  // `timelineDoGrafo` não consegue ler de volta.
  .regex(/^[a-zA-Z0-9_-]+$/, "O identificador do passo aceita letras, números, hífen e sublinhado.");

const varianteDoPasso = z
  .string()
  .trim()
  .min(1)
  .max(VARIANTE_TAMANHO_MAXIMO)
  .refine(spintaxValido, { message: "O {a|b} desta variação não fecha. Confira as chaves." });

export const passoDaCampanhaSchema = z.discriminatedUnion("tipo", [
  z.strictObject({
    id: idDoPasso,
    tipo: z.literal("mensagem"),
    variantes: z.array(varianteDoPasso).min(1).max(MAX_VARIANTES_DO_PASSO),
  }),
  z.strictObject({
    id: idDoPasso,
    tipo: z.literal("espera"),
    // As MESMAS bordas que o nó `wait` do motor aceita. Validar aqui, e não
    // deixar o `grafoDaTimeline` aparar com `Math.min`, é a diferença entre o
    // operador ver "a espera máxima é de 90 dias" e ele gravar 400 dias, não
    // ver erro nenhum e descobrir meses depois que a régua andou em 90.
    duracaoMs: z.number().int().min(ESPERA_MINIMA_MS).max(ESPERA_MAXIMA_MS),
  }),
  z.strictObject({
    id: idDoPasso,
    tipo: z.literal("mover_etapa"),
    stageId: z.string().uuid(),
  }),
  z.strictObject({
    id: idDoPasso,
    tipo: z.literal("etiqueta"),
    op: z.enum(["add", "remove"]),
    tag: z.string().trim().min(1).max(60),
  }),
]);

export const passosDaCampanhaSchema = z
  .array(passoDaCampanhaSchema)
  .max(MAX_PASSOS_DA_CAMPANHA)
  .refine((passos) => new Set(passos.map((p) => p.id)).size === passos.length, {
    message: "Dois passos com o mesmo identificador: um deles sobrescreveria o outro no grafo.",
  });

/**
 * O que está gravado em `campaigns.passos`, lido sem NUNCA lançar.
 *
 * Jsonb inválido (mão humana, versão antiga, migração pela metade) devolve lista
 * VAZIA em vez de derrubar a rodada de envio: campanha sem passos é um estado
 * legítimo e inteiramente funcional, e falhar aqui pararia o envio da 1ª
 * mensagem por causa de um passo mal gravado. Quem recusa passo inválido é o
 * Zod da rota, com o operador na tela.
 */
export function passosGuardados(valor: unknown): PassoDaRegua[] {
  const lido = passosDaCampanhaSchema.safeParse(valor ?? []);
  return lido.success ? lido.data : [];
}

/**
 * O que impede estes passos de ir ao ar — frase pronta, ou `null`.
 *
 * Roda no gate de `faltaParaEnviar` (preparar, iniciar, agendar e testar), e não
 * só na publicação da régua: campanha que entra em `preparing`, grava a lista
 * inteira e só então descobre que falta o funil é três escritas para dizer o que
 * se sabia antes da primeira.
 */
export function problemaNosPassos(
  passos: readonly PassoDaRegua[],
  contexto: { pipelineId: string | null },
): string | null {
  if (passos.length === 0) return null;
  // FUNIL OBRIGATÓRIO A PARTIR DAQUI, e só a partir daqui. "Mover de etapa" e
  // "etiqueta" agem sobre o NEGÓCIO no funil da régua, e um pointer sem
  // `pipeline_id` faz o passo falhar no envio — longe de quem poderia
  // consertá-lo. Campanha sem passos segue sem funil, como sempre.
  if (!contexto.pipelineId) {
    return (
      "Escolha o funil da campanha antes de usar passos: mover de etapa e etiquetar agem " +
      "sobre o card do negócio, e sem funil não há card."
    );
  }
  for (const [i, passo] of passos.entries()) {
    const n = i + 1;
    if (passo.tipo === "mensagem") {
      const uteis = passo.variantes.map((v) => v.trim()).filter((v) => v !== "");
      if (uteis.length === 0) return `Passo ${n}: escreva a mensagem.`;
      const quebradas = uteis.map((v, j) => (spintaxValido(v) ? -1 : j + 1)).filter((j) => j > 0);
      if (quebradas.length > 0) {
        return `Passo ${n}, variação ${quebradas.join(", ")}: o {a|b} não fecha.`;
      }
    }
    if (passo.tipo === "mover_etapa" && passo.stageId.trim() === "") {
      return `Passo ${n}: escolha a etapa de destino.`;
    }
    if (passo.tipo === "etiqueta" && passo.tag.trim() === "") {
      return `Passo ${n}: escreva a etiqueta.`;
    }
  }
  // Régua que começa movendo de etapa, etiquetando ou esperando é legítima — o
  // operador pode querer marcar quem recebeu a abordagem antes de insistir.
  // O que não é legítimo é régua SEM nenhuma mensagem: ela não fala com
  // ninguém, e o teto de inscrições do dia seria gasto para nada.
  if (!passos.some((p) => p.tipo === "mensagem")) {
    return "A régua precisa de pelo menos uma mensagem. Os outros passos não falam com ninguém.";
  }
  return null;
}
