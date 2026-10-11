import { describe, expect, it } from "vitest";

/**
 * Canal por QR: edição e apagada só valem do AUTOR, na mesma sessão e conversa.
 *
 * O id-alvo (`editedMessageId`/`revokedMessageId`) é escrito por quem manda o
 * evento, e o WhatsApp não confere a autoria no servidor. Antes, o UPDATE
 * casava só org + id externo: um contato com cliente modificado reescrevia a
 * mensagem que a empresa mandou para ele. Mesmo conserto do canal Verdash.
 */
import { dispatchWahaEvent, type WahaEnvelope } from "@/lib/waha/ingest";
import { bancoFalso, ORIGINAL_INBOUND } from "./helpers/banco-falso-de-alteracao";

const SESSAO = { id: "sess-1", organization_id: "org-1", is_warmup_complete: true, warmup_started_at: null };

const editar = (payload: Record<string, unknown>, sessao = SESSAO) => (admin: never) =>
  dispatchWahaEvent(admin, sessao as never, {
    event: "message.edited",
    payload: {
      id: "EVT1", from: "5513900000000@c.us", fromMe: false,
      editedMessageId: "3A00000000000000ORIG", body: "texto novo", ...payload,
    },
  } as WahaEnvelope, "req-1");

const contato = { phone_number: "+5513900000000", wa_lid: null };

describe("canal por QR: alteração só do autor", () => {
  it("o contato edita a PRÓPRIA mensagem: UPDATE pelo id da linha", async () => {
    const banco = bancoFalso({ contato });
    await editar({})(banco.admin);
    expect(banco.update()?.valor).toMatchObject({ body: "texto novo" });
    expect(banco.update()?.filtros).toEqual([["id", "msg-orig"], ["organization_id", "org-1"]]);
  });

  it("⛔ contato editando mensagem de SAÍDA da empresa: nada muda", async () => {
    const banco = bancoFalso({ original: { ...ORIGINAL_INBOUND, direction: "outbound" }, contato });
    await editar({})(banco.admin);
    expect(banco.update()).toBeUndefined();
  });

  it("⛔ evento de outra sessão: nada muda", async () => {
    const banco = bancoFalso({ contato });
    await editar({}, { ...SESSAO, id: "sess-OUTRA" })(banco.admin);
    expect(banco.update()).toBeUndefined();
  });

  it("⛔ alvo de outra conversa: nada muda", async () => {
    const banco = bancoFalso({ contato: { phone_number: "+5511988887777", wa_lid: null } });
    await editar({})(banco.admin);
    expect(banco.update()).toBeUndefined();
  });

  it("⛔ apagar mensagem da empresa vindo do contato: nada muda", async () => {
    const banco = bancoFalso({ original: { ...ORIGINAL_INBOUND, direction: "outbound" }, contato });
    await dispatchWahaEvent(banco.admin, SESSAO as never, {
      event: "message.revoked",
      payload: { id: "EVT2", from: "5513900000000@c.us", fromMe: false, revokedMessageId: "3A00000000000000ORIG" },
    } as WahaEnvelope, "req-2");
    expect(banco.update()).toBeUndefined();
  });

  it("a empresa apaga a própria mensagem pelo celular (fromMe): carimba revoked_at", async () => {
    const banco = bancoFalso({ original: { ...ORIGINAL_INBOUND, direction: "outbound" }, contato });
    await dispatchWahaEvent(banco.admin, SESSAO as never, {
      event: "message.revoked",
      payload: { id: "EVT3", from: "5513900000000@c.us", to: "5513900000000@c.us", fromMe: true, revokedMessageId: "3A00000000000000ORIG" },
    } as WahaEnvelope, "req-3");
    expect(banco.update()?.valor).toHaveProperty("revoked_at");
  });
});
