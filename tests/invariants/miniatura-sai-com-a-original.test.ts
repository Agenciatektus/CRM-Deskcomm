/**
 * A MINIATURA SAI COM A ORIGINAL (migration 9033) — contra Postgres de verdade.
 *
 * Cada caso, um modo de falha concreto:
 *   - LGPD: a cascata de anonimização zera a original; a miniatura do titular
 *     tem de ir para a fila de remoção e sair da linha (senão o rosto do
 *     titular fica no bucket depois de "anonimizado");
 *   - poda: a original vencida sai; a miniatura vai junto;
 *   - conversa apagada: a linha some; a miniatura vai para a fila;
 *   - a miniatura EM USO não é tomada por órfã pelo varredor da 0432/0435;
 *   - isolamento: o caminho da miniatura fica na pasta da organização da linha
 *     (org B não grava miniatura na pasta da org A).
 * Controle: mensagem SEM miniatura não põe nada a mais na fila.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { lastLine, sql, writeCountAs } from "./gov-helpers";

const ORG = "90330000-0000-4000-8000-000000000001";
const ORG_B = "90330000-0000-4000-8000-0000000000b1";
const CONTATO = "90330000-0000-4000-8000-000000000002";
const OUTRO_CONTATO = "90330000-0000-4000-8000-000000000012";
const SESSAO = "90330000-0000-4000-8000-000000000003";
const CONVERSA = "90330000-0000-4000-8000-000000000004";
const OUTRA_CONVERSA = "90330000-0000-4000-8000-000000000014";
const MSG = "90330000-0000-4000-8000-000000000010";
const MSG_SEM_MINI = "90330000-0000-4000-8000-000000000011";
const MSG_OUTRA = "90330000-0000-4000-8000-000000000020";

const ORIGINAL = `${ORG}/${CONVERSA}/${MSG}.jpg`;
const MINIATURA = `${ORG}/miniaturas/${CONVERSA}/${MSG}.webp`;
const ORIGINAL_SEM_MINI = `${ORG}/${CONVERSA}/${MSG_SEM_MINI}.jpg`;
const ORIGINAL_OUTRA = `${ORG}/${OUTRA_CONVERSA}/${MSG_OUTRA}.jpg`;
const MINIATURA_OUTRA = `${ORG}/miniaturas/${OUTRA_CONVERSA}/${MSG_OUTRA}.webp`;

const conta = (q: string) => Number(lastLine(sql(q)));
const naFila = (p: string) =>
  conta(`select count(*) from storage_redaction_queue where bucket = 'whatsapp-media' and object_path = '${p}' and status = 'pending'`);
const miniaturaDa = (id: string) =>
  lastLine(sql(`select coalesce(media_thumb_path, '<null>') from messages where id = '${id}'`));

function objeto(nome: string, idadeDias: number): string {
  return `insert into storage.objects (bucket_id, name, metadata, created_at)
          values ('whatsapp-media', '${nome}', '{"size": 1000}'::jsonb, now() - interval '${idadeDias} days');`;
}

beforeEach(() => {
  sql(`
    insert into storage.buckets (id, name) values ('whatsapp-media', 'whatsapp-media') on conflict (id) do nothing;
    delete from storage_redaction_queue where organization_id in ('${ORG}', '${ORG_B}');
    delete from storage.objects where name like '${ORG}/%' or name like '${ORG_B}/%';
    delete from messages where organization_id in ('${ORG}', '${ORG_B}');
    delete from storage_redaction_queue where organization_id in ('${ORG}', '${ORG_B}');
    delete from conversations where organization_id in ('${ORG}', '${ORG_B}');
    delete from channel_sessions where organization_id in ('${ORG}', '${ORG_B}');
    delete from contacts where organization_id in ('${ORG}', '${ORG_B}');
    insert into organizations (id, slug, legal_name, display_name, media_retention_days)
      values ('${ORG}', 'org-miniatura-9033', 'Org Miniatura LTDA', 'Org Miniatura', 60)
      on conflict (id) do update set media_retention_days = 60;
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'org-miniatura-9033-b', 'Org B LTDA', 'Org B')
      on conflict (id) do nothing;
    insert into contacts (id, organization_id, name, phone_number)
      values ('${CONTATO}', '${ORG}', 'Titular', '+5511900009033'),
             ('${OUTRO_CONTATO}', '${ORG}', 'Outro', '+5511900009034');
    insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
      values ('${SESSAO}', '${ORG}', 'miniatura-9033', 'WORKING', '\\x00'::bytea);
    insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'open', false),
             ('${OUTRA_CONVERSA}', '${ORG}', '${OUTRO_CONTATO}', '${SESSAO}', 'open', false);
    insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                          type, direction, status, sent_via, sent_at, created_at,
                          media_storage_path, media_thumb_path)
      values ('${MSG}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}', 'image', 'inbound', 'delivered',
              'external_device', now() - interval '100 days', now() - interval '100 days', '${ORIGINAL}', '${MINIATURA}'),
             ('${MSG_SEM_MINI}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}', 'image', 'inbound', 'delivered',
              'external_device', now() - interval '100 days', now() - interval '100 days', '${ORIGINAL_SEM_MINI}', null),
             ('${MSG_OUTRA}', '${ORG}', '${OUTRA_CONVERSA}', '${SESSAO}', '${OUTRO_CONTATO}', 'image', 'inbound', 'delivered',
              'external_device', now() - interval '5 days', now() - interval '5 days', '${ORIGINAL_OUTRA}', '${MINIATURA_OUTRA}');
    ${objeto(ORIGINAL, 100)}
    ${objeto(MINIATURA, 100)}
    ${objeto(ORIGINAL_SEM_MINI, 100)}
    ${objeto(ORIGINAL_OUTRA, 5)}
    ${objeto(MINIATURA_OUTRA, 5)}
  `);
});

describe("LGPD: a anonimização leva a miniatura junto", () => {
  it("fn_lgpd_cascade_redact_contact: miniatura do titular na fila e fora da linha", () => {
    sql(`select public.fn_lgpd_cascade_redact_contact('${ORG}', '${CONTATO}', null);`);
    // A original (passo da própria RPC) e a miniatura (trigger da 9033).
    expect(naFila(ORIGINAL)).toBe(1);
    expect(naFila(MINIATURA)).toBe(1);
    expect(miniaturaDa(MSG)).toBe("<null>");
    // A conversa de OUTRO contato não é tocada.
    expect(naFila(MINIATURA_OUTRA)).toBe(0);
    expect(miniaturaDa(MSG_OUTRA)).toBe(MINIATURA_OUTRA);
  });

  it("a linha já enfileirada pelo app (com o request_id do pedido) não é sobrescrita pela trigger", () => {
    sql(`
      insert into storage_redaction_queue (organization_id, bucket, object_path)
        values ('${ORG}', 'whatsapp-media', '${MINIATURA}');
      select public.fn_lgpd_cascade_redact_contact('${ORG}', '${CONTATO}', null);
    `);
    expect(
      conta(`select count(*) from storage_redaction_queue where object_path = '${MINIATURA}'`),
    ).toBe(1);
  });
});

describe("retenção e remoção", () => {
  it("poda: a original vencida sai, e a miniatura vai junto", () => {
    sql(`select public.fn_enfileirar_midia_vencida(500);`);
    expect(naFila(ORIGINAL)).toBe(1);
    expect(naFila(MINIATURA)).toBe(1);
    expect(miniaturaDa(MSG)).toBe("<null>");
  });

  it("a miniatura EM USO não é tomada por órfã pelo varredor", () => {
    sql(`select public.fn_enfileirar_midia_vencida(500);`);
    // MSG_OUTRA é recente: original e miniatura ficam.
    expect(naFila(ORIGINAL_OUTRA)).toBe(0);
    expect(naFila(MINIATURA_OUTRA)).toBe(0);
  });

  it("conversa apagada: a miniatura vai para a fila", () => {
    sql(`delete from messages where id = '${MSG_OUTRA}';`);
    expect(naFila(MINIATURA_OUTRA)).toBe(1);
  });

  it("CONTROLE: mensagem sem miniatura não põe nada a mais na fila", () => {
    sql(`update messages set media_storage_path = null where id = '${MSG_SEM_MINI}';`);
    expect(conta(`select count(*) from storage_redaction_queue where organization_id = '${ORG}'`)).toBe(0);
  });
});

describe("varredor de órfãos conta a miniatura como referência (P2-3 da #75)", () => {
  it("miniatura SEM ponteiro é órfã e sai; a em uso fica", () => {
    const ORFA = `${ORG}/miniaturas/${CONVERSA}/sem-dono.webp`;
    sql(objeto(ORFA, 5));
    sql(`select public.fn_enfileirar_midia_vencida(500);`);
    expect(
      conta(`select count(*) from storage_redaction_queue where object_path = '${ORFA}'`),
    ).toBe(1);
    expect(naFila(MINIATURA_OUTRA)).toBe(0);
  });
});

const VIEWER = "90330000-0000-4000-8000-0000000000e1";
const AGENTE = "90330000-0000-4000-8000-0000000000e2";

describe("só o servidor grava o caminho da mídia (P2-2 da #75)", () => {
  beforeEach(() => {
    sql(`
      insert into auth.users (id, email) values
        ('${VIEWER}', 'miniatura-9033-viewer@invariant.test'),
        ('${AGENTE}', 'miniatura-9033-agent@invariant.test')
        on conflict do nothing;
      delete from public.user_organizations where user_id in ('${VIEWER}', '${AGENTE}');
      insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
        ('${VIEWER}', '${ORG}', 'viewer', now()),
        ('${AGENTE}', '${ORG}', 'agent', now());
      update conversations set assigned_to_user_id = '${AGENTE}' where id = '${OUTRA_CONVERSA}';
    `);
  });

  for (const [papel, usuario] of [
    ["viewer", VIEWER],
    ["agent", AGENTE],
  ] as const) {
    it(`${papel}: CONTROLE — enxerga e altera a linha (o RLS deixa)`, () => {
      expect(writeCountAs(usuario, `update messages set body = 'x' where id = '${MSG_OUTRA}'`)).toBe(1);
    });

    it(`${papel}: não aponta media_thumb_path para outro objeto da org`, () => {
      expect(() =>
        writeCountAs(usuario, `update messages set media_thumb_path = '${ORIGINAL}' where id = '${MSG_OUTRA}'`),
      ).toThrow(/pelo servidor/);
      expect(miniaturaDa(MSG_OUTRA)).toBe(MINIATURA_OUTRA);
    });

    it(`${papel}: não mexe em media_storage_path para disparar a exclusão da miniatura`, () => {
      expect(() =>
        writeCountAs(usuario, `update messages set media_storage_path = null where id = '${MSG_OUTRA}'`),
      ).toThrow(/pelo servidor/);
      expect(naFila(MINIATURA_OUTRA)).toBe(0);
    });
  }

  it("worker (service_role) grava a miniatura", () => {
    const saida = sql(`
      set role service_role;
      update messages set media_thumb_path = '${ORG}/miniaturas/${OUTRA_CONVERSA}/nova.webp' where id = '${MSG_OUTRA}';
      reset role;
      select media_thumb_path from messages where id = '${MSG_OUTRA}';
    `);
    expect(lastLine(saida)).toBe(`${ORG}/miniaturas/${OUTRA_CONVERSA}/nova.webp`);
  });
});

describe("isolamento: a ORIGINAL também fica na pasta da organização (P2-B da #75)", () => {
  const inserirOriginal = (id: string, caminho: string) => `
    create temp table if not exists resultado_original (v text);
    delete from resultado_original;
    do $$
    begin
      insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                            type, direction, status, sent_via, sent_at, media_storage_path)
        values ('${id}', '${ORG}', '${CONVERSA}', '${SESSAO}', '${CONTATO}',
                'image', 'inbound', 'delivered', 'external_device', now(), '${caminho}');
      insert into resultado_original values ('ACEITOU');
    exception when check_violation then
      insert into resultado_original values ('RECUSOU');
    end $$;
    select v from resultado_original;
  `;

  it("INSERT apontando a original para a pasta de OUTRA org é recusado", () => {
    const saida = sql(inserirOriginal("90330000-0000-4000-8000-0000000000d1", `${ORG_B}/qualquer/foto.jpg`));
    expect(lastLine(saida)).toBe("RECUSOU");
  });

  it("CONTROLE: a original na pasta da própria org é aceita", () => {
    const saida = sql(inserirOriginal("90330000-0000-4000-8000-0000000000d2", `${ORG}/${CONVERSA}/foto.jpg`));
    expect(lastLine(saida)).toBe("ACEITOU");
  });
});

describe("isolamento: a miniatura fica na pasta da organização da linha", () => {
  it("org B não grava miniatura apontando para a pasta da org A", () => {
    const saida = sql(`
      insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
        values ('90330000-0000-4000-8000-0000000000b3', '${ORG_B}', 'miniatura-9033-b', 'WORKING', '\\x00'::bytea);
      insert into contacts (id, organization_id, name, phone_number)
        values ('90330000-0000-4000-8000-0000000000b2', '${ORG_B}', 'Cliente B', '+5511900009035');
      insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
        values ('90330000-0000-4000-8000-0000000000b4', '${ORG_B}', '90330000-0000-4000-8000-0000000000b2',
                '90330000-0000-4000-8000-0000000000b3', 'open', false);
      create temp table resultado (v text);
      do $$
      begin
        insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                              type, direction, status, sent_via, sent_at, media_storage_path, media_thumb_path)
          values ('90330000-0000-4000-8000-0000000000b5', '${ORG_B}', '90330000-0000-4000-8000-0000000000b4',
                  '90330000-0000-4000-8000-0000000000b3', '90330000-0000-4000-8000-0000000000b2',
                  'image', 'inbound', 'delivered', 'external_device', now(),
                  '${ORG_B}/90330000-0000-4000-8000-0000000000b4/x.jpg', '${MINIATURA}');
        insert into resultado values ('ACEITOU');
      exception when check_violation then
        insert into resultado values ('RECUSOU');
      end $$;
      select v from resultado;
    `);
    expect(lastLine(saida)).toBe("RECUSOU");
  });

  it("CONTROLE: a miniatura na pasta da própria org B é aceita", () => {
    expect(
      conta(`select count(*) from pg_constraint where conname = 'messages_media_thumb_path_da_org'`),
    ).toBe(1);
    const saida = sql(`
      insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
        values ('90330000-0000-4000-8000-0000000000c3', '${ORG_B}', 'miniatura-9033-c', 'WORKING', '\\x00'::bytea);
      insert into contacts (id, organization_id, name, phone_number)
        values ('90330000-0000-4000-8000-0000000000c2', '${ORG_B}', 'Cliente C', '+5511900009036');
      insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
        values ('90330000-0000-4000-8000-0000000000c4', '${ORG_B}', '90330000-0000-4000-8000-0000000000c2',
                '90330000-0000-4000-8000-0000000000c3', 'open', false);
      insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id,
                            type, direction, status, sent_via, sent_at, media_storage_path, media_thumb_path)
        values ('90330000-0000-4000-8000-0000000000c5', '${ORG_B}', '90330000-0000-4000-8000-0000000000c4',
                '90330000-0000-4000-8000-0000000000c3', '90330000-0000-4000-8000-0000000000c2',
                'image', 'inbound', 'delivered', 'external_device', now(),
                '${ORG_B}/90330000-0000-4000-8000-0000000000c4/x.jpg',
                '${ORG_B}/miniaturas/90330000-0000-4000-8000-0000000000c4/x.webp');
      select count(*) from messages where id = '90330000-0000-4000-8000-0000000000c5';
    `);
    expect(lastLine(saida)).toBe("1");
  });
});
