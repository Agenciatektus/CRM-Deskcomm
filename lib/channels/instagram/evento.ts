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

/**
 * O que a CONVERSA é, para o filtro do Inbox. `story` não entra aqui de
 * propósito: resposta a story é Direct e cai na mesma conversa de DM — ver a
 * nota na migration 9011.
 */
export type EntradaDaConversa = "direct" | "comentario";

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
  /**
   * O @ de quem escreveu, quando o evento traz. O comentário traz; o Direct
   * não. Serve para exibir e buscar — a identidade é sempre o IGSID.
   */
  username: string | null;
  /** Em qual conversa isto cai. Comentário não se mistura com DM no Inbox. */
  conversa: EntradaDaConversa;
  /**
   * Só em comentário: o post onde ele foi deixado. O atendente precisa saber a
   * qual publicação a pergunta se refere — sem isso, "quanto custa?" sem
   * contexto é impossível de responder.
   */
  mediaId: string | null;
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

/** Corpo de mensagem: preserva o que a pessoa escreveu, espaços inclusive. */
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * IDENTIFICADOR — e por que ele não pode ser o mesmo `texto()` acima.
 *
 * A primeira versão validava `v.trim() !== ""` e devolvia `v` SEM trimar. Para
 * corpo de mensagem isso está certo: o espaço que a pessoa digitou é dela. Para
 * identidade é um defeito com dois efeitos concretos, os dois silenciosos:
 *
 *   `" 178…"` ≠ `"178…"` para o índice único parcial da 9010 → a MESMA pessoa
 *   vira dois contatos;
 *
 *   `" mid-1"` ≠ `"mid-1"` na chave de idempotência → e a fila da Verdash
 *   REENTREGA por desenho, então a mensagem duplica na conversa do cliente.
 *
 * O teto de tamanho é a segunda metade: id da Meta tem dezenas de caracteres, e
 * aceitar quilobytes aqui deixaria um payload hostil escrever lixo longo numa
 * coluna indexada.
 */
const TETO_DO_IDENTIFICADOR = 255;

function identificador(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.trim();
  if (limpo === "" || limpo.length > TETO_DO_IDENTIFICADOR) return null;
  return limpo;
}

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * O `@`, normalizado para a forma que a busca usa.
 *
 * O índice da 9010 é sobre `lower(instagram_username)`. Gravar
 * `"  @Peter Machado  "` como veio faz a busca por `peter` não achar ninguém —
 * o dado está lá e a tela diz que não está, que é a pior combinação.
 */
/**
 * Handle do Instagram: letras, números, ponto e sublinhado. Nada mais.
 *
 * A primeira versão só trimava e baixava a caixa, e com isso `"a
b"` e
 * `"peter machado"` — com espaço no MEIO — eram aceitos como `@`. Handle do
 * Instagram não tem espaço nem quebra de linha: o que não casa com a forma não
 * é um `@`, é lixo, e gravá-lo como se fosse suja a busca e a tela.
 */
const FORMA_DO_HANDLE = /^[a-z0-9._]+$/;

function arroba(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.trim().replace(/^@+/, "").toLowerCase();
  if (limpo === "" || limpo.length > TETO_DO_IDENTIFICADOR) return null;
  return FORMA_DO_HANDLE.test(limpo) ? limpo : null;
}

/**
 * A Meta manda `timestamp` em MILISSEGUNDOS no messaging do Instagram.
 *
 * Tratar como segundos põe a mensagem em 1970 e ela some do topo do Inbox —
 * falha silenciosa, porque a linha existe e está gravada. Quando o campo não
 * vem ou não é número, o relógio do servidor é melhor que uma data errada.
 */
/**
 * Folga para relógio dessincronizado. A Meta e a nossa máquina não marcam a
 * mesma hora ao milissegundo, e recusar por segundos de diferença jogaria
 * mensagem legítima para o fim da fila do Inbox.
 */
const FOLGA_DE_RELOGIO_MS = 5 * 60_000;

export function dataDoEvento(v: unknown, agora: string): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return agora;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return agora;

  // O teto abaixo compara contra `agora`. Se `agora` vier malformado,
  // `Date.parse` devolve NaN, `x > NaN` é FALSO, e a rede de segurança
  // simplesmente não se aplica — medido: com `agora = "ontem"`, um timestamp
  // de 5138 passava inteiro. Guarda que depende de outro input estar bem
  // formado não é guarda.
  const limite = Date.parse(agora);
  if (!Number.isFinite(limite)) return new Date().toISOString();

  // TETO NO FUTURO. A defesa contra o erro de unidade (segundos lidos como ms →
  // 1970) já existia; o erro simétrico ficou aberto e é pior. O Inbox ordena por
  // `last_message_at desc`: uma data em 5138 fixa a conversa no topo PARA
  // SEMPRE, e nenhuma mensagem legítima a desloca. Não há como o atendente
  // consertar isso pela tela.
  if (d.getTime() > limite + FOLGA_DE_RELOGIO_MS) return agora;
  return d.toISOString();
}

export function lerEventoDoInstagram(corpo: unknown, agora: string): LeituraDoEvento {
  const envelope = objeto(corpo);
  if (!envelope) return { ok: false, motivo: "contrato_violado", detalhe: "corpo não é objeto" };

  const tipo = texto(envelope.tipo);
  if (!tipo) return { ok: false, motivo: "contrato_violado", detalhe: "sem `tipo`" };

  // Recibo de leitura não é mensagem de ninguém: ele diz que ALGUÉM LEU. Criar
  // conversa a partir disso encheria o Inbox de conversas vazias.
  if (tipo === "leitura") return { ok: false, motivo: "ignorar", detalhe: "recibo de leitura" };

  // ─── Comentário: APARECE no Inbox, mas NÃO vira lead ──────────────────────
  //
  // As duas metades são decisão de produto, e uma sem a outra estaria errada:
  //
  //   não vira lead  → quem comenta "que lindo 😍" não pediu atendimento, e
  //                    virar card encheria o Kanban de ruído para o vendedor
  //                    limpar à mão;
  //   aparece no Inbox → alguém precisa responder, seja a pessoa ou a IA, e o
  //                    que não aparece não é respondido.
  //
  // Isso só cabe porque conversa e lead são entidades SEPARADAS neste schema.
  // Quem decide a segunda metade é a ingestão, que chama
  // `garantirLeadDaConversa` para Direct e não chama para comentário.
  if (tipo === "comentario") return lerComentario(envelope, agora);

  if (tipo !== "direct") {
    // O `tipo` é TRUNCADO e sem caractere de controle: ele vem de fora, e um
    // valor com quebra de linha forjaria uma linha inteira de log se este texto
    // for registrado como string solta.
    const seguro = tipo.replace(/[\u0000-\u001f]/g, " ").slice(0, 64);
    return { ok: false, motivo: "ignorar", detalhe: `tipo não tratado: ${seguro}` };
  }

  const evento = objeto(envelope.evento);
  if (!evento) return { ok: false, motivo: "contrato_violado", detalhe: "`evento` ausente" };

  const remetente = objeto(evento.sender);
  const igsid = identificador(remetente?.id);
  if (!igsid) return { ok: false, motivo: "contrato_violado", detalhe: "sem `sender.id`" };

  const mensagem = objeto(evento.message);
  if (!mensagem) return { ok: false, motivo: "contrato_violado", detalhe: "sem `message`" };

  // O id da Meta é a chave de idempotência. Sem ele não há como reconhecer a
  // reentrega, e a fila REENTREGA por desenho — melhor recusar e investigar que
  // gravar a mesma mensagem duas vezes na conversa do cliente.
  const providerMessageId = identificador(envelope.provider_message_id) ?? identificador(mensagem.mid);
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
  // `objeto(...)` e não truthy: a Meta manda um OBJETO em `story`. Aceitar
  // qualquer verdadeiro deixaria `story: "x"` de um payload forjado mudar a
  // origem que a tela mostra ao atendente.
  const entrada: EntradaDoInstagram = objeto(respostaA?.story) ? "story" : "direct";

  return {
    ok: true,
    mensagem: {
      igsid,
      contaId: identificador(objeto(evento.recipient)?.id),
      providerMessageId,
      texto: corpoTexto,
      temAnexo: anexos.length > 0,
      entrada,
      recebidaEm: dataDoEvento(evento.timestamp, agora),
      adId: identificador(envelope.ad_id),
      // O Direct não traz o @: a Meta manda só o IGSID. Quem quiser exibir o @
      // busca no Graph depois — mentir um aqui seria pior que não ter.
      username: null,
      conversa: "direct",
      mediaId: null,
    },
  };
}

/**
 * O comentário tem forma PRÓPRIA — `{ field, value }`, e não `sender`/`message`
 * como o Direct. Escrever um parser só para os dois formatos faria uma função
 * cheia de `if` perguntando de que tipo é o objeto que ela mesma acabou de
 * receber tipado.
 *
 * Ele traz duas coisas que o Direct NÃO traz, e as duas importam:
 *   `from.username` → o @, que no Direct só se descobre com uma chamada extra;
 *   `value.id`      → o id do comentário, que é o que permite responder a ELE.
 */
function lerComentario(envelope: Record<string, unknown>, agora: string): LeituraDoEvento {
  const evento = objeto(envelope.evento);
  const valor = objeto(evento?.value);
  if (!valor) return { ok: false, motivo: "contrato_violado", detalhe: "comentário sem `value`" };

  const de = objeto(valor.from);
  const igsid = identificador(de?.id);
  if (!igsid) return { ok: false, motivo: "contrato_violado", detalhe: "comentário sem `from.id`" };

  // O id do comentário é a chave de idempotência E o alvo da resposta. Sem ele
  // não há como responder nem como reconhecer a reentrega.
  const comentarioId = identificador(valor.id) ?? identificador(envelope.provider_message_id);
  if (!comentarioId) return { ok: false, motivo: "contrato_violado", detalhe: "comentário sem id" };

  const corpoTexto = texto(valor.text);
  if (!corpoTexto) {
    // Comentário só com emoji ou só com menção chega sem `text`. Não há o que
    // responder, e listá-lo gastaria a atenção do atendente à toa.
    return { ok: false, motivo: "ignorar", detalhe: "comentário sem texto" };
  }

  return {
    ok: true,
    mensagem: {
      igsid,
      contaId: null,
      providerMessageId: comentarioId,
      texto: corpoTexto,
      temAnexo: false,
      entrada: "comentario",
      recebidaEm: dataDoEvento(valor.timestamp ?? evento?.timestamp, agora),
      adId: identificador(envelope.ad_id),
      username: arroba(de?.username),
      conversa: "comentario",
      mediaId: identificador(objeto(valor.media)?.id),
    },
  };
}
