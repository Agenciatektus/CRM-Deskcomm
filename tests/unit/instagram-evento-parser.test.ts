// ─── O que chega do Instagram é LIDO, não adivinhado ────────────────────────
//
// Este arquivo trava o contrato entre a edge `crm-reenviar-webhook` da Verdash e
// a ingestão do CRM. Ele existe porque as três decisões abaixo são silenciosas
// quando erradas — nenhuma delas quebra nada, todas produzem dado errado:
//
//   1. comentário virar conversa enche o Kanban de card que ninguém pediu;
//   2. timestamp lido como segundos põe a mensagem em 1970 e ela some do topo
//      do Inbox, com a linha gravada e tudo;
//   3. resposta a story perder a origem faz "respondeu seu story" e "mandou DM
//      do nada" chegarem iguais ao atendente.
//
// As formas usadas aqui foram medidas em `instagram_eventos_recebidos` na
// produção da Verdash, não inventadas.

import { describe, expect, it } from "vitest";
import { dataDoEvento, lerEventoDoInstagram } from "@/lib/channels/instagram/evento";

const AGORA = "2026-09-23T12:00:00.000Z";

const direct = (extra: Record<string, unknown> = {}, msg: Record<string, unknown> = {}) => ({
  tipo: "direct",
  provider_message_id: "mid-1",
  ad_id: null,
  evento: {
    sender: { id: "igsid-abc" },
    recipient: { id: "conta-1" },
    timestamp: 1_758_500_000_000,
    message: { mid: "mid-1", text: "oi, quanto custa?", ...msg },
    ...extra,
  },
});

const comentario = () => ({
  tipo: "comentario",
  provider_message_id: "18080636444704644",
  ad_id: null,
  evento: {
    field: "comments",
    value: {
      id: "18080636444704644",
      from: { id: "1742256533557115", username: "_petermachado" },
      text: "Qual o preço e onde vejo mais modelos?",
      media: { id: "17906857182477147", media_product_type: "FEED" },
    } as Record<string, unknown>,
  },
});

describe("leitura do evento do Instagram", () => {
  it("Direct com texto vira mensagem, com a identidade no IGSID", () => {
    const r = lerEventoDoInstagram(direct(), AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.igsid).toBe("igsid-abc");
    expect(r.mensagem.texto).toBe("oi, quanto custa?");
    expect(r.mensagem.entrada).toBe("direct");
    expect(r.mensagem.providerMessageId).toBe("mid-1");
  });

  it("resposta a story guarda a ORIGEM, que é o que muda na tela", () => {
    const r = lerEventoDoInstagram(direct({}, { reply_to: { story: { id: "s1" } } }), AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.entrada).toBe("story");
  });

  it("comentário VIRA conversa (para o Inbox), com o @ e o post junto", () => {
    // A forma abaixo foi copiada de `instagram_eventos_recebidos` na produção
    // da Verdash. O comentário traz duas coisas que o Direct não traz: o @ de
    // quem escreveu e o id do post — sem o segundo, "quanto custa?" chega ao
    // atendente sem dizer de qual publicação se trata.
    const r = lerEventoDoInstagram(comentario(), AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.igsid).toBe("1742256533557115");
    expect(r.mensagem.username).toBe("_petermachado");
    expect(r.mensagem.texto).toBe("Qual o preço e onde vejo mais modelos?");
    expect(r.mensagem.mediaId).toBe("17906857182477147");
    // `providerMessageId` é o id do COMENTÁRIO: é ele que permite responder a
    // este comentário, e não a outro.
    expect(r.mensagem.providerMessageId).toBe("18080636444704644");
  });

  it("comentário cai numa conversa SEPARADA do Direct — é o que o filtro usa", () => {
    // As duas metades da decisão: aparece no Inbox (por isso vira conversa) e
    // não vira lead (por isso a conversa é de outro tipo, e a ingestão não
    // chama `garantirLeadDaConversa` para ela).
    const c = lerEventoDoInstagram(comentario(), AGORA);
    const d = lerEventoDoInstagram(direct(), AGORA);
    expect(c.ok && c.mensagem.conversa).toBe("comentario");
    expect(d.ok && d.mensagem.conversa).toBe("direct");
  });

  it("comentário sem texto (só emoji) é ignorado — não há o que responder", () => {
    const e = comentario();
    const r = lerEventoDoInstagram(
      { ...e, evento: { ...e.evento, value: { ...e.evento.value, text: undefined } } },
      AGORA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("ignorar");
  });

  it("comentário sem id é RECUSADO: sem ele não dá para responder nem deduplicar", () => {
    const e = comentario();
    const r = lerEventoDoInstagram(
      {
        ...e,
        provider_message_id: undefined,
        evento: { ...e.evento, value: { ...e.evento.value, id: undefined } },
      },
      AGORA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("contrato_violado");
  });

  it("recibo de leitura não cria conversa vazia", () => {
    const r = lerEventoDoInstagram({ tipo: "leitura", evento: {} }, AGORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("ignorar");
  });

  it("tipo novo que este código não conhece é IGNORADO, não recusado", () => {
    // Se fosse erro, a fila reentregaria para sempre um evento que nunca serve.
    const r = lerEventoDoInstagram({ tipo: "reacao", evento: {} }, AGORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("ignorar");
  });

  it("anexo sem texto continua sendo mensagem — mídia é conteúdo", () => {
    const r = lerEventoDoInstagram(
      direct({}, { text: undefined, attachments: [{ type: "image" }] }),
      AGORA,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.temAnexo).toBe(true);
    expect(r.mensagem.texto).toBeNull();
  });

  it("sem texto e sem anexo não é mensagem nova (edição, reação)", () => {
    const r = lerEventoDoInstagram(direct({}, { text: undefined }), AGORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("ignorar");
  });

  it("envelope sem id de mensagem é RECUSADO — sem ele não há idempotência", () => {
    const e = direct({}, { mid: undefined });
    const r = lerEventoDoInstagram({ ...e, provider_message_id: undefined }, AGORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // A fila reentrega por desenho; sem chave, a reentrega duplicaria a
    // mensagem na conversa do cliente.
    expect(r.motivo).toBe("contrato_violado");
  });

  it("sem sender.id é contrato violado, não algo a ignorar", () => {
    const e = direct();
    const r = lerEventoDoInstagram({ ...e, evento: { ...e.evento, sender: {} } }, AGORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("contrato_violado");
  });

  it("o ad_id do envelope viaja junto — é o que liga a conversa ao anúncio", () => {
    const r = lerEventoDoInstagram({ ...direct(), ad_id: "123456" }, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.adId).toBe("123456");
  });
});

// ─── Os defeitos que a curadoria do @Cassio_SecRev encontrou ───────────────
//
// Cada caso abaixo corresponde a um achado real, e o comentário diz o ataque
// concreto — não a regra abstrata. Sem isso, a próxima refatoração "limpa" o
// `trim()` achando que é ruído.
describe("identidade não aceita espaço em branco (P1-1)", () => {
  it("IGSID com espaço à frente NÃO vira um segundo contato da mesma pessoa", () => {
    const e = direct();
    const r = lerEventoDoInstagram(
      { ...e, evento: { ...e.evento, sender: { id: "  igsid-abc  " } } },
      AGORA,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // O índice único da 9010 vê strings: `" igsid"` e `"igsid"` seriam duas
    // pessoas diferentes para o banco, e a mesma para o mundo.
    expect(r.mensagem.igsid).toBe("igsid-abc");
  });

  it("id de mensagem com espaço NÃO duplica a mensagem na conversa", () => {
    // A fila da Verdash REENTREGA por desenho. Se `" mid-1"` e `"mid-1"` forem
    // chaves distintas, a reentrega grava a mesma mensagem duas vezes.
    const r = lerEventoDoInstagram({ ...direct(), provider_message_id: " mid-1 " }, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.providerMessageId).toBe("mid-1");
  });

  it("identificador absurdamente longo é recusado, não gravado", () => {
    const e = direct();
    const r = lerEventoDoInstagram(
      { ...e, evento: { ...e.evento, sender: { id: "x".repeat(5000) } } },
      AGORA,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("contrato_violado");
  });

  it("o @ é normalizado, senão a busca não acha quem está lá (P2-6)", () => {
    // O índice da 9010 é sobre `lower(instagram_username)`.
    const e = comentario();
    const r = lerEventoDoInstagram(
      { ...e, evento: { ...e.evento, value: { ...e.evento.value, from: { id: "1", username: "  @Peter_Machado " } } } },
      AGORA,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.username).toBe("peter_machado");
  });
});

describe("payload forjado não muda o que a tela mostra (P2-4, P2-2)", () => {
  it("`reply_to.story` só conta como story se for OBJETO, como a Meta manda", () => {
    const r = lerEventoDoInstagram(direct({}, { reply_to: { story: "forjado" } }), AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.entrada).toBe("direct");
  });

  it("tipo com quebra de linha não forja linha de log", () => {
    const forjado = ["a", "FATAL forjado"].join("\n");
    const r = lerEventoDoInstagram({ tipo: forjado, evento: {} }, AGORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalhe).not.toContain("\n");
    expect(r.detalhe.length).toBeLessThan(90);
  });
});

describe("data do evento", () => {
  it("a Meta manda MILISSEGUNDOS", () => {
    expect(dataDoEvento(1_758_500_000_000, AGORA)).toBe("2025-09-22T00:13:20.000Z");
  });

  it("tratar como segundos cairia em 1970 — este caso trava isso", () => {
    // 1_758_500_000 lido como ms é 1970; o valor certo para esse instante é ×1000.
    expect(dataDoEvento(1_758_500_000, AGORA).startsWith("1970")).toBe(true);
    // Documentando o modo de falha: quem passar segundos VAI ver 1970 e tem de
    // corrigir na origem, não aqui — adivinhar a unidade esconderia o defeito.
  });

  it("data NO FUTURO é recusada — senão a conversa trava no topo do Inbox (P1-6)", () => {
    // O Inbox ordena por `last_message_at desc`. Uma data em 5138 fixa a
    // conversa em primeiro lugar PARA SEMPRE, e o atendente não tem como
    // consertar pela tela.
    expect(dataDoEvento(99_999_999_999_999, AGORA)).toBe(AGORA);
    expect(dataDoEvento(8.64e15, AGORA)).toBe(AGORA);
  });

  it("mas tolera relógio levemente adiantado, que é normal entre máquinas", () => {
    const doisMinutosAFrente = Date.parse(AGORA) + 2 * 60_000;
    expect(dataDoEvento(doisMinutosAFrente, AGORA)).not.toBe(AGORA);
  });

  it("sem timestamp usa o relógio do servidor, não uma data inventada", () => {
    expect(dataDoEvento(undefined, AGORA)).toBe(AGORA);
    expect(dataDoEvento("ontem", AGORA)).toBe(AGORA);
    expect(dataDoEvento(0, AGORA)).toBe(AGORA);
  });
});
