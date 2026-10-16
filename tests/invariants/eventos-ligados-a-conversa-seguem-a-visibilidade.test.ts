/**
 * 0685 — evento LIGADO a uma conversa segue a visibilidade dela, não só o de
 * `entity_kind = 'conversation'`: a nota (`conversation_note`, cujo `entity_id`
 * é o id da conversa) e os demais eventos que trazem `payload.conversation_id`
 * (mensagem, job). E a atribuição de conversa fora da visibilidade não toca a
 * linha: ela é decidida no WHERE do `for no key update`.
 *
 * `GOV_CONV_AGENT_B` é de `GOV_AGENT_B`; `GOV_AGENT_A`, em modo `own`, não a vê.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_CONV_AGENT_B,
  GOV_MANAGER,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
} from "./gov-helpers";

const EV_NOTA = "e0e0e0e0-0685-4000-8000-000000000011";
const EV_MENSAGEM = "e0e0e0e0-0685-4000-8000-000000000012";
const EV_JOB = "e0e0e0e0-0685-4000-8000-000000000013";
const EV_MENSAGEM_ID_SEM_FORMA = "e0e0e0e0-0685-4000-8000-000000000014";
const EV_CONVERSA = "e0e0e0e0-0685-4000-8000-000000000015";
// `payload.conversation_id` que não é uuid: texto, vazio e número.
const EV_MALFORMADOS = [
  "e0e0e0e0-0685-4000-8000-000000000016",
  "e0e0e0e0-0685-4000-8000-000000000017",
  "e0e0e0e0-0685-4000-8000-000000000018",
];

const contar = (id: string) => `select count(*) from public.event_log where id = '${id}';`;
const modo = (m: string) =>
  sql(`update public.organizations set settings = jsonb_set(coalesce(settings,'{}'), '{visibility_mode}', '"${m}"') where id = '${GOV_ORG}';`);

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.event_log (id, organization_id, event_type, entity_kind, entity_id, payload, status) values
      ('${EV_NOTA}',     '${GOV_ORG}', 'user.mentioned', 'conversation_note', '${GOV_CONV_AGENT_B}',
        jsonb_build_object('conversation_id', '${GOV_CONV_AGENT_B}', 'body_preview', 'nota interna'), 'done'),
      ('${EV_MENSAGEM}', '${GOV_ORG}', 'message.sent', 'message', gen_random_uuid(),
        jsonb_build_object('conversation_id', '${GOV_CONV_AGENT_B}'), 'done'),
      ('${EV_JOB}',      '${GOV_ORG}', 'conversation.autonomous_turn_revoked', 'job', gen_random_uuid(),
        jsonb_build_object('conversation_id', '${GOV_CONV_AGENT_B}'), 'done'),
      ('${EV_MENSAGEM_ID_SEM_FORMA}', '${GOV_ORG}', 'message.sent', 'message', gen_random_uuid(),
        jsonb_build_object('conversation_id', '5511999999999@c.us'), 'done'),
      ('${EV_CONVERSA}', '${GOV_ORG}', 'conversation.claimed', 'conversation', '${GOV_CONV_AGENT_B}', '{}'::jsonb, 'done'),
      ('${EV_MALFORMADOS[0]}', '${GOV_ORG}', 'message.sent', 'message', gen_random_uuid(), '{"conversation_id":"x"}'::jsonb, 'done'),
      ('${EV_MALFORMADOS[1]}', '${GOV_ORG}', 'message.sent', 'message', gen_random_uuid(), '{"conversation_id":""}'::jsonb, 'done'),
      ('${EV_MALFORMADOS[2]}', '${GOV_ORG}', 'message.sent', 'message', gen_random_uuid(), '{"conversation_id":12345}'::jsonb, 'done')
      on conflict (id) do nothing;
  `);
});

beforeEach(() => {
  modo("own");
  sql(`update public.conversations set assigned_to_user_id = '${GOV_AGENT_B}', assignee_kind = 'user', status = 'claimed'
        where id = '${GOV_CONV_AGENT_B}';`);
});

describe("0685 — eventos ligados a uma conversa seguem a visibilidade dela", () => {
  it.each([EV_NOTA, EV_MENSAGEM, EV_JOB])("o dono lê (controle positivo) e o colega em modo own não (%s)", (ev) => {
    expect(countAs(GOV_AGENT_B, contar(ev))).toBe(1);
    expect(countAs(GOV_AGENT_A, contar(ev))).toBe(0);
  });

  it("modo all: o colega volta a ler", () => {
    modo("all");
    expect(countAs(GOV_AGENT_A, contar(EV_NOTA))).toBe(1);
    expect(countAs(GOV_AGENT_A, contar(EV_MENSAGEM))).toBe(1);
  });

  it("conversation_id que não é id de conversa não restringe nada", () => {
    expect(countAs(GOV_AGENT_A, contar(EV_MENSAGEM_ID_SEM_FORMA))).toBe(1);
  });

  it("gestão lê os eventos ligados à conversa de qualquer atendente", () => {
    for (const ev of [EV_NOTA, EV_MENSAGEM, EV_JOB]) expect(countAs(GOV_MANAGER, contar(ev))).toBe(1);
  });

  it("conversation_id malformado não derruba a leitura e segue o pertencimento à organização", () => {
    const ids = EV_MALFORMADOS.map((id) => `'${id}'`).join(", ");
    expect(countAs(GOV_AGENT_A, `select count(*) from public.event_log where id in (${ids});`)).toBe(3);
    // A tabela inteira, pela sessão do atendente: a policy roda em toda linha e não lança.
    expect(countAs(GOV_AGENT_A, "select count(*) from public.event_log;")).toBeGreaterThanOrEqual(3);
    const fora = "e0e0e0e0-0685-4000-8000-0000000000fe";
    sql(`insert into auth.users (id, email) values ('${fora}', 'fora-0685b@invariant.test') on conflict do nothing;`);
    expect(countAs(fora, `select count(*) from public.event_log where id in (${ids});`)).toBe(0);
  });

  it("viewer lê pela visão ampla, como em fn_can_view_conversation", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.conversations where id = '${GOV_CONV_AGENT_B}';`)).toBe(1);
    for (const ev of [EV_CONVERSA, EV_NOTA, EV_MENSAGEM]) expect(countAs(GOV_VIEWER, contar(ev))).toBe(1);
  });
});

describe("0685 — atribuição de conversa fora da visibilidade não bloqueia a linha", () => {
  // Bloquear a linha (for no key update) atribui um xid à transação; ler não.
  const travouALinha = (quem: string, expected: string) => {
    const out = sql(`
      set role authenticated;
      begin;
      select set_config('request.jwt.claims', '{"sub":"${quem}"}', true);
      select 'n=' || count(*) from public.fn_conversation_assign('${GOV_ORG}', '${GOV_CONV_AGENT_B}', '${GOV_AGENT_A}', 'transfer', '${expected}', true);
      select 'xid=' || (txid_current_if_assigned() is not null);
      rollback;
    `);
    return { linhas: out.match(/n=(\d+)/)?.[1], travou: out.match(/xid=(\w+)/)?.[1] };
  };

  it("conversa oculta: zero linhas e nenhuma trava", () => {
    expect(travouALinha(GOV_AGENT_A, GOV_AGENT_B)).toEqual({ linhas: "0", travou: "false" });
  });

  it("conversa visível com expected errado: zero linhas, mas a linha foi travada (controle)", () => {
    expect(travouALinha(GOV_AGENT_B, GOV_AGENT_A)).toEqual({ linhas: "0", travou: "true" });
  });
});
