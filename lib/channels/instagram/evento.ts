/**
 * O evento do Instagram que chega da Verdash — lido, não adivinhado.
 *
 * ─── Por que um parser PURO, separado da escrita ────────────────────────────
 * A ingestão do WhatsApp (`lib/waha/ingest.ts`) mistura leitura e escrita em
 * 1.100 linhas, e por isso quase nada dela é testável sem um banco. Aqui a
 * decisão "o que é este evento" não toca banco nenhum: entra JSON, sai um
 * objeto tipado ou uma recusa nomeada. O que grava vive em `ingest.ts` e recebe
 * isto já resolvido.
 *
 * ─── O envelope é da Verdash, o miolo é da Meta ─────────────────────────────
 * Quem entrega é a edge `crm-reenviar-webhook`, e ela embrulha o evento cru da
 * Meta assim:
 *
 *   { tipo, provider_message_id, ad_id, evento: { …payload da Meta… } }
 *
 * `tipo` é vocabulário da Verdash (`direct`, `comentario`, `leitura`), e é por
 * ele que se decide — não por adivinhar a forma do miolo. Um `tipo` novo que
 * este código não conheça é ignorado com 200, nunca tratado como erro: a fila
 * da Verdash reentrega o que não recebe 200, e recusar um evento que nunca vai
 * servir faria a reentrega durar para sempre.
 */

/** De onde a conversa nasceu. Vai para a tela: o atendente precisa saber. */
export type EntradaDoInstagram = "direct" | "story" | "comentario";

export interface MensagemDoInstagram {
  /** Id estável do par (conta, pessoa). É a IDENTIDADE — o @ muda, este não. */
  igsid: string;
  /** A conta da agência/cliente que recebeu. */
  contaId: string | null;
  /** Id da mensagem na Meta. Serve de chave de idempotência. */
  providerMessageId: string;
  texto: string | null;
  /** `true` quando veio mídia sem texto: a tela precisa dizer algo ao atendente. */
  temAnexo: boolean;
  entrada: EntradaDoInstagram;
  /** ISO-8601. A Meta manda milissegundos. */
  recebidaEm: string;
  /** Quando o Direct nasceu de um anúncio. Alimenta a atribuição. */
  adId: string | null;
}

export type LeituraDoEvento =
  | { ok: true; mensagem: MensagemDoInstagram }
  /**
   * `ignorar` NÃO é erro. Recibo de leitura, comentário e tipo desconhecido
   * caem aqui, e a rota responde 200 — ver a nota sobre reentrega acima.
   */
  | { ok: false; motivo: "ignorar"; detalhe: string }
  /** O envelope veio quebrado. Isso é defeito, e quem investiga precisa saber. */
  | { ok: false; motivo: "contrato_violado"; detalhe: string };

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * A Meta manda `timestamp` em MILISSEGUNDOS no messaging do Instagram.
 *
 * Tratar como segundos põe a mensagem em 1970 e ela some do topo do Inbox —
 * falha silenciosa, porque a linha existe e está gravada. Quando o campo não
 * vem ou não é número, o relógio do servidor é melhor que uma data errada.
 */
export function dataDoEvento(v: unknown, agora: string): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return agora;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? agora : d.toISOString();
}

export function lerEventoDoInstagram(corpo: unknown, agora: string): LeituraDoEvento {
  const envelope = objeto(corpo);
  if (!envelope) return { ok: false, motivo: "contrato_violado", detalhe: "corpo não é objeto" };

  const tipo = texto(envelope.tipo);
  if (!tipo) return { ok: false, motivo: "contrato_violado", detalhe: "sem `tipo`" };

  // Recibo de leitura não é mensagem de ninguém: ele diz que ALGUÉM LEU. Criar
  // conversa a partir disso encheria o Inbox de conversas vazias.
  if (tipo === "leitura") return { ok: false, motivo: "ignorar", detalhe: "recibo de leitura" };

  // Comentário é INTERAÇÃO PÚBLICA, e de propósito não vira conversa nem lead —
  // a mesma regra que a Verdash já aplica do lado dela. Alguém que comenta
  // "que lindo 😍" num post não pediu atendimento, e transformar isso em card no
  // funil enche o Kanban de ruído que o vendedor tem de limpar à mão. Quem
  // responde comentário responde pela Verdash, onde ele aparece como interação.
  if (tipo === "comentario") return { ok: false, motivo: "ignorar", detalhe: "comentário é interação, não conversa" };

  if (tipo !== "direct") return { ok: false, motivo: "ignorar", detalhe: `tipo não tratado: ${tipo}` };

  const evento = objeto(envelope.evento);
  if (!evento) return { ok: false, motivo: "contrato_violado", detalhe: "`evento` ausente" };

  const remetente = objeto(evento.sender);
  const igsid = texto(remetente?.id);
  if (!igsid) return { ok: false, motivo: "contrato_violado", detalhe: "sem `sender.id`" };

  const mensagem = objeto(evento.message);
  if (!mensagem) return { ok: false, motivo: "contrato_violado", detalhe: "sem `message`" };

  // O id da Meta é a chave de idempotência. Sem ele não há como reconhecer a
  // reentrega, e a fila REENTREGA por desenho — melhor recusar e investigar que
  // gravar a mesma mensagem duas vezes na conversa do cliente.
  const providerMessageId = texto(envelope.provider_message_id) ?? texto(mensagem.mid);
  if (!providerMessageId) {
    return { ok: false, motivo: "contrato_violado", detalhe: "sem id de mensagem" };
  }

  const anexos = Array.isArray(mensagem.attachments) ? mensagem.attachments : [];
  const corpoTexto = texto(mensagem.text);
  if (!corpoTexto && anexos.length === 0) {
    // Sem texto e sem anexo não há o que mostrar. Acontece com evento de
    // edição e com reação — nenhum dos dois é mensagem nova.
    return { ok: false, motivo: "ignorar", detalhe: "mensagem sem conteúdo" };
  }

  // Resposta a story chega como Direct com `reply_to.story`. É Direct para todos
  // os efeitos, mas a ORIGEM importa na tela: "respondeu seu story" e "mandou
  // uma DM do nada" são conversas com temperatura diferente, e o atendente abre
  // as duas de jeitos diferentes.
  const respostaA = objeto(mensagem.reply_to);
  const entrada: EntradaDoInstagram = respostaA?.story ? "story" : "direct";

  return {
    ok: true,
    mensagem: {
      igsid,
      contaId: texto(objeto(evento.recipient)?.id),
      providerMessageId,
      texto: corpoTexto,
      temAnexo: anexos.length > 0,
      entrada,
      recebidaEm: dataDoEvento(evento.timestamp, agora),
      adId: texto(envelope.ad_id),
    },
  };
}
