/**
 * O que a mensagem do WhatsApp É, além de texto e mídia — módulo PURO.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * O parser do canal só conhecia texto e os cinco campos de mídia. Todo o resto
 * caía no mesmo lugar: `type='text'`, `body` nulo, nenhuma mídia. O atendente
 * via um balão VAZIO, só com a hora — e a IA recebia uma "mensagem" sem texto.
 *
 * Caso que trouxe o problema (Delicatto, 10/10/2026): a cliente EDITOU uma
 * mensagem duas vezes. Cada edição chega do FZAP como um evento `Message` novo,
 * com ID próprio, carregando `protocolMessage` tipo 14 (MESSAGE_EDIT) que
 * aponta para a original. O CRM gravou cada edição como mensagem nova e vazia,
 * e a original continuou com o texto antigo.
 *
 * Medido no arquivo de webhook dos últimos 7 dias, as linhas vazias eram:
 * `protocolMessage` (edição 14, apagada 0 e sinais de sistema 3/4/6/7/17/18),
 * `reactionMessage`, `albumMessage`, `contactMessage`, `locationMessage`,
 * `interactiveMessage`, `templateMessage`, `buttonsMessage`,
 * `associatedChildMessage` e `placeholderMessage`.
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 *
 * Nenhum evento vira balão vazio. Ou ele ALTERA uma mensagem que já existe
 * (edição, apagada), ou não é conversa e é ignorado com motivo (sinal de
 * protocolo, anúncio de álbum), ou vira mensagem com o tipo certo. O que ainda
 * não sabemos ler entra com `metadata.tipo_nao_suportado` — a tela usa isso
 * para dizer "veja no celular" em vez de mostrar nada.
 */
import { corpoDaLocalizacao, lerLocalizacao } from "@/lib/messaging/localizacao";

export type VerdashAlteracao =
  | { acao: "editar"; alvo: string; texto: string }
  | { acao: "apagar"; alvo: string };

export interface ConteudoEspecial {
  /** Vocabulário de `messages.type` (o CHECK do banco não conhece outros). */
  tipo: "text" | "location" | "contact" | "reaction";
  texto: string | null;
  /** Vai para `messages.metadata`. */
  extra: Record<string, unknown>;
}

export type LeituraEspecial =
  | { caso: "alteracao"; alteracao: VerdashAlteracao }
  | { caso: "ignorar"; motivo: string }
  | { caso: "conteudo"; conteudo: ConteudoEspecial };

/** `protocolMessage.type` do WhatsApp (vem como número ou como nome). */
const PROTOCOLO_APAGAR = new Set<unknown>([0, "0", "REVOKE"]);
const PROTOCOLO_EDITAR = new Set<unknown>([14, "14", "MESSAGE_EDIT"]);

/** Chaves que acompanham a mensagem sem SER a mensagem. */
const CHAVES_DE_SERVICO = new Set(["messageContextInfo", "senderKeyDistributionMessage"]);

const CAMPOS_COM_LEGENDA = ["imageMessage", "videoMessage", "documentMessage", "ptvMessage"];

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** O texto da mensagem, onde quer que ele esteja. */
export function textoDe(message: Record<string, unknown>): string | null {
  return (
    str(message.conversation) ??
    str(obj(message.extendedTextMessage).text) ??
    str(message.text) ??
    null
  );
}

/** O id da mensagem-alvo em `key` (o protobuf em JSON usa `ID`; versões antigas, `id`). */
function alvoDe(key: unknown): string | null {
  const k = obj(key);
  return str(k.ID) ?? str(k.id);
}

function lerProtocolo(pm: Record<string, unknown>): LeituraEspecial {
  const alvo = alvoDe(pm.key);
  if (PROTOCOLO_APAGAR.has(pm.type)) {
    return alvo
      ? { caso: "alteracao", alteracao: { acao: "apagar", alvo } }
      : { caso: "ignorar", motivo: "apagada_sem_alvo" };
  }
  if (PROTOCOLO_EDITAR.has(pm.type)) {
    const editada = obj(pm.editedMessage);
    const legenda = CAMPOS_COM_LEGENDA.map((c) => str(obj(editada[c]).caption)).find(Boolean) ?? null;
    const texto = textoDe(editada) ?? legenda;
    return alvo && texto
      ? { caso: "alteracao", alteracao: { acao: "editar", alvo, texto } }
      : { caso: "ignorar", motivo: "edicao_sem_alvo_ou_texto" };
  }
  // Troca de chave, sincronização, temporizador de mensagem temporária... São
  // conversas entre aparelhos, não entre pessoas. Nenhuma tem o que mostrar.
  return { caso: "ignorar", motivo: `protocolo_${String(pm.type ?? "sem_tipo")}` };
}

function conteudo(tipo: ConteudoEspecial["tipo"], texto: string | null, extra: Record<string, unknown>): LeituraEspecial {
  return { caso: "conteudo", conteudo: { tipo, texto, extra } };
}

function lerLocalizacaoDoWhatsapp(chave: string, no: Record<string, unknown>): LeituraEspecial {
  const loc = lerLocalizacao({
    latitude: no.degreesLatitude,
    longitude: no.degreesLongitude,
    name: no.name,
    address: no.address,
  });
  if (!loc) return conteudo("text", null, { tipo_nao_suportado: chave });
  return conteudo("location", corpoDaLocalizacao(loc), { location: loc, wa_tipo: chave });
}

function lerContato(message: Record<string, unknown>): LeituraEspecial | null {
  if ("contactMessage" in message) {
    const c = obj(message.contactMessage);
    return conteudo("contact", str(c.vcard) ?? str(c.displayName), { wa_tipo: "contactMessage" });
  }
  if ("contactsArrayMessage" in message) {
    const lista = obj(message.contactsArrayMessage).contacts;
    const contatos = Array.isArray(lista) ? lista.map(obj) : [];
    const primeiro = contatos[0] ?? {};
    return conteudo("contact", str(primeiro.vcard) ?? str(primeiro.displayName), {
      wa_tipo: "contactsArrayMessage",
      contatos_no_cartao: contatos.length,
    });
  }
  return null;
}

function lerEnquete(message: Record<string, unknown>): LeituraEspecial | null {
  const chave = Object.keys(message).find((k) => /^pollCreationMessage(V\d+)?$/.test(k));
  if (!chave) return null;
  const no = obj(message[chave]);
  const opcoes = Array.isArray(no.options)
    ? no.options.map((o) => str(obj(o).optionName)).filter((o): o is string => Boolean(o))
    : [];
  const pergunta = str(no.name);
  if (!pergunta && opcoes.length === 0) return conteudo("text", null, { tipo_nao_suportado: chave });
  // Sem palavra de idioma no corpo: é dado, e o agente e a prévia o leem.
  const texto = [`📊 ${pergunta ?? ""}`.trim(), ...opcoes.map((o) => `• ${o}`)].join("\n");
  return conteudo("text", texto, { wa_tipo: chave });
}

/**
 * Mensagens de empresa (botões, lista, modelo) e as respostas a elas. O texto
 * existe; só mora em outro campo. Ordem: o primeiro que tiver texto vence.
 */
function lerTextoDeEmpresa(message: Record<string, unknown>): LeituraEspecial | null {
  const candidatos: Array<[string, (no: Record<string, unknown>) => string | null]> = [
    ["interactiveMessage", (no) => str(obj(no.body).text) ?? str(obj(no.header).title)],
    ["buttonsMessage", (no) => str(no.contentText) ?? str(no.text)],
    ["templateMessage", (no) =>
      str(obj(no.hydratedTemplate).hydratedContentText) ??
      str(obj(no.hydratedFourRowTemplate).hydratedContentText)],
    ["listMessage", (no) => str(no.description) ?? str(no.title)],
    ["buttonsResponseMessage", (no) => str(no.selectedDisplayText)],
    ["listResponseMessage", (no) => str(no.title) ?? str(obj(no.singleSelectReply).selectedRowId)],
    ["templateButtonReplyMessage", (no) => str(no.selectedDisplayText)],
    ["interactiveResponseMessage", (no) => str(obj(no.body).text)],
  ];
  for (const [chave, ler] of candidatos) {
    if (!(chave in message)) continue;
    const texto = ler(obj(message[chave]));
    return texto ? conteudo("text", texto, { wa_tipo: chave }) : conteudo("text", null, { tipo_nao_suportado: chave });
  }
  return null;
}

/**
 * Lê o que NÃO é texto comum nem mídia comum.
 *
 * `null` quando a mensagem é texto ou mídia: o caminho de sempre resolve. Edição,
 * apagada e reação são avaliadas ANTES desse atalho porque a edição de uma
 * legenda pode carregar texto e, mesmo assim, não é mensagem nova.
 */
export function lerConteudoEspecial(
  message: Record<string, unknown>,
  jaTem: { texto: boolean; anexo: boolean },
): LeituraEspecial | null {
  if ("protocolMessage" in message) return lerProtocolo(obj(message.protocolMessage));

  if ("reactionMessage" in message) {
    const r = obj(message.reactionMessage);
    const emoji = str(r.text);
    // Reação com texto vazio é a pessoa TIRANDO a reação. Não há o que mostrar.
    if (!emoji) return { caso: "ignorar", motivo: "reacao_removida" };
    return conteudo("reaction", emoji, { reacao_a: alvoDe(r.key) });
  }

  // O álbum só anuncia quantas fotos vêm; cada foto chega em evento próprio.
  if ("albumMessage" in message) return { caso: "ignorar", motivo: "album_anuncia_os_filhos" };

  if (jaTem.texto || jaTem.anexo) return null;

  for (const chave of ["locationMessage", "liveLocationMessage"]) {
    if (chave in message) return lerLocalizacaoDoWhatsapp(chave, obj(message[chave]));
  }
  const especial = lerContato(message) ?? lerEnquete(message) ?? lerTextoDeEmpresa(message);
  if (especial) return especial;

  const chave = Object.keys(message).find((k) => !CHAVES_DE_SERVICO.has(k));
  if (!chave) return { caso: "ignorar", motivo: "sem_conteudo" };
  return conteudo("text", null, { tipo_nao_suportado: chave.slice(0, 60) });
}
