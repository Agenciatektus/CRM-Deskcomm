import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9042 — fixar, silenciar e marcar como não lida valem POR ATENDENTE.
 *
 * Conectar como `postgres` mediria nada (bypassa RLS). Cada caso troca para
 * `authenticated` com o JWT da pessoa, o caminho da produção, e roda numa
 * transação que termina em ROLLBACK. Cada recusa tem o controle positivo ao
 * lado: sem ele, "0 linhas" poderia ser só semente que não entrou.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `90420000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const AG_A = id(11); // agent de A, dono de C1
const AG_A2 = id(12); // outro agent de A
const VIEWER_A = id(13);
const AG_B = id(14); // agent só de B
const SUPORTE = id(15); // platform admin, membro só de B
const SESSAO = id(16);
const SESS_A = id(21);
const SESS_B = id(22);
const C1 = id(31);
const C2 = id(32);
const CB = id(33);

const seed = `
begin;
insert into auth.users(id,email) values
 ('${AG_A}','e9042-ag-a@invariant.test'),('${AG_A2}','e9042-ag-a2@invariant.test'),
 ('${VIEWER_A}','e9042-viewer@invariant.test'),('${AG_B}','e9042-ag-b@invariant.test'),
 ('${SUPORTE}','e9042-suporte@invariant.test');
insert into auth.sessions(id,user_id,aal) values('${SESSAO}','${SUPORTE}','aal1');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','e9042-a','E9042 A','E9042 A'),('${ORG_B}','e9042-b','E9042 B','E9042 B');
update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"all"}'::jsonb
 where id in ('${ORG_A}','${ORG_B}');
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${AG_A}','agent',now()),('${ORG_A}','${AG_A2}','agent',now()),
 ('${ORG_A}','${VIEWER_A}','viewer',now()),('${ORG_B}','${AG_B}','agent',now()),
 ('${ORG_B}','${SUPORTE}','admin',now());
insert into platform_admins(user_id,granted_by,scope,mfa_required,reason)
 values('${SUPORTE}','${SUPORTE}','full',false,'Local test');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SESS_A}','${ORG_A}','e9042-a','\\x00'::bytea),('${SESS_B}','${ORG_B}','e9042-b','\\x00'::bytea);
insert into contacts(id,organization_id,display_name) values
 ('${id(51)}','${ORG_A}','E9042 Contato 1'),('${id(52)}','${ORG_A}','E9042 Contato 2'),
 ('${id(53)}','${ORG_B}','E9042 Contato B');
insert into conversations(id,organization_id,contact_id,channel_session_id,status) values
 ('${C1}','${ORG_A}','${id(51)}','${SESS_A}','open'),
 ('${C2}','${ORG_A}','${id(52)}','${SESS_A}','open'),
 ('${CB}','${ORG_B}','${id(53)}','${SESS_B}','open');
-- A linha do colega: o agent A2 fixou C1.
insert into conversation_user_state(organization_id,conversation_id,user_id,pinned_at)
 values ('${ORG_A}','${C1}','${AG_A2}',now());
`;

function prove(body: string) {
  expect(sql(`${seed}\n${body}\nrollback;\nselect 'provado';`)).toContain("provado");
}

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** Volta ao dono, troca o JWT e assume `authenticated`. */
const como = (user: string, session?: string) =>
  `reset role; select set_config('request.jwt.claims', ${lit(
    JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", ...(session ? { session_id: session } : {}) }),
  )}, true); set local role authenticated;`;

/** Um comando que TEM de falhar por RLS (42501), num savepoint. */
const recusa = (rotulo: string, comando: string) => `
do $t$ begin
  begin
    execute ${lit(comando)};
  exception when insufficient_privilege then return;
  end;
  raise exception '%: deveria ter sido recusado', ${lit(rotulo)};
end $t$;`;

/** Conta e compara. */
const conta = (rotulo: string, consulta: string, esperado: number) => `
do $t$ declare v bigint; begin
  execute ${lit(consulta)} into v;
  if v is distinct from ${esperado} then raise exception '%: leu %, esperado ${esperado}', ${lit(rotulo)}, v; end if;
end $t$;`;

const INSERE_C1 = (user: string) =>
  `insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_A}','${C1}','${user}',now())`;

describe("9042 — forma", () => {
  it("RLS ligada, travas do suporte presentes e trava de organização instalada", () => {
    const out = sql(`
      select c.relrowsecurity,
             (select count(*) from pg_policies p where p.schemaname='public' and p.tablename='conversation_user_state' and p.policyname like 'support_write_%'),
             exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'trg_organizacao_nao_muda'),
             has_table_privilege('anon', c.oid, 'SELECT'),
             has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        from pg_class c where c.oid = 'public.conversation_user_state'::regclass;`);
    expect(out).toBe("t|3|t|f|f");
  });
});

describe("9042 — cada um só o seu", () => {
  it("A lê a própria linha e NÃO a do colega da mesma org", () =>
    prove(`
      ${como(AG_A)}
      ${INSERE_C1(AG_A)};
      ${conta("A lê a sua", `select count(*) from public.conversation_user_state where user_id = '${AG_A}'`, 1)}
      ${conta("A não lê a do colega", `select count(*) from public.conversation_user_state where user_id = '${AG_A2}'`, 0)}
      ${conta("A lê só a sua no total", "select count(*) from public.conversation_user_state", 1)}`));

  it("A não grava em nome do colega, nem altera nem apaga a linha dele", () =>
    prove(`
      ${como(AG_A)}
      ${recusa("insert em nome do colega", `insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_A}','${C2}','${AG_A2}',now())`)}
      update public.conversation_user_state set pinned_at = null where user_id = '${AG_A2}';
      delete from public.conversation_user_state where user_id = '${AG_A2}';
      reset role;
      ${conta("a linha do colega segue fixada", `select count(*) from public.conversation_user_state where user_id = '${AG_A2}' and pinned_at is not null`, 1)}`));

  it("A não toma a linha para si trocando o user_id", () =>
    prove(`
      ${como(AG_A)}
      ${INSERE_C1(AG_A)};
      ${recusa("update user_id", `update public.conversation_user_state set user_id = '${AG_A2}' where user_id = '${AG_A}' and conversation_id = '${C1}'`)}`));
});

describe("9042 — organização", () => {
  it("agent de B não grava em conversa de A (nem declarando a org B)", () =>
    prove(`
      ${como(AG_B)}
      ${recusa("org A", INSERE_C1(AG_B))}
      ${recusa("org B com conversa de A", `insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_B}','${C1}','${AG_B}',now())`)}
      insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_B}','${CB}','${AG_B}',now());
      ${conta("controle: B grava na própria", "select count(*) from public.conversation_user_state", 1)}`));

  it("membro revogado deixa de ler e de gravar", () =>
    prove(`
      ${como(AG_A)}
      ${INSERE_C1(AG_A)};
      reset role; update user_organizations set revoked_at = now() where user_id = '${AG_A}' and organization_id = '${ORG_A}';
      ${como(AG_A)}
      ${conta("revogado não lê", "select count(*) from public.conversation_user_state", 0)}
      ${recusa("revogado não grava", `insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_A}','${C2}','${AG_A}',now())`)}`));

  it("a linha não troca de organização", () =>
    prove(`
      ${INSERE_C1(AG_A)};
      do $t$ begin
        begin
          update public.conversation_user_state set organization_id = '${ORG_B}' where user_id = '${AG_A}';
        exception when others then return;
        end;
        raise exception 'a linha trocou de organização';
      end $t$;`));
});

describe("9042 — conversa da MESMA org que a pessoa não enxerga (revisão do Cassio)", () => {
  // Modo own_and_unassigned e C1 atribuída ao colega: AG_A não vê C1.
  const fora = `reset role;
    update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"own_and_unassigned"}'::jsonb where id = '${ORG_A}';
    update conversations set assigned_to_user_id = '${AG_A2}' where id = '${C1}';`;

  it("não grava (insert nem upsert) estado nela; controle: grava na conversa sem dono", () =>
    prove(`${fora}
      ${como(AG_A)}
      ${conta("controle: A não enxerga C1", `select count(*) from public.conversations where id = '${C1}'`, 0)}
      ${recusa("insert em conversa invisível", INSERE_C1(AG_A))}
      ${recusa("upsert em conversa invisível", `${INSERE_C1(AG_A)} on conflict (conversation_id,user_id) do update set pinned_at = excluded.pinned_at`)}
      insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_A}','${C2}','${AG_A}',now());
      ${conta("controle: grava em C2", "select count(*) from public.conversation_user_state", 1)}`));

  it("não lê estado dela pelo caminho da lista (inner com conversations), não reativa a linha que tinha, e pode apagá-la", () =>
    prove(`
      ${INSERE_C1(AG_A)};
      ${fora}
      ${como(AG_A)}
      ${conta("a lista não traz C1", "select count(*) from public.conversation_user_state s join public.conversations c on c.id = s.conversation_id", 0)}
      ${recusa("atualizar a linha de conversa invisível", `update public.conversation_user_state set muted_until = 'infinity' where conversation_id = '${C1}'`)}
      delete from public.conversation_user_state where conversation_id = '${C1}';
      reset role;
      ${conta("a dona apagou a própria linha (vaga solta)", `select count(*) from public.conversation_user_state where conversation_id = '${C1}' and user_id = '${AG_A}'`, 0)}`));
});

describe("9042 — papéis", () => {
  it("viewer grava a própria preferência (é pessoal)", () =>
    prove(`
      ${como(VIEWER_A)}
      insert into public.conversation_user_state(organization_id,conversation_id,user_id,muted_until) values ('${ORG_A}','${C2}','${VIEWER_A}','infinity');
      ${conta("viewer lê a sua", "select count(*) from public.conversation_user_state where muted_until > now()", 1)}`));

  it("suporte somente leitura NÃO grava; suporte completo grava (controle)", () =>
    prove(`
      reset role; select fn_start_support('${SUPORTE}','${SESSAO}','${ORG_A}','${ORG_B}','support_readonly',3600);
      ${como(SUPORTE, SESSAO)}
      do $t$ begin if (public.fn_support_context()->>'status') is distinct from 'active' then
        raise exception 'controle: a sessão de suporte não ficou ativa'; end if; end $t$;
      ${recusa("suporte readonly", INSERE_C1(SUPORTE))}
      reset role; select fn_end_support('${SUPORTE}','${SESSAO}');
      select fn_start_support('${SUPORTE}','${SESSAO}','${ORG_A}','${ORG_B}','full',3600);
      ${como(SUPORTE, SESSAO)}
      ${INSERE_C1(SUPORTE)};
      ${conta("suporte full grava", "select count(*) from public.conversation_user_state", 1)}`));
});

describe("9042 — cascata", () => {
  it("apagar a conversa apaga as preferências dela; apagar o usuário apaga as dele", () =>
    prove(`
      ${INSERE_C1(AG_A)};
      delete from messages where conversation_id = '${C1}';
      delete from conversations where id = '${C1}';
      ${conta("conversa apagada", `select count(*) from public.conversation_user_state where conversation_id = '${C1}'`, 0)}
      insert into public.conversation_user_state(organization_id,conversation_id,user_id,pinned_at) values ('${ORG_A}','${C2}','${AG_A2}',now());
      delete from auth.users where id = '${AG_A2}';
      ${conta("usuário apagado", `select count(*) from public.conversation_user_state where user_id = '${AG_A2}'`, 0)}`));
});

describe("9042 — contagem de não lidas", () => {
  const contagem = (rotulo: string, esperado: number) => conta(
    rotulo,
    `select (public.fn_contagens_da_caixa('${ORG_A}', array['ninguem','aguardando'], array['closed','archived','resolved'], null, null, true)->>'all')::bigint`,
    esperado,
  );

  it("'só não lidas' conta a conversa que ESTA pessoa marcou, e não a do colega", () =>
    prove(`
      update conversations set unread_count_for_assignee = 0 where organization_id = '${ORG_A}';
      ${como(AG_A)}
      ${contagem("antes de marcar", 0)}
      insert into public.conversation_user_state(organization_id,conversation_id,user_id,marked_unread_at) values ('${ORG_A}','${C2}','${AG_A}',now());
      ${contagem("A marcou C2", 1)}
      ${como(AG_A2)}
      ${contagem("o colega não herda a marca", 0)}`));
});
