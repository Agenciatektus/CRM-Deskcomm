import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9048.
 *
 *   1. `messages_reenvio_unico`: uma mensagem que falhou só é reenviada UMA vez
 *      por organização. O segundo INSERT com o mesmo `metadata.reenvio_de` bate
 *      23505 (a rota o traduz em 409). Mensagem sem `reenvio_de` não entra no
 *      índice, e a mesma chave em outra organização não colide.
 *   2. `passo_da_conversa`: `resolved` é encerrada (nulo), como `closed`.
 *
 * Só mensagens de SAÍDA: os gatilhos que acordam a IA olham `inbound`.
 * Controle negativo: sem o índice, o segundo reenvio passa. Zero PII.
 */

const id = (n: number) => `90480000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MGR_A = id(11);
const SESS_A = id(21);
const SESS_B = id(22);
const K_A = id(31);
const K_A2 = id(32);
const K_B = id(33);
const CV_A = id(41);
const CV_A_RESOLVIDA = id(42);
const CV_B = id(43);
const FALHOU = id(51);

const seed = `
begin;
insert into auth.users(id,email) values ('${MGR_A}','r9048-mgr@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','r9048-a','R9048 A','R9048 A'),('${ORG_B}','r9048-b','R9048 B','R9048 B');
insert into user_organizations(organization_id,user_id,role,accepted_at) values ('${ORG_A}','${MGR_A}','manager',now());
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SESS_A}','${ORG_A}','r9048-a','\\x00'::bytea),('${SESS_B}','${ORG_B}','r9048-b','\\x00'::bytea);
insert into contacts(id,organization_id,display_name) values
 ('${K_A}','${ORG_A}','R9048 KA'),('${K_A2}','${ORG_A}','R9048 KA2'),('${K_B}','${ORG_B}','R9048 KB');
insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id) values
 ('${CV_A}','${ORG_A}','${K_A}','${SESS_A}','open','${MGR_A}'),
 ('${CV_A_RESOLVIDA}','${ORG_A}','${K_A2}','${SESS_A}','open','${MGR_A}'),
 ('${CV_B}','${ORG_B}','${K_B}','${SESS_B}','open',null);
update conversations set status = 'resolved' where id = '${CV_A_RESOLVIDA}';
insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_via,sent_at) values
 ('${FALHOU}','${ORG_A}','${CV_A}','${SESS_A}','${K_A}','text','outbound','failed','orçamento','crm', now() - interval '5 minutes');
`;

const reenvio = (org: string, conversa: string, sessao: string, contato: string) =>
  `insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_via,metadata)
   values ('${org}','${conversa}','${sessao}','${contato}','text','outbound','queued','orçamento','crm', jsonb_build_object('reenvio_de','${FALHOU}'));`;

function prova(corpo: string): string {
  return sql(`${seed}\n${corpo}\nrollback;\nselect 'provado';`);
}

describe("9048: um reenvio por mensagem que falhou", () => {
  it("o índice existe, é único e parcial", () => {
    const out = sql(`
      select i.indisunique, pg_get_expr(i.indpred, i.indrelid) is not null
        from pg_index i
       where i.indexrelid = 'public.messages_reenvio_unico'::regclass;`);
    expect(out).toBe("t|t");
  });

  it("o primeiro reenvio entra; o segundo, na mesma organização, bate 23505", () => {
    expect(prova(reenvio(ORG_A, CV_A, SESS_A, K_A))).toContain("provado");
    expect(() =>
      prova(`${reenvio(ORG_A, CV_A, SESS_A, K_A)}\n${reenvio(ORG_A, CV_A, SESS_A, K_A)}`),
    ).toThrow(/messages_reenvio_unico|duplicate key/);
  });

  it("CONTROLE: mensagens comuns não entram no índice, e outra organização não colide", () => {
    expect(
      prova(`
insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_via)
 values ('${ORG_A}','${CV_A}','${SESS_A}','${K_A}','text','outbound','queued','oi','crm'),
        ('${ORG_A}','${CV_A}','${SESS_A}','${K_A}','text','outbound','queued','oi','crm');
${reenvio(ORG_A, CV_A, SESS_A, K_A)}
${reenvio(ORG_B, CV_B, SESS_B, K_B)}`),
    ).toContain("provado");
  });

  it("controle negativo: sem o índice, o segundo reenvio passaria", () => {
    expect(
      prova(`drop index public.messages_reenvio_unico;
${reenvio(ORG_A, CV_A, SESS_A, K_A)}
${reenvio(ORG_A, CV_A, SESS_A, K_A)}`),
    ).toContain("provado");
  });
});

describe("9048: resolvida é encerrada no próximo passo", () => {
  const passo = (conversa: string) =>
    `select coalesce(public.passo_da_conversa(c), '(nulo)') from public.conversations c where c.id = '${conversa}';`;

  it("resolved dá nulo; a aberta do mesmo tipo, não (CONTROLE)", () => {
    const out = sql(`${seed}\n${passo(CV_A_RESOLVIDA)}\n${passo(CV_A)}\nrollback;`);
    const linhas = out.split("\n").map((l) => l.trim()).filter((l) => l === "(nulo)" || l === "sem_passo" || l === "atrasada" || l === "em_dia");
    expect(linhas).toEqual(["(nulo)", "sem_passo"]);
  });
});
