import { describe, expect, it } from "vitest";

/**
 * Nenhum evento do canal Verdash vira balão VAZIO no inbox.
 *
 * Caso real (Delicatto, 10/10/2026): duas mensagens apareceram como balão só com
 * a hora. No arquivo de webhook, eram EDIÇÕES — `protocolMessage` tipo 14 — de
 * uma mensagem que a cliente tinha mandado um minuto antes. O CRM gravou cada
 * edição como mensagem nova, `type='text'`, `body` nulo, e a original ficou com
 * o texto antigo. O payload abaixo é o daquele evento, com identificadores,
 * telefones, nome e texto trocados.
 */
import { parseVerdashInbound } from "@/lib/channels/verdash/webhook";
import { ingestVerdashInbound } from "@/lib/channels/verdash/ingest";

/** Envelope com a forma exata do FZAP (chaves de `Info` e do evento como chegaram). */
function envelope(message: Record<string, unknown>, info: Record<string, unknown> = {}) {
  return {
    type: "Message",
    token: "[redacted]",
    event: {
      Info: {
        ID: "3A00000000000000EDIT",
        Chat: "100000000000001@lid",
        Sender: "100000000000001@lid",
        SenderAlt: "5513900000000@s.whatsapp.net",
        RecipientAlt: "",
        IsFromMe: false,
        IsGroup: false,
        PushName: "Cliente Teste",
        Timestamp: "2026-10-10T09:14:19-03:00",
        Type: "text",
        MediaType: "",
        Category: "",
        AddressingMode: "",
        Edit: "",
        ...info,
      },
      IsEdit: false,
      IsViewOnce: false,
      IsEphemeral: false,
      RawMessage: {},
      Message: message,
    },
  };
}

/** O evento de edição real, anonimizado. */
const EDICAO_REAL = envelope(
  {
    protocolMessage: {
      key: { ID: "3A00000000000000ORIG", fromMe: true, remoteJID: "100000000000001@lid" },
      type: 14,
      timestampMS: 1791000859000,
      editedMessage: { conversation: "texto corrigido pela cliente" },
    },
    messageContextInfo: { messageSecret: "AAAA" },
  },
  { Edit: "1" },
);

describe("leitura: o que não é texto nem mídia comum", () => {
  it("edição (protocolMessage 14, caso Delicatto) aponta para a ORIGINAL com o texto novo", () => {
    const m = parseVerdashInbound(EDICAO_REAL);
    expect(m?.alteracao).toEqual({ acao: "editar", alvo: "3A00000000000000ORIG", texto: "texto corrigido pela cliente" });
    expect(m?.ignorar).toBeNull();
  });

  it("edição de legenda de foto também é edição", () => {
    const m = parseVerdashInbound(envelope({
      protocolMessage: { key: { ID: "ORIG2" }, type: "MESSAGE_EDIT", editedMessage: { imageMessage: { caption: "nova legenda" } } },
    }));
    expect(m?.alteracao).toEqual({ acao: "editar", alvo: "ORIG2", texto: "nova legenda" });
  });

  it("apagar para todos (protocolMessage 0) marca a original", () => {
    const m = parseVerdashInbound(envelope({ protocolMessage: { key: { ID: "ORIG3" }, type: 0 } }));
    expect(m?.alteracao).toEqual({ acao: "apagar", alvo: "ORIG3" });
  });

  it.each([3, 4, 6, 7, 17, 18])("sinal de protocolo %s é ignorado com motivo, não vira balão", (tipo) => {
    const m = parseVerdashInbound(envelope({ protocolMessage: { type: tipo } }));
    expect(m?.ignorar).toBe(`protocolo_${tipo}`);
    expect(m?.alteracao).toBeNull();
  });

  it("reação vira type=reaction com o emoji e o alvo; reação retirada é ignorada", () => {
    const m = parseVerdashInbound(envelope({ reactionMessage: { key: { ID: "ORIG4" }, text: "❤️" } }));
    expect(m?.tipo).toBe("reaction");
    expect(m?.text).toBe("❤️");
    expect(m?.extra).toEqual({ reacao_a: "ORIG4" });

    const retirada = parseVerdashInbound(envelope({ reactionMessage: { key: { ID: "ORIG4" }, text: "" } }));
    expect(retirada?.ignorar).toBe("reacao_removida");
  });

  it("álbum só anuncia as fotos: ignorado; a foto embrulhada em associatedChildMessage é imagem", () => {
    expect(parseVerdashInbound(envelope({ albumMessage: { expectedImageCount: 3 } }))?.ignorar)
      .toBe("album_anuncia_os_filhos");
    const filho = parseVerdashInbound({
      ...envelope({ associatedChildMessage: { message: { imageMessage: { mimetype: "image/jpeg" } } } }),
      downloadURL: "https://fzap.exemplo/m/1",
    });
    expect(filho?.tipo).toBe("image");
    expect(filho?.attachments[0]?.url).toBe("https://fzap.exemplo/m/1");
  });

  it("localização vira type=location com metadata.location e corpo com o link", () => {
    const m = parseVerdashInbound(envelope({
      locationMessage: { degreesLatitude: -23.96, degreesLongitude: -46.33, name: "Loja" },
    }));
    expect(m?.tipo).toBe("location");
    expect(m?.extra.location).toEqual({ latitude: -23.96, longitude: -46.33, nome: "Loja" });
    expect(m?.text).toContain("https://maps.google.com/?q=-23.96,-46.33");
  });

  it("contato vira type=contact com o vCard no corpo", () => {
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Fulana\nTEL;type=CELL:+55 13 90000-0000\nEND:VCARD";
    const m = parseVerdashInbound(envelope({ contactMessage: { displayName: "Fulana", vcard } }));
    expect(m?.tipo).toBe("contact");
    expect(m?.text).toBe(vcard);
  });

  it("enquete vira texto com a pergunta e as opções", () => {
    const m = parseVerdashInbound(envelope({
      pollCreationMessageV3: { name: "Qual cor?", options: [{ optionName: "Azul" }, { optionName: "Preto" }] },
    }));
    expect(m?.tipo).toBe("text");
    expect(m?.text).toBe("📊 Qual cor?\n• Azul\n• Preto");
  });

  it("mensagem de empresa (interactiveMessage) usa o texto do corpo", () => {
    const m = parseVerdashInbound(envelope({ interactiveMessage: { body: { text: "Confira o catálogo" } } }));
    expect(m?.text).toBe("Confira o catálogo");
    expect(m?.extra).toEqual({ wa_tipo: "interactiveMessage" });
  });

  it("vídeo bolinha (ptvMessage) é vídeo", () => {
    expect(parseVerdashInbound(envelope({ ptvMessage: { mimetype: "video/mp4" } }))?.tipo).toBe("video");
  });

  it("tipo desconhecido entra com metadata.tipo_nao_suportado, nunca text vazio e mudo", () => {
    const m = parseVerdashInbound(envelope({ placeholderMessage: { type: 0 }, messageContextInfo: {} }));
    expect(m?.tipo).toBe("text");
    expect(m?.text).toBeNull();
    expect(m?.extra).toEqual({ tipo_nao_suportado: "placeholderMessage" });
    expect(m?.ignorar).toBeNull();
  });

  it("só chaves de serviço, sem conteúdo: ignorado", () => {
    expect(parseVerdashInbound(envelope({ messageContextInfo: {} }))?.ignorar).toBe("sem_conteudo");
  });

  it("texto comum segue intacto", () => {
    const m = parseVerdashInbound(envelope({ conversation: "oi" }));
    expect(m?.tipo).toBe("text");
    expect(m?.text).toBe("oi");
    expect(m?.extra).toEqual({});
  });
});

import { bancoFalso, ORIGINAL_INBOUND } from "./helpers/banco-falso-de-alteracao";

const ingerir = (admin: never, payload: unknown, sessao = "sess-1") =>
  ingestVerdashInbound(admin, { organizationId: "org-1", channelSessionId: sessao, payload });

describe("ingestão: edição muda a original, com autoria conferida, e NÃO insere", () => {
  it("caso Delicatto: UPDATE pelo id da original, sem INSERT em messages (que acordaria a IA)", async () => {
    const banco = bancoFalso();
    const r = await ingerir(banco.admin, EDICAO_REAL);

    expect(r).toEqual({ status: "updated", conversationId: "conv-1", messageId: "msg-orig" });
    expect(banco.inseriu()).toBe(false);
    const upd = banco.update();
    expect(upd?.valor).toMatchObject({ body: "texto corrigido pela cliente" });
    expect(upd?.filtros).toEqual([["id", "msg-orig"], ["organization_id", "org-1"]]);
  });

  it("apagada da cliente na própria mensagem: carimba revoked_at", async () => {
    const banco = bancoFalso();
    const r = await ingerir(banco.admin, envelope({ protocolMessage: { key: { ID: "3A00000000000000ORIG" }, type: 0 } }));
    expect(r.status).toBe("updated");
    expect(banco.update()?.valor).toHaveProperty("revoked_at");
  });

  it("⛔ contato tentando editar mensagem que a EMPRESA mandou: ignorado, nada muda", async () => {
    const banco = bancoFalso({ original: { ...ORIGINAL_INBOUND, direction: "outbound" } });
    const r = await ingerir(banco.admin, EDICAO_REAL);
    expect(r).toEqual({ status: "ignored", reason: "alteracao_autor_divergente" });
    expect(banco.update()).toBeUndefined();
  });

  it("⛔ evento de OUTRA sessão de canal: ignorado, nada muda", async () => {
    const banco = bancoFalso();
    const r = await ingerir(banco.admin, EDICAO_REAL, "sess-OUTRA");
    expect(r).toEqual({ status: "ignored", reason: "alteracao_autor_divergente" });
    expect(banco.update()).toBeUndefined();
  });

  it("⛔ alvo de OUTRA conversa (chat e contato não batem): ignorado, nada muda", async () => {
    const banco = bancoFalso({
      conversa: { provider_conversation_id: "999999999999999@lid" },
      contato: { phone_number: "+5511988887777", wa_lid: "999999999999999" },
    });
    const r = await ingerir(banco.admin, EDICAO_REAL);
    expect(r).toEqual({ status: "ignored", reason: "alteracao_conversa_divergente" });
    expect(banco.update()).toBeUndefined();
  });

  it("conversa reconhecida pelo telefone do contato quando o JID mudou (LID ↔ telefone)", async () => {
    const banco = bancoFalso({
      conversa: { provider_conversation_id: "5513900000000@s.whatsapp.net" },
      contato: { phone_number: "+5513900000000", wa_lid: null },
    });
    expect((await ingerir(banco.admin, EDICAO_REAL)).status).toBe("updated");
  });

  it("original ausente: ignorado com motivo, e continua sem INSERT", async () => {
    const banco = bancoFalso({ original: null });
    const r = await ingerir(banco.admin, EDICAO_REAL);
    expect(r).toEqual({ status: "ignored", reason: "editar_sem_original" });
    expect(banco.inseriu()).toBe(false);
  });

  it("sinal de protocolo não toca o banco", async () => {
    const banco = bancoFalso();
    const r = await ingerir(banco.admin, envelope({ protocolMessage: { type: 17 } }, { IsFromMe: true }));
    expect(r).toEqual({ status: "ignored", reason: "protocolo_17" });
    expect(banco.chamadas).toHaveLength(0);
  });

  it("valor livre do payload não vira motivo nem tipo_nao_suportado", async () => {
    const m = parseVerdashInbound(envelope({ protocolMessage: { type: "x'; drop table--" } }));
    expect(m?.ignorar).toBe("protocolo_desconhecido");
    const n = parseVerdashInbound(envelope({ "<script>": {} }));
    expect(n?.extra).toEqual({ tipo_nao_suportado: "desconhecido" });
  });
});
