import type { Message } from "@/lib/types/messaging";

/**
 * De quem saiu esta linha, como a bolha escreve acima dela.
 *
 * Saiu de `MessageBubble.tsx` quando a bolha foi dividida (visual v2, fase
 * 3.5): o rótulo continua decidido num lugar só, e é ESTE arquivo que
 * `tests/unit/rotulo-de-origem-tem-emissor.test.ts` varre para casar cada
 * `sent_via` nomeado com alguém que o grava.
 *
 * `external_device` é a resposta pelo CELULAR — o operador atendeu pelo
 * WhatsApp do telefone, fora do CRM, e o ingest carimba aqui. Antes isto
 * voltava null para tudo que não fosse IA, e a bolha ficava sem nome: o dono
 * lia a conversa como se tudo tivesse sido digitado no CRM. Os rótulos passam
 * por t() no render (ver dicionario.ts para o espanhol).
 *
 * `'automation'` é a categoria de quem não é pessoa nem IA: regra de
 * automação, texto fixo do follow-up e lembrete de agenda (#652, decidida pelo
 * mantenedor em 16/09). O carimbo vive em `origemDaMensagem`
 * (`app/api/v1/messages/_handler.ts`) e o par é vigiado nas duas direções.
 *
 * `viewerUserId` é QUEM está lendo. A coluna `sent_via='user'` só diz "um
 * humano digitou no CRM", nunca QUAL; sem o id, uma organização com dois
 * atendentes mostrava "Você" nas mensagens do colega.
 */
export function rotuloDaAutoria(
  message: Message,
  viewerUserId: string | null | undefined,
  t: (texto: string) => string,
): string | null {
  if (message.direction !== "outbound") return null;
  // #1613: a autoria "em nome de" sobe a MESA. Quem apertou foi o token, mas
  // quem decidiu foi uma pessoa no outro sistema — sem este ramo a conversa
  // leria "Sistema" e perderia quem mandou. Os nomes vêm GRAVADOS na própria
  // linha (`metadata.sent_on_behalf`, escrito pelo handler), porque o balão
  // não faz join: o que não está na linha não aparece em lugar nenhum.
  const emNomeDe = message.sent_on_behalf_of_user_id
    ? (message.metadata?.sent_on_behalf as
        | { user_name?: string | null; token_name?: string | null }
        | undefined)
    : undefined;
  if (emNomeDe) {
    const nome = emNomeDe.user_name?.trim() || t("Atendente");
    // "Fulano · via {token}": só a palavra "via" passa por `t()`; os nomes
    // são dado do operador e saem como cadastrados — traduzir nome próprio é
    // o mesmo erro de #1046.
    return emNomeDe.token_name ? `${nome} · ${t("via")} ${emNomeDe.token_name}` : nome;
  }
  if (message.sent_via === "ai") return "IA";
  // A REGRA falou, e não a IA: texto fixo de automação, follow-up ou lembrete
  // de agenda (#652). O ramo passou a existir porque o valor passou a ser
  // gravado — antes dele, um rótulo aqui seria promessa sem dado atrás.
  if (message.sent_via === "automation") return "Automação";
  // A integração falou, a IA não. Sem este ramo a bolha omite a autoria e o
  // dono lê a conversa como se tudo tivesse saído do CRM (o defeito do #866).
  if (message.sent_via === "system") return "Sistema";
  if (message.sent_via === "external_device") return "Celular";
  if (message.sent_via === "user" || message.sent_via === "crm") {
    // "Você" exige as DUAS pontas: saber quem lê e saber quem enviou. Falta
    // qualquer uma, o rótulo cai para "Atendente" — que continua dizendo o
    // que `sent_via` de fato garante (um humano, pelo CRM) sem afirmar uma
    // identidade que o dado não sustenta.
    return viewerUserId != null && message.sent_by_user_id === viewerUserId ? "Você" : "Atendente";
  }
  return null;
}

/**
 * Quanto espaço a hora (e os tiques) ocupam no fim da última linha do texto.
 *
 * A meta fica DENTRO da bolha, no canto de baixo, como no WhatsApp: o texto
 * termina com um espaçador invisível desta largura, e a meta flutua por cima
 * dele. Se a última linha é curta, a hora cabe ao lado; se é cheia, o
 * espaçador quebra para a linha de baixo e a hora desce junto, sem nunca
 * cobrir texto. As classes são literais porque o Tailwind só gera o que lê.
 */
const LARGURAS = ["w-10", "w-12", "w-14", "w-16", "w-20", "w-24", "w-28", "w-32", "w-36"] as const;
const PASSOS = [10, 12, 14, 16, 20, 24, 28, 32, 36];

export function larguraDaMeta(f: {
  tiques: boolean;
  editada: boolean;
  falhou: boolean;
  citacoes: boolean;
}): string {
  const n = 10 + (f.tiques ? 4 : 0) + (f.editada ? 11 : 0) + (f.falhou ? 13 : 0) + (f.citacoes ? 5 : 0);
  const i = PASSOS.findIndex((p) => p >= n);
  return LARGURAS[i < 0 ? LARGURAS.length - 1 : i]!;
}
