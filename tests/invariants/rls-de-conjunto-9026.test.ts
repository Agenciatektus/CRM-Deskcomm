import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9026 — RLS de CONJUNTO em conversations, crm_leads e
 * user_organizations (`fn_escopo_orgs()` + semi-join), no lugar do predicado
 * POR LINHA (`fn_can_view_conversation`/`fn_can_view_lead`/`fn_role_at_least`).
 *
 * Os ramos que a produção da Tektus não tem (agent, viewer, sessão de suporte,
 * vínculo revogado) só se provam aqui. Cada caso roda numa transação que
 * termina em ROLLBACK: não suja o banco do arquivo nem depende de ordem.
 *
 * Duas réguas em cada leitura:
 *  - o NÚMERO esperado, escrito à mão (o que a regra de produto promete);
 *  - a EQUIVALÊNCIA com o predicado antigo, que continua no banco: a contagem
 *    sob a policy nova (papel `authenticated` + JWT) tem de ser igual à do
 *    predicado antigo avaliado como WHERE pelo dono (sem RLS), com os mesmos
 *    claims. Se as duas réguas concordam, a troca não mudou quem vê o quê.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `92600000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const VIEWER = id(11);
const AG_DONO = id(12); // agent dono de c1/l1
const AG_OUTRO = id(13); // agent sem nada atribuído (mede o modo)
const MANAGER = id(14);
const REVOGADO = id(15); // agent atribuído a c3/l3, revogado no caso (c)
const SUPORTE = id(16); // platform admin, membro só de B, entra em A por suporte
const SESSAO = id(17);
const VIZINHO = id(18); // agent só de B
const SESS_A = id(21);
const SESS_B = id(22);
const C1 = id(31); // A, atribuída a AG_DONO, aberta
const C2 = id(32); // A, sem dono
const C3 = id(33); // A, atribuída a REVOGADO, ENCERRADA (a revogação não a desatribui)
const CB = id(34); // B
const L1 = id(41);
const L2 = id(42);
const L3 = id(43);
const LB = id(44);

const seed = `
begin;
insert into auth.users(id,email) values
 ('${VIEWER}','r9026-viewer@invariant.test'),('${AG_DONO}','r9026-dono@invariant.test'),
 ('${AG_OUTRO}','r9026-outro@invariant.test'),('${MANAGER}','r9026-manager@invariant.test'),
 ('${REVOGADO}','r9026-revogado@invariant.test'),('${SUPORTE}','r9026-suporte@invariant.test'),
 ('${VIZINHO}','r9026-vizinho@invariant.test');
insert into auth.sessions(id,user_id,aal) values('${SESSAO}','${SUPORTE}','aal1');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','r9026-a','R9026 A','R9026 A'),('${ORG_B}','r9026-b','R9026 B','R9026 B');
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${VIEWER}','viewer',now()),('${ORG_A}','${AG_DONO}','agent',now()),
 ('${ORG_A}','${AG_OUTRO}','agent',now()),('${ORG_A}','${MANAGER}','manager',now()),
 ('${ORG_A}','${REVOGADO}','agent',now()),
 ('${ORG_B}','${SUPORTE}','admin',now()),('${ORG_B}','${VIZINHO}','agent',now());
insert into platform_admins(user_id,granted_by,scope,mfa_required,reason)
 values('${SUPORTE}','${SUPORTE}','full',false,'Local test');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SESS_A}','${ORG_A}','r9026-a','\\x00'::bytea),('${SESS_B}','${ORG_B}','r9026-b','\\x00'::bytea);
insert into contacts(id,organization_id,display_name) values
 ('${id(51)}','${ORG_A}','R9026 Contato 1'),('${id(52)}','${ORG_A}','R9026 Contato 2'),
 ('${id(53)}','${ORG_A}','R9026 Contato 3'),('${id(54)}','${ORG_B}','R9026 Contato B');
insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id) values
 ('${C1}','${ORG_A}','${id(51)}','${SESS_A}','claimed','${AG_DONO}'),
 ('${C2}','${ORG_A}','${id(52)}','${SESS_A}','open',null),
 ('${C3}','${ORG_A}','${id(53)}','${SESS_A}','closed','${REVOGADO}'),
 ('${CB}','${ORG_B}','${id(54)}','${SESS_B}','open',null);
insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,body) values
 ('${id(61)}','${ORG_A}','${C1}','${SESS_A}','${id(51)}','text','inbound','r9026 m1'),
 ('${id(62)}','${ORG_A}','${C2}','${SESS_A}','${id(52)}','text','inbound','r9026 m2'),
 ('${id(63)}','${ORG_A}','${C3}','${SESS_A}','${id(53)}','text','inbound','r9026 m3'),
 ('${id(64)}','${ORG_B}','${CB}','${SESS_B}','${id(54)}','text','inbound','r9026 mb');
insert into crm_pipelines(id,organization_id,name,slug) values
 ('${id(71)}','${ORG_A}','R9026','r9026'),('${id(72)}','${ORG_B}','R9026','r9026');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values
 ('${id(73)}','${ORG_A}','${id(71)}','Novo','novo',1000),('${id(74)}','${ORG_B}','${id(72)}','Novo','novo',1000);
insert into crm_leads(id,organization_id,pipeline_id,stage_id,title,owner_user_id) values
 ('${L1}','${ORG_A}','${id(71)}','${id(73)}','r9026 l1','${AG_DONO}'),
 ('${L2}','${ORG_A}','${id(71)}','${id(73)}','r9026 l2',null),
 ('${L3}','${ORG_A}','${id(71)}','${id(73)}','r9026 l3','${REVOGADO}'),
 ('${LB}','${ORG_B}','${id(72)}','${id(74)}','r9026 lb',null);
`;

function prove(body: string) {
  expect(sql(`${seed}\n${body}\nrollback;\nselect 'provado';`)).toContain("provado");
}

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** Volta ao dono e troca o JWT (sub + sessão do Auth). */
const como = (user: string, session?: string) =>
  `reset role; select set_config('request.jwt.claims', ${lit(
    JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", ...(session ? { session_id: session } : {}) }),
  )}, true);`;

const modo = (m: string | null) =>
  `reset role; update organizations set settings = ${
    m === null ? "coalesce(settings,'{}'::jsonb) - 'visibility_mode'" : `coalesce(settings,'{}'::jsonb) || jsonb_build_object('visibility_mode','${m}')`
  } where id = '${ORG_A}';`;

const NAS_DUAS = `organization_id in ('${ORG_A}','${ORG_B}')`;

/** Leitura sob a policy NOVA (authenticated + JWT já posto). */
const NOVO = {
  conversations: `select count(*) from public.conversations where ${NAS_DUAS}`,
  crm_leads: `select count(*) from public.crm_leads where ${NAS_DUAS}`,
  messages: `select count(*) from public.messages where ${NAS_DUAS}`,
  user_organizations: `select count(*) from public.user_organizations where ${NAS_DUAS}`,
} as const;

/** O predicado ANTIGO como WHERE, avaliado pelo dono (sem RLS), com o mesmo JWT. */
const ANTIGO = {
  conversations: `select count(*) from public.conversations where ${NAS_DUAS} and public.fn_can_view_conversation(organization_id, assigned_to_user_id)`,
  crm_leads: `select count(*) from public.crm_leads where ${NAS_DUAS} and public.fn_can_view_lead(organization_id, owner_user_id)`,
  messages: `select count(*) from public.messages m where ${NAS_DUAS} and (public.fn_is_platform_admin() or exists (select 1 from public.conversations c where c.id = m.conversation_id and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)))`,
  user_organizations: `select count(*) from public.user_organizations where ${NAS_DUAS} and (user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager') or public.fn_is_platform_admin())`,
} as const;

type Tabela = keyof typeof NOVO;

/**
 * Mede uma tabela para o JWT corrente: o número esperado sob a policy nova E a
 * igualdade com o predicado antigo. Termina de volta no papel do dono.
 */
function le(tabela: Tabela, esperado: number, rotulo: string, user: string, session?: string) {
  const tag = `${rotulo} / ${tabela}`;
  return `
${como(user, session)}
select set_config('r9026.antigo', (${ANTIGO[tabela]})::text, true);
set local role authenticated;
do $t$ declare v bigint; a bigint := current_setting('r9026.antigo')::bigint; begin
  execute ${lit(NOVO[tabela])} into v;
  if v is distinct from ${esperado} then raise exception '%: policy nova leu %, esperado ${esperado}', ${lit(tag)}, v; end if;
  if v is distinct from a then raise exception '%: policy nova leu %, predicado antigo %', ${lit(tag)}, v, a; end if;
end $t$;
reset role;`;
}

describe("9026 — RLS de conjunto: forma da função", () => {
  it("fn_escopo_orgs é stable, security definer, search_path fixo, sem argumento e fechada a anon/public", () => {
    const out = sql(`
      select p.provolatile = 's', p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%',
             p.pronargs = 0,
             has_function_privilege('anon', p.oid, 'EXECUTE'),
             has_function_privilege('authenticated', p.oid, 'EXECUTE')
        from pg_proc p where p.oid = 'public.fn_escopo_orgs()'::regprocedure;`);
    expect(out).toBe("t|t|t|t|f|t");
  });

  it("as três policies de SELECT chamam o conjunto e não o predicado por linha", () => {
    const out = sql(`
      select string_agg(tablename || ':' || (qual like '%fn_escopo_orgs%')::text || ':' ||
                        (qual ~ 'fn_can_view_|fn_role_at_least')::text, ',' order by tablename)
        from pg_policies
       where schemaname = 'public'
         and policyname in ('conversations_select','crm_leads_select','user_orgs_select');`);
    expect(out).toBe("conversations:true:false,crm_leads:true:false,user_organizations:true:false");
  });
});

describe("9026 — (a) agent com visibility_mode='all'", () => {
  it("lê conversations, messages e crm_leads da org inteira, e nada da vizinha", () =>
    prove(`${modo("all")}
      ${le("conversations", 3, "agent all", AG_OUTRO)}
      ${le("messages", 3, "agent all", AG_OUTRO)}
      ${le("crm_leads", 3, "agent all", AG_OUTRO)}
      ${le("user_organizations", 1, "agent all", AG_OUTRO)}`));

  it("controle: o mesmo agent sem 'all' (default own_and_unassigned) lê só a fila sem dono", () =>
    prove(`${modo(null)}
      ${le("conversations", 1, "agent default", AG_OUTRO)}
      ${le("crm_leads", 1, "agent default", AG_OUTRO)}
      ${modo("own")}
      ${le("conversations", 0, "agent own", AG_OUTRO)}
      ${le("crm_leads", 0, "agent own", AG_OUTRO)}
      ${le("conversations", 1, "dono own", AG_DONO)}
      ${le("crm_leads", 1, "dono own", AG_DONO)}
      ${le("messages", 1, "dono own", AG_DONO)}`));
});

describe("9026 — (b) sessão de suporte", () => {
  const inicia = (m: "full" | "support_readonly") =>
    `reset role; select fn_start_support('${SUPORTE}','${SESSAO}','${ORG_A}','${ORG_B}','${m}',3600);`;

  for (const m of ["full", "support_readonly"] as const) {
    it(`${m}: lê conversations, messages e crm_leads da org inteira em que entrou`, () =>
      prove(`${modo("own")} ${inicia(m)}
        ${como(SUPORTE, SESSAO)}
        do $t$ begin if (public.fn_support_context()->>'status') is distinct from 'active' then
          raise exception 'controle: a sessão de suporte não ficou ativa'; end if; end $t$;
        do $t$ begin if not exists (select 1 from public.fn_escopo_orgs() e
           where e.organization_id = '${ORG_A}' and e.papel = '${m === "full" ? "admin" : "viewer"}') then
          raise exception 'fn_escopo_orgs não deu a org de suporte com o papel do modo'; end if; end $t$;
        ${le("conversations", 4, `suporte ${m}`, SUPORTE, SESSAO)}
        ${le("messages", 4, `suporte ${m}`, SUPORTE, SESSAO)}
        ${le("crm_leads", 4, `suporte ${m}`, SUPORTE, SESSAO)}`));
  }

  it("user_organizations: o ramo de PAPEL dá o roster ao full e não ao readonly; o platform admin lê o roster nos dois", () =>
    prove(`${inicia("full")} ${como(SUPORTE, SESSAO)}
      do $t$ begin if not exists (select 1 from public.fn_escopo_orgs() e
         where e.organization_id = '${ORG_A}' and e.papel in ('manager','admin')) then
        raise exception 'full: o ramo de papel de user_orgs_select não alcança a org'; end if; end $t$;
      ${le("user_organizations", 7, "suporte full", SUPORTE, SESSAO)}
      reset role; select fn_end_support('${SUPORTE}','${SESSAO}');
      ${inicia("support_readonly")} ${como(SUPORTE, SESSAO)}
      do $t$ begin if exists (select 1 from public.fn_escopo_orgs() e
         where e.organization_id = '${ORG_A}' and e.papel in ('manager','admin')) then
        raise exception 'readonly: o ramo de papel de user_orgs_select alcança a org'; end if; end $t$;
      ${le("user_organizations", 7, "suporte readonly", SUPORTE, SESSAO)}`));

  it("controle: sem sessão de suporte, o ramo de papel não dá a org A a quem é só de B", () =>
    prove(`${como(SUPORTE)}
      do $t$ begin if exists (select 1 from public.fn_escopo_orgs() e where e.organization_id = '${ORG_A}') then
        raise exception 'fn_escopo_orgs deu a org A sem sessão de suporte'; end if; end $t$;`));
});

describe("9026 — (c) membro revogado ainda atribuído lê zero", () => {
  it("antes da revogação lê o que é dele; depois, zero em conversations, messages e crm_leads", () =>
    prove(`${modo("own")}
      ${le("conversations", 1, "revogado ANTES", REVOGADO)}
      ${le("messages", 1, "revogado ANTES", REVOGADO)}
      ${le("crm_leads", 1, "revogado ANTES", REVOGADO)}
      reset role;
      update user_organizations set revoked_at = now() where organization_id = '${ORG_A}' and user_id = '${REVOGADO}';
      do $t$ begin
        if (select assigned_to_user_id from conversations where id = '${C3}') is distinct from '${REVOGADO}'::uuid then
          raise exception 'controle: a conversa encerrada perdeu o dono na revogação — o caso não mede o ramo próprio'; end if;
        if (select owner_user_id from crm_leads where id = '${L3}') is distinct from '${REVOGADO}'::uuid then
          raise exception 'controle: o lead perdeu o dono na revogação — o caso não mede o ramo próprio'; end if;
      end $t$;
      ${le("conversations", 0, "revogado DEPOIS", REVOGADO)}
      ${le("messages", 0, "revogado DEPOIS", REVOGADO)}
      ${le("crm_leads", 0, "revogado DEPOIS", REVOGADO)}
      ${modo("own_and_unassigned")}
      ${le("conversations", 0, "revogado DEPOIS (own_and_unassigned)", REVOGADO)}
      ${le("crm_leads", 0, "revogado DEPOIS (own_and_unassigned)", REVOGADO)}`));
});

describe("9026 — (d) viewer", () => {
  it("lê conversations, messages e crm_leads da org inteira em qualquer modo, e só a própria linha do roster", () =>
    prove(`${modo("own")}
      ${le("conversations", 3, "viewer own", VIEWER)}
      ${le("messages", 3, "viewer own", VIEWER)}
      ${le("crm_leads", 3, "viewer own", VIEWER)}
      ${le("user_organizations", 1, "viewer", VIEWER)}`));
});

describe("9026 — equivalência nos demais papéis e isolamento entre tenants", () => {
  it("manager lê a org inteira e o roster inteiro de A", () =>
    prove(`${modo("own")}
      ${le("conversations", 3, "manager", MANAGER)}
      ${le("crm_leads", 3, "manager", MANAGER)}
      ${le("user_organizations", 5, "manager", MANAGER)}`));

  it("agent de B não lê nada de A, em nenhum modo de A", () =>
    prove(`${modo("all")}
      ${le("conversations", 1, "vizinho", VIZINHO)}
      ${le("messages", 1, "vizinho", VIZINHO)}
      ${le("crm_leads", 1, "vizinho", VIZINHO)}
      ${le("user_organizations", 1, "vizinho", VIZINHO)}`));

  it("sem JWT (auth.uid() nulo) lê zero", () =>
    prove(`reset role; select set_config('request.jwt.claims', '', true); set local role authenticated;
      do $t$ begin
        if (select count(*) from public.conversations where ${NAS_DUAS}) <> 0
        or (select count(*) from public.crm_leads where ${NAS_DUAS}) <> 0
        or (select count(*) from public.user_organizations where ${NAS_DUAS}) <> 0 then
          raise exception 'sessão sem JWT leu linha'; end if; end $t$;
      reset role;`));
});
