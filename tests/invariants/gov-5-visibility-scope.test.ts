import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_CONTACT_2,
  GOV_CONV_AGENT_B,
  GOV_CONV_UNASSIGNED,
  GOV_MANAGER,
  GOV_ORG,
  GOV_SESSION,
  countAs,
  seedGov,
  sql,
} from "./gov-helpers";

/**
 * Eixo 5 — Escopo de visualização (spec 13 §1; fecha em G4-01).
 * docs/specs/13-spec-governanca-atendimento.md — dor: '"select sem where":
 * atendente vê tudo; métricas sem filtro por responsável'. Matriz alvo §4
 * (agent = own*; visibility_mode em §3.5, default 'own_and_unassigned' — G1-06a).
 *
 * A RLS (migration 0035) aplica fn_can_view_conversation no SELECT de
 * conversations/messages: só o role `agent` é restrito por visibility_mode;
 * viewer/manager/admin seguem org-wide. Realtime (postgres_changes) HERDA esta
 * mesma policy de SELECT — a subscription do inbox não entrega conversa fora do
 * escopo (evidência: os counts=0 abaixo são exatamente o filtro que o Realtime
 * usa; ver hooks/inbox/useConversationsRealtime.ts).
 */

// Fixtures locais deste arquivo — nunca mutam o GOV_ORG compartilhado (paralelo
// com os outros gov-*.test.ts). Namespace ffffffff = exclusivo deste arquivo
// (cccccccc/dddddddd/eeeeeeee já são usados por outros invariantes paralelos).
const OWN_ORG = "ffffffff-0000-4000-8000-000000000001";
const OWN_SESSION = "ffffffff-2222-4000-8000-000000000001";
const OWN_CONTACT = "ffffffff-3333-4000-8000-000000000001";
const OWN_CONV_UNASSIGNED = "ffffffff-4444-4000-8000-000000000001";
const GOV_MSG_AGENT_B = "ffffffff-7777-4000-8000-000000000001";
const GOV_CAE_AGENT_B = "ffffffff-8888-4000-8000-000000000001";

beforeAll(() => {
  seedGov();
  // 1 mensagem na conversa do agent B (probe de herança messages←conversation).
  sql(`
    insert into public.messages
      (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, body)
    values
      ('${GOV_MSG_AGENT_B}', '${GOV_ORG}', '${GOV_CONV_AGENT_B}', '${GOV_SESSION}', '${GOV_CONTACT_2}',
       'text', 'inbound', 'gov invariant probe')
    on conflict (id) do nothing;

    -- 1 linha de auditoria de atribuição na MESMA conversa (probe de herança
    -- conversation_assignment_events <- conversation, migration 0173). Antes dela
    -- a policy cae_select era membership de org PURA: quem não enxergava a
    -- conversa lia a auditoria dela -- e a tabela vive no schema public, logo o
    -- furo era alcançável pelo PostgREST com a anon key + o JWT do usuário, sem
    -- depender de rota nossa.
    -- (Sem crase neste comentário de propósito: ele mora DENTRO de um template
    -- literal, e uma crase aqui fecha a string — o parser reclama 40 linhas
    -- depois, num lugar que não tem nada a ver.)
    insert into public.conversation_assignment_events
      (id, organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
    values
      ('${GOV_CAE_AGENT_B}', '${GOV_ORG}', '${GOV_CONV_AGENT_B}', null,
       '${GOV_AGENT_B}', '${GOV_AGENT_B}', 'claim')
    on conflict (id) do nothing;

    -- Org dedicada em modo 'own' (fila NÃO conta): agent A é membro, 1 conversa
    -- sem dono. Isola o teste de 'own' sem tocar no visibility_mode do GOV_ORG.
    insert into public.organizations (id, slug, legal_name, display_name, settings)
      values ('${OWN_ORG}', 'gov-own', 'Gov Own Org', 'Gov Own',
              jsonb_build_object('visibility_mode', 'own'))
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${GOV_AGENT_A}', '${OWN_ORG}', 'agent', now()) on conflict do nothing;
    do $gov$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${OWN_SESSION}', '${OWN_ORG}', 'gov-own', '\\x00'::bytea);
    exception when unique_violation then null; end $gov$;
    insert into public.contacts (id, organization_id, display_name)
      values ('${OWN_CONTACT}', '${OWN_ORG}', 'Gov Own Contact') on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
      values ('${OWN_CONV_UNASSIGNED}', '${OWN_ORG}', '${OWN_CONTACT}', '${OWN_SESSION}', 'open')
      on conflict do nothing;
  `);
});

describe("eixo 5 — escopo de visualização", () => {
  it("agent vê a própria conversa atribuída (controle positivo)", () => {
    expect(
      countAs(
        GOV_AGENT_B,
        `select count(*) from public.conversations where id = '${GOV_CONV_AGENT_B}';`,
      ),
    ).toBe(1);
  });

  it("agent NÃO vê conversa atribuída a outro agent (spec 13 §4: agent = own*)", () => {
    expect(
      countAs(
        GOV_AGENT_A,
        `select count(*) from public.conversations where id = '${GOV_CONV_AGENT_B}';`,
      ),
    ).toBe(0);
  });

  it("agent vê a fila não-atribuída no default 'own_and_unassigned' (G1-06a)", () => {
    expect(
      countAs(
        GOV_AGENT_A,
        `select count(*) from public.conversations where id = '${GOV_CONV_UNASSIGNED}';`,
      ),
    ).toBe(1);
  });

  it("agent NÃO vê a fila não-atribuída quando visibility_mode='own'", () => {
    expect(
      countAs(
        GOV_AGENT_A,
        `select count(*) from public.conversations where id = '${OWN_CONV_UNASSIGNED}';`,
      ),
    ).toBe(0);
  });


  // ─── Os ramos de `visibility_mode` que nunca tiveram rede ─────────────────
  //
  // `grep visibility_mode tests/` só devolvia 'own' e 'own_and_unassigned'. O
  // ramo `when 'all' then true` — o MAIS PERMISSIVO da função que decide quem vê
  // qual conversa — e o `else false` do valor desconhecido passavam sem
  // cobertura. Levantado pelo @Cassio_SecRev; a migration 9014 os exercitou uma
  // vez em 72 casos e jogou fora, e prova que não fica não protege ninguém.
  //
  // A org dedicada é reconfigurada dentro de cada caso e devolvida ao estado
  // original no fim: sem isso um caso muda o mundo do seguinte, e a suíte passa
  // a depender de ordem — que é outro jeito de ficar verde sem medir.

  it("agent VÊ conversa de terceiro quando visibility_mode='all'", () => {
    sql(`
      update public.organizations
         set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('visibility_mode','all')
       where id = '${OWN_ORG}';
      update public.conversations set assigned_to_user_id = '${GOV_AGENT_B}'
       where id = '${OWN_CONV_UNASSIGNED}';
    `);
    try {
      // Atribuída a OUTRO agent, e mesmo assim visível: é o que 'all' promete.
      expect(
        countAs(
          GOV_AGENT_A,
          `select count(*) from public.conversations where id = '${OWN_CONV_UNASSIGNED}';`,
        ),
      ).toBe(1);
    } finally {
      sql(`
        update public.conversations set assigned_to_user_id = null
         where id = '${OWN_CONV_UNASSIGNED}';
        update public.organizations
           set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('visibility_mode','own')
         where id = '${OWN_ORG}';
      `);
    }
  });

  it("valor DESCONHECIDO de visibility_mode nega — falha fechada", () => {
    // Um valor que o produto não conhece (erro de digitação, versão futura,
    // escrita direta no banco) não pode abrir acesso. O `else false` existe
    // para isto, e é o ramo que ninguém exercita de propósito.
    sql(`
      update public.organizations
         set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('visibility_mode','modo_que_nao_existe')
       where id = '${OWN_ORG}';
    `);
    try {
      expect(
        countAs(
          GOV_AGENT_A,
          `select count(*) from public.conversations where id = '${OWN_CONV_UNASSIGNED}';`,
        ),
      ).toBe(0);
    } finally {
      sql(`
        update public.organizations
           set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('visibility_mode','own')
         where id = '${OWN_ORG}';
      `);
    }
  });

  it("usuário SEM vínculo não vê nada da organização", () => {
    // `fn_user_role_in_org` devolve null e o primeiro ramo nega. É o caso mais
    // básico da função e também não tinha teste: quem não é da casa não entra,
    // independentemente de `visibility_mode`.
    const FORA = "eeeeeeee-0000-4000-8000-0000000000f0";
    sql(`
      delete from public.user_organizations where user_id = '${FORA}';
      insert into auth.users (id, email) values ('${FORA}', 'sem-vinculo@deskcomm.test')
        on conflict (id) do nothing;
    `);
    expect(
      countAs(FORA, `select count(*) from public.conversations where id = '${OWN_CONV_UNASSIGNED}';`),
    ).toBe(0);
    expect(
      countAs(FORA, `select count(*) from public.conversations where id = '${GOV_CONV_UNASSIGNED}';`),
    ).toBe(0);
  });

  it("manager vê TODAS as conversas da org (org-wide read)", () => {
    expect(
      countAs(
        GOV_MANAGER,
        `select count(*) from public.conversations
           where id in ('${GOV_CONV_AGENT_B}', '${GOV_CONV_UNASSIGNED}');`,
      ),
    ).toBe(2);
  });

  it("mensagem herda o escopo: agent A NÃO lê msg de conversa fora do escopo", () => {
    expect(
      countAs(
        GOV_AGENT_A,
        `select count(*) from public.messages where id = '${GOV_MSG_AGENT_B}';`,
      ),
    ).toBe(0);
  });

  it("mensagem herda o escopo: agent B lê a msg da própria conversa", () => {
    expect(
      countAs(
        GOV_AGENT_B,
        `select count(*) from public.messages where id = '${GOV_MSG_AGENT_B}';`,
      ),
    ).toBe(1);
  });

  it("histórico de atribuição herda o escopo: agent A NÃO lê a auditoria de conversa fora do escopo", () => {
    expect(
      countAs(
        GOV_AGENT_A,
        `select count(*) from public.conversation_assignment_events
           where id = '${GOV_CAE_AGENT_B}';`,
      ),
    ).toBe(0);
  });

  it("histórico de atribuição herda o escopo: agent B lê a auditoria da própria conversa", () => {
    // O controle do caso anterior. Sem ele, um 0 não distingue "policy herdando o
    // escopo" de "a linha não foi semeada".
    expect(
      countAs(
        GOV_AGENT_B,
        `select count(*) from public.conversation_assignment_events
           where id = '${GOV_CAE_AGENT_B}';`,
      ),
    ).toBe(1);
  });

  it("histórico de atribuição herda o escopo: manager lê org-wide", () => {
    expect(
      countAs(
        GOV_MANAGER,
        `select count(*) from public.conversation_assignment_events
           where id = '${GOV_CAE_AGENT_B}';`,
      ),
    ).toBe(1);
  });
});
