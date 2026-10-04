/**
 * UMA MENSAGEM DO CLIENTE = UM DISPARO DAS TRIGGERS DE ATENDIMENTO (#13).
 *
 * INSERT inbound em `messages` dispara `trg_reply_inbound_revision` (sobe
 * `conversations.reply_context_revision`, o relógio que a resposta da IA
 * segue) e `trg_demanda_abre_no_inbound` (`fn_service_inbound`, que abre a
 * demanda e carimba `messages.service_revision`). `trg_appointment_inbound`
 * escuta UPDATE de `service_revision`. Contra Postgres real, contando o EFEITO
 * de cada trigger:
 *
 *  - a forma que o ingest do Instagram grava (UMA linha, 1º anexo em
 *    `media_url`, os outros no metadata) conta 1;
 *  - CONTRASTE: uma linha por anexo contaria 3 — é por isso que não se faz;
 *  - a forma do retroativo `--aplicar` e do worker (UPDATE de `media_url`,
 *    `type`, `metadata`, `media_storage_path`, `media_thumb_path` na linha que
 *    já existe) conta 0: nenhuma trigger de inbound dispara.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const ORG = "91300000-0000-4000-8000-000000000001";
const CONTATO = "91300000-0000-4000-8000-000000000002";
const SESSAO = "91300000-0000-4000-8000-000000000003";
const CONVERSA = "91300000-0000-4000-8000-000000000004";
const ANTIGA = "91300000-0000-4000-8000-000000000010";

const conta = (q: string) => Number(lastLine(sql(q)));
const revisao = () => conta(`select reply_context_revision from conversations where id = '${CONVERSA}'`);
const demandas = () => conta(`select count(*) from demandas where organization_id = '${ORG}'`);
const carimbadas = () =>
  conta(`select count(*) from messages where conversation_id = '${CONVERSA}' and service_revision is not null`);

function inbound(id: string, externo: string, extra = ""): string {
  return `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                                external_id, type, direction, status, sent_via, sent_at, media_url, metadata)
          values ('${id}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}', '${externo}', 'image', 'inbound',
                  'delivered', 'external_device', now(), 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1',
                  '{"instagram_entrada":"direct","instagram_tem_anexo":true${extra}}'::jsonb);`;
}

beforeEach(() => {
  sql(`
    delete from messages where organization_id = '${ORG}';
    delete from storage_redaction_queue where organization_id = '${ORG}';
    delete from demanda_conversas where organization_id = '${ORG}';
    update conversations set current_demanda_id = null where organization_id = '${ORG}';
    delete from demandas where organization_id = '${ORG}';
    delete from conversations where organization_id = '${ORG}';
    delete from channel_sessions where organization_id = '${ORG}';
    delete from contacts where organization_id = '${ORG}';
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-instagram-913', 'Org Instagram LTDA', 'Org Instagram') on conflict (id) do nothing;
    insert into contacts (id, organization_id, name, phone_number)
      values ('${CONTATO}', '${ORG}', 'Cliente', '+5511900009130');
    insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
      values ('${SESSAO}', '${ORG}', 'instagram-913', 'WORKING', '\\x00'::bytea);
    insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'open', false);
  `);
});

describe("uma mensagem do cliente com 3 anexos", () => {
  it("a forma do ingest (UMA linha, extras no metadata) dispara 1 vez: revisão +1, 1 demanda, 1 carimbo", () => {
    const antes = revisao();
    sql(
      inbound(
        "91300000-0000-4000-8000-000000000020",
        "mid-tres-anexos",
        `,"instagram_anexos_extras":[{"tipo":"ig_reel","url":"https://lookaside.fbsbx.com/x2"},{"tipo":"ig_story","url":"https://lookaside.fbsbx.com/x3"}]`,
      ),
    );
    expect(revisao() - antes).toBe(1);
    expect(demandas()).toBe(1);
    expect(carimbadas()).toBe(1);
  });

  it("CONTRASTE: uma linha por anexo dispararia 3 vezes (revisão +3, 3 carimbos)", () => {
    const antes = revisao();
    sql(`
      ${inbound("91300000-0000-4000-8000-000000000031", "mid-x")}
      ${inbound("91300000-0000-4000-8000-000000000032", "mid-x:anexo:1")}
      ${inbound("91300000-0000-4000-8000-000000000033", "mid-x:anexo:2")}
    `);
    expect(revisao() - antes).toBe(3);
    expect(carimbadas()).toBe(3);
  });
});

describe("retroativo --aplicar e worker: só UPDATE na linha existente", () => {
  it("devolver media_url/type/metadata e gravar o arquivo não dispara NADA de inbound", () => {
    sql(inbound(ANTIGA, "mid-antiga"));
    sql(`update messages set media_url = null, type = 'text' where id = '${ANTIGA}';`);
    const [rev, dem, carimbo] = [revisao(), demandas(), carimbadas()];
    const recibos = conta(`select count(*) from appointment_recovery_receipts where organization_id = '${ORG}'`);

    sql(`
      -- o retroativo --aplicar
      update messages set media_url = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=9', type = 'image',
             metadata = metadata || '{"recuperada_por":"midia-do-instagram-retroativa"}'::jsonb
       where id = '${ANTIGA}' and media_url is null and media_storage_path is null;
      -- o worker, depois do download
      update messages set media_storage_path = '${ORG}/${CONVERSA}/${ANTIGA}.jpg',
             media_thumb_path = '${ORG}/miniaturas/${CONVERSA}/${ANTIGA}.webp', media_mime = 'image/jpeg'
       where id = '${ANTIGA}';
    `);

    expect(revisao()).toBe(rev);
    expect(demandas()).toBe(dem);
    expect(carimbadas()).toBe(carimbo);
    expect(conta(`select count(*) from appointment_recovery_receipts where organization_id = '${ORG}'`)).toBe(recibos);
    expect(conta(`select count(*) from messages where conversation_id = '${CONVERSA}'`)).toBe(1);
  });
});
