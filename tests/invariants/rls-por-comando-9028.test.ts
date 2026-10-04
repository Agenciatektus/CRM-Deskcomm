import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9028: policies POR COMANDO e `(select fn_is_platform_admin())` nas
 * tabelas lidas pela caixa de entrada e pela conversa.
 *
 * A promessa é "antes = depois": nenhum papel lê ou escreve diferente. A prova
 * mede, para cada ator, o que ele consegue fazer em cada tabela (linhas lidas,
 * linhas que um UPDATE e um DELETE alcançam, INSERT na org A e na org B) duas
 * vezes na MESMA transação: uma com as policies novas (as do banco) e outra
 * depois de trocar pelas definições ANTIGAS, literais abaixo. Os dois vetores
 * têm de ser iguais. Tudo termina em ROLLBACK.
 *
 * Controle negativo no próprio arquivo: com um mutante que perde o filtro por
 * organização (ou o papel da escrita) no lugar das antigas, o vetor TEM de
 * mudar, senão o instrumento não mede nada.
 *
 * Suporte: todo ator de suporte é platform admin (`fn_start_support` exige
 * `platform_admins`), e o ramo `fn_is_platform_admin()` decide a LEITURA antes
 * de qualquer outro. Na leitura o suporte se comporta como platform admin; o
 * que difere é a ESCRITA, por causa das restritivas `support_write_*`, e é isso
 * que os casos de suporte deste vetor medem.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `92800000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const ORG_F = id(3); // org "livre": alvo do DELETE de organizations
const MGR_A = id(11);
const ADM_A = id(12);
const AG_A = id(13);
const VW_A = id(14);
const REV = id(15); // agent de A REVOGADO, e agent ativo em B
const MIX = id(16); // agent em A + manager em B
const PA = id(17); // platform admin sem vínculo
const SUP = id(18); // platform admin, admin de B, entra em A por suporte
const OUT = id(19); // usuário sem vínculo nenhum
const SESSAO = id(20);

const SA = id(21);
const SB = id(22);
const SA_LIVRE = id(23);
const SB_LIVRE = id(24);
const CTA = id(31);
const CTB = id(32);
const CTA_LIVRE = id(33);
const CTB_LIVRE = id(34);
const CA1 = id(41); // A, de AG_A
const CA2 = id(42); // A, sem dono
const CA3 = id(43); // A, do REV (encerrada)
const CB1 = id(44); // B, de MIX
const CB2 = id(45); // B, sem dono
const PIPE_A = id(51);
const PIPE_B = id(52);

const seed = `
begin;
insert into auth.users(id,email) values
 ('${MGR_A}','r9028-mgr@invariant.test'),('${ADM_A}','r9028-adm@invariant.test'),('${AG_A}','r9028-ag@invariant.test'),
 ('${VW_A}','r9028-vw@invariant.test'),('${REV}','r9028-rev@invariant.test'),('${MIX}','r9028-mix@invariant.test'),
 ('${PA}','r9028-pa@invariant.test'),('${SUP}','r9028-sup@invariant.test'),('${OUT}','r9028-out@invariant.test');
insert into auth.sessions(id,user_id,aal) values('${SESSAO}','${SUP}','aal1');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','r9028-a','R9028 A','R9028 A'),('${ORG_B}','r9028-b','R9028 B','R9028 B'),
 ('${ORG_F}','r9028-f','R9028 F','R9028 F');
update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"own"}' where id = '${ORG_A}';
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MGR_A}','manager',now()),('${ORG_A}','${ADM_A}','admin',now()),('${ORG_A}','${AG_A}','agent',now()),
 ('${ORG_A}','${VW_A}','viewer',now()),('${ORG_A}','${REV}','agent',now()),('${ORG_B}','${REV}','agent',now()),
 ('${ORG_A}','${MIX}','agent',now()),('${ORG_B}','${MIX}','manager',now()),
 ('${ORG_B}','${SUP}','admin',now()),('${ORG_F}','${ADM_A}','admin',now());
insert into platform_admins(user_id,granted_by,scope,mfa_required,reason) values
 ('${PA}','${PA}','full',false,'Local test'),('${SUP}','${SUP}','full',false,'Local test');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SA}','${ORG_A}','r9028-a','\\x00'::bytea),('${SB}','${ORG_B}','r9028-b','\\x00'::bytea),
 ('${SA_LIVRE}','${ORG_A}','r9028-a2','\\x00'::bytea),('${SB_LIVRE}','${ORG_B}','r9028-b2','\\x00'::bytea);
insert into contacts(id,organization_id,display_name) values
 ('${CTA}','${ORG_A}','R9028 Contato A'),('${CTB}','${ORG_B}','R9028 Contato B'),
 ('${CTA_LIVRE}','${ORG_A}','R9028 Livre A'),('${CTB_LIVRE}','${ORG_B}','R9028 Livre B'),
 ('${id(35)}','${ORG_A}','R9028 Contato A2'),('${id(36)}','${ORG_A}','R9028 Contato A3'),('${id(37)}','${ORG_B}','R9028 Contato B2');
insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id) values
 ('${CA1}','${ORG_A}','${CTA}','${SA}','claimed','${AG_A}'),
 ('${CA2}','${ORG_A}','${id(35)}','${SA}','open',null),
 ('${CA3}','${ORG_A}','${id(36)}','${SA}','claimed','${REV}'),
 ('${CB1}','${ORG_B}','${CTB}','${SB}','claimed','${MIX}'),
 ('${CB2}','${ORG_B}','${id(37)}','${SB}','open',null);
insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,body)
 select c.organization_id, c.id, c.channel_session_id, c.contact_id, 'text', 'inbound', 'r9028 m' from conversations c
  where c.id in ('${CA1}','${CA2}','${CA3}','${CB1}','${CB2}');
update conversations set status = 'closed' where id = '${CA3}';
update user_organizations set revoked_at = now() where organization_id = '${ORG_A}' and user_id = '${REV}';
insert into conversation_notes(organization_id,conversation_id,body)
 select c.organization_id, c.id, 'r9028 nota' from conversations c
  where c.id in ('${CA1}','${CA2}','${CA3}','${CB1}','${CB2}');
insert into crm_pipelines(id,organization_id,name,slug) values
 ('${PIPE_A}','${ORG_A}','R9028','r9028'),('${PIPE_B}','${ORG_B}','R9028','r9028');
create temp table r9028(fase text, k text, v text);
grant all on r9028 to authenticated;
`;

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

const ATORES: Array<[string, string, string?]> = [
  ["mgr_a", MGR_A], ["adm_a", ADM_A], ["ag_a", AG_A], ["vw_a", VW_A], ["rev", REV],
  ["mix", MIX], ["pa", PA], ["out", OUT],
];

/** Uma tentativa num subtransação: devolve `n=<linhas>` ou o SQLSTATE do erro. */
const tenta = (fase: string, chave: string, comando: string) => `
  begin
    ${comando}
    get diagnostics n = row_count;
    raise exception using errcode = 'P0001', message = 'n=' || n;
  exception when others then
    insert into pg_temp.r9028 values (${lit(fase)}, ${lit(chave)},
      case when sqlstate = 'P0001' then sqlerrm else sqlstate end);
  end;`;

const ORGS = `('${ORG_A}','${ORG_B}')`;

/** O que um ator consegue fazer, tabela por tabela. Roda como `authenticated`. */
function mede(fase: string, ator: string) {
  const k = (t: string) => `${ator}:${t}`;
  const linhas: string[] = [];
  const conta = (t: string, q: string) =>
    linhas.push(`insert into pg_temp.r9028 select ${lit(fase)}, ${lit(k(t))}, (${q})::text;`);
  conta("channel_sessions:sel", `select count(*) from public.channel_sessions where organization_id in ${ORGS}`);
  conta("contacts:sel", `select count(*) from public.contacts where organization_id in ${ORGS}`);
  conta("conversation_notes:sel", `select count(*) from public.conversation_notes where organization_id in ${ORGS}`);
  conta("crm_pipelines:sel", `select count(*) from public.crm_pipelines where organization_id in ${ORGS}`);
  conta("messages:sel", `select count(*) from public.messages where organization_id in ${ORGS}`);
  conta("organizations:sel", `select count(*) from public.organizations where id in ('${ORG_A}','${ORG_B}','${ORG_F}')`);
  const escrita = [
    tenta(fase, k("channel_sessions:upd"), `update public.channel_sessions set display_name = display_name where organization_id in ${ORGS};`),
    tenta(fase, k("channel_sessions:del"), `delete from public.channel_sessions where id in ('${SA_LIVRE}','${SB_LIVRE}');`),
    tenta(fase, k("channel_sessions:ins_a"), `insert into public.channel_sessions(organization_id,waha_session_name,webhook_secret_encrypted) values ('${ORG_A}','r9028-novo-a','\\x00'::bytea);`),
    tenta(fase, k("channel_sessions:ins_b"), `insert into public.channel_sessions(organization_id,waha_session_name,webhook_secret_encrypted) values ('${ORG_B}','r9028-novo-b','\\x00'::bytea);`),
    tenta(fase, k("contacts:upd"), `update public.contacts set display_name = display_name where organization_id in ${ORGS};`),
    tenta(fase, k("contacts:del"), `delete from public.contacts where id in ('${CTA_LIVRE}','${CTB_LIVRE}');`),
    tenta(fase, k("contacts:ins_a"), `insert into public.contacts(organization_id,display_name) values ('${ORG_A}','R9028 novo');`),
    tenta(fase, k("contacts:ins_b"), `insert into public.contacts(organization_id,display_name) values ('${ORG_B}','R9028 novo');`),
    tenta(fase, k("conversation_notes:upd"), `update public.conversation_notes set body = body where organization_id in ${ORGS};`),
    tenta(fase, k("conversation_notes:del"), `delete from public.conversation_notes where organization_id in ${ORGS};`),
    tenta(fase, k("conversation_notes:ins_a"), `insert into public.conversation_notes(organization_id,conversation_id,body) values ('${ORG_A}','${CA1}','r9028 nova');`),
    tenta(fase, k("conversation_notes:ins_b"), `insert into public.conversation_notes(organization_id,conversation_id,body) values ('${ORG_B}','${CB1}','r9028 nova');`),
    tenta(fase, k("crm_pipelines:upd"), `update public.crm_pipelines set name = name where organization_id in ${ORGS};`),
    tenta(fase, k("crm_pipelines:del"), `delete from public.crm_pipelines where organization_id in ${ORGS};`),
    tenta(fase, k("crm_pipelines:ins_a"), `insert into public.crm_pipelines(organization_id,name,slug) values ('${ORG_A}','R9028 n','r9028-n');`),
    tenta(fase, k("crm_pipelines:ins_b"), `insert into public.crm_pipelines(organization_id,name,slug) values ('${ORG_B}','R9028 n','r9028-n');`),
    tenta(fase, k("organizations:upd"), `update public.organizations set display_name = display_name where id in ('${ORG_A}','${ORG_B}','${ORG_F}');`),
    tenta(fase, k("organizations:del"), `delete from public.organizations where id = '${ORG_F}';`),
    // UPDATE que MUDA a organização da linha (de A para B): o WITH CHECK do
    // update tem de valer igual antes e depois (P2 do Cassio na #66).
    ...["channel_sessions", "contacts", "conversation_notes", "crm_pipelines"].map((t) =>
      tenta(fase, k(`${t}:upd_move`), `update public.${t} set organization_id = '${ORG_B}' where organization_id = '${ORG_A}';`),
    ),
    tenta(fase, k("organizations:ins"), `insert into public.organizations(slug,display_name,legal_name) values ('r9028-nova','R9028 N','R9028 N');`),
  ];
  return `${linhas.join("\n")}\ndo $m$ declare n bigint; begin ${escrita.join("\n")} end $m$;`;
}

const como = (user: string, session?: string) =>
  `reset role; select set_config('request.jwt.claims', ${lit(
    JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", ...(session ? { session_id: session } : {}) }),
  )}, true); set local role authenticated;`;

/** Todos os atores, mais o suporte full e readonly em A, numa fase. */
function medeTodos(fase: string) {
  const partes = ATORES.map(([nome, user]) => `${como(user)}\n${mede(fase, nome)}`);
  for (const modo of ["full", "support_readonly"]) {
    partes.push(`reset role; select fn_start_support('${SUP}','${SESSAO}','${ORG_A}','${ORG_B}','${modo}',3600);
${como(SUP, SESSAO)}
${mede(fase, `sup_${modo}`)}
reset role; select fn_end_support('${SUP}','${SESSAO}');`);
  }
  partes.push(`reset role; select set_config('request.jwt.claims', '', true); set local role authenticated;\n${mede(fase, "sem_jwt")}`);
  return `${partes.join("\n")}\nreset role;`;
}

/** As definições ANTERIORES à 9028, literais (é também o rollback). */
export const ANTIGAS = `
drop policy if exists channel_sessions_tenant_select on public.channel_sessions;
create policy channel_sessions_tenant_select on public.channel_sessions
  for select using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
create policy channel_sessions_tenant_write on public.channel_sessions
  for all using ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin')) or public.fn_is_platform_admin())
  with check ((organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin')) or public.fn_is_platform_admin());
drop policy if exists "crm_pipelines_select" on public.crm_pipelines;
create policy "crm_pipelines_select" on public.crm_pipelines
  for select using ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin());
create policy "crm_pipelines_manager_write" on public.crm_pipelines
  using (public.fn_is_platform_admin() or ((organization_id in (select public.fn_user_org_ids())) and public.fn_role_at_least(organization_id, 'manager')))
  with check (public.fn_is_platform_admin() or ((organization_id in (select public.fn_user_org_ids())) and public.fn_role_at_least(organization_id, 'manager')));
drop policy if exists "conversation_notes_select_platform_admin" on public.conversation_notes;
create policy "conversation_notes_select_platform_admin" on public.conversation_notes
  for select using (public.fn_is_platform_admin());
create policy "conversation_notes_write" on public.conversation_notes
  for all using (
    organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.conversations c where c.organization_id = conversation_notes.organization_id
      and c.id = conversation_notes.conversation_id and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)))
  with check (
    organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.conversations c where c.organization_id = conversation_notes.organization_id
      and c.id = conversation_notes.conversation_id and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)));
drop policy if exists "orgs_select" on public.organizations;
create policy "orgs_select" on public.organizations
  for select using ((id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin());
create policy "orgs_write_platform_admin" on public.organizations
  using (public.fn_is_platform_admin()) with check (public.fn_is_platform_admin());
drop policy if exists "tenant_isolation_contacts_all" on public.contacts;
create policy "tenant_isolation_contacts_all" on public.contacts
  using ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin())
  with check ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin());
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (public.fn_is_platform_admin() or exists (select 1 from public.conversations c where c.id = messages.conversation_id));
`;

/** Apaga as policies por comando que a 9028 criou (para pôr outra versão no lugar). */
const SEM_AS_NOVAS = `
drop policy if exists channel_sessions_tenant_insert on public.channel_sessions;
drop policy if exists channel_sessions_tenant_update on public.channel_sessions;
drop policy if exists channel_sessions_tenant_delete on public.channel_sessions;
drop policy if exists "crm_pipelines_manager_insert" on public.crm_pipelines;
drop policy if exists "crm_pipelines_manager_update" on public.crm_pipelines;
drop policy if exists "crm_pipelines_manager_delete" on public.crm_pipelines;
drop policy if exists "conversation_notes_insert" on public.conversation_notes;
drop policy if exists "conversation_notes_update" on public.conversation_notes;
drop policy if exists "conversation_notes_delete" on public.conversation_notes;
drop policy if exists "orgs_insert_platform_admin" on public.organizations;
drop policy if exists "orgs_update_platform_admin" on public.organizations;
drop policy if exists "orgs_delete_platform_admin" on public.organizations;
drop policy if exists "contacts_select" on public.contacts;
drop policy if exists "contacts_insert" on public.contacts;
drop policy if exists "contacts_update" on public.contacts;
drop policy if exists "contacts_delete" on public.contacts;
`;

/** Mede com as policies do banco ("novo"), troca por `outra` e mede de novo; devolve as diferenças. */
function diferencas(outra: string): string[] {
  const out = sql(`${seed}
${medeTodos("novo")}
${SEM_AS_NOVAS}
${outra}
${medeTodos("outro")}
select coalesce(string_agg(n.k || ' novo=' || n.v || ' outro=' || coalesce(o.v, '?'), ';' order by n.k), '')
  from pg_temp.r9028 n left join pg_temp.r9028 o on o.k = n.k and o.fase = 'outro'
 where n.fase = 'novo' and n.v is distinct from o.v;
select 'linhas=' || count(*) from pg_temp.r9028 where fase = 'novo';
rollback;`);
  const linhas = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const total = linhas.find((l) => l.startsWith("linhas="));
  // 11 atores × 29 medidas: se o vetor encolher, a comparação vira vazia por construção.
  expect(total).toBe(`linhas=${11 * 29}`);
  const diffs = linhas.filter((l) => !l.startsWith("linhas=") && /novo=/.test(l));
  return diffs.join(";").split(";").filter(Boolean);
}

/** O vetor "novo" de um ator, para as âncoras escritas à mão. */
function vetorNovo(): Map<string, string> {
  const out = sql(`${seed}
${medeTodos("novo")}
select k || '=' || v from pg_temp.r9028 where fase = 'novo' order by k;
rollback;`);
  const m = new Map<string, string>();
  for (const l of out.split("\n").map((x) => x.trim())) {
    const r = /^([a-z_]+:[a-z_]+:[a-z_]+)=(.*)$/.exec(l);
    if (r?.[1] !== undefined && r[2] !== undefined) m.set(r[1], r[2]);
  }
  return m;
}

describe("9028: forma", () => {
  it("as quatro tabelas não têm mais `for all` de escrita; leitura com platform admin uma vez por consulta", () => {
    const out = sql(`
      select coalesce(string_agg(tablename || ':' || policyname, ',' order by tablename, policyname), '')
        from pg_policies
       where schemaname = 'public' and cmd = 'ALL'
         and tablename in ('channel_sessions','crm_pipelines','conversation_notes','organizations');`);
    expect(out).toBe("");
    const solto = sql(`
      select coalesce(string_agg(tablename || ':' || policyname, ',' order by tablename, policyname), '')
        from pg_policies
       where schemaname = 'public'
         and policyname in ('channel_sessions_tenant_select','crm_pipelines_select','conversation_notes_select_platform_admin',
                            'messages_select','orgs_select','contacts_select')
         and qual !~ '\\(\\s*SELECT fn_is_platform_admin\\(\\) AS fn_is_platform_admin\\)';`);
    expect(solto).toBe("");
    // A régua acima só vale se as seis existem (a de contacts virou contacts_select na 9030).
    const existem = sql(`
      select count(*) from pg_policies
       where schemaname = 'public'
         and policyname in ('channel_sessions_tenant_select','crm_pipelines_select','conversation_notes_select_platform_admin',
                            'messages_select','orgs_select','contacts_select');`);
    expect(existem).toBe("6");
  });

  it("a escrita por comando tem o MESMO texto nos três comandos (e o do WITH CHECK do update é igual ao USING)", () => {
    const out = sql(`
      select coalesce(string_agg(t, ',' order by t), '')
        from unnest(array['channel_sessions','crm_pipelines','conversation_notes','organizations']) t
        left join lateral (
          select count(*) as n,
                 count(distinct coalesce(qual, with_check)) as textos,
                 count(*) filter (where cmd = 'UPDATE' and qual is distinct from with_check) as update_torto
            from pg_policies p
           where p.schemaname = 'public' and p.tablename = t
             and p.cmd in ('INSERT','UPDATE','DELETE') and p.permissive = 'PERMISSIVE') x on true
       where x.n <> 3 or x.textos <> 1 or x.update_torto > 0;`);
    expect(out).toBe("");
  });
});

describe("9028: antes = depois, por papel e tabela", () => {
  it("as policies novas e as antigas dão o MESMO vetor de leitura e escrita para todo ator", () => {
    // A ÚNICA diferença é a que a 9030 introduziu de propósito: contacts deixou
    // de aceitar escrita de viewer (as antigas aqui são as de antes da 9028, e a
    // trigger da 9030, que vale nas duas fases, recusa o upd_move). Qualquer
    // outra linha neste diff é regressão.
    expect(diferencas(ANTIGAS)).toEqual([
      "vw_a:contacts:del novo=n=0 outro=n=1",
      "vw_a:contacts:ins_a novo=42501 outro=n=1",
      "vw_a:contacts:upd novo=n=0 outro=n=4",
      "vw_a:contacts:upd_move novo=n=0 outro=42501",
    ]);
  });

  it("âncoras escritas à mão: o vetor mede alguma coisa (isolamento, papel, revogado, suporte)", () => {
    const v = vetorNovo();
    // manager de A lê o canal e o funil de A, não os de B
    expect(v.get("mgr_a:channel_sessions:sel")).toBe("2");
    expect(v.get("mgr_a:crm_pipelines:sel")).toBe("2"); // o seu e o funil padrão que a org ganha
    // só admin+ de A escreve em channel_sessions, e só em A
    expect(v.get("adm_a:channel_sessions:upd")).toBe("n=2");
    expect(v.get("mgr_a:channel_sessions:upd")).toBe("n=0");
    expect(v.get("adm_a:channel_sessions:ins_b")).toBe("42501");
    // viewer lê e não escreve funil
    expect(v.get("vw_a:crm_pipelines:sel")).toBe("2");
    expect(v.get("vw_a:crm_pipelines:upd")).toBe("n=0");
    // revogado de A, ainda agent de B: só B (os dois canais de B, a nota da conversa sem dono de B)
    expect(v.get("rev:channel_sessions:sel")).toBe("2");
    expect(v.get("rev:conversation_notes:sel")).toBe("1");
    expect(v.get("rev:conversation_notes:ins_a")).toBe("42501");
    // misto (agent em A, manager em B): escreve funil só em B
    expect(v.get("mix:crm_pipelines:upd")).toBe("n=2");
    expect(v.get("mix:crm_pipelines:ins_a")).toBe("42501");
    expect(v.get("mix:crm_pipelines:ins_b")).toBe("n=1");
    // mudar a linha de organização: o admin de A não leva o canal para B (WITH
    // CHECK), e desde a 9031 nem o platform admin leva (trg_organizacao_nao_muda
    // em toda tabela com organization_id; antes da 9031 era n=2)
    expect(v.get("adm_a:channel_sessions:upd_move")).toBe("42501");
    expect(v.get("pa:channel_sessions:upd_move")).toBe("42501");
    expect(v.get("pa:crm_pipelines:upd_move")).toBe("42501");
    // sem vínculo e sem JWT: nada
    expect(v.get("out:contacts:sel")).toBe("0");
    expect(v.get("sem_jwt:messages:sel")).toBe("0");
    // platform admin lê tudo; o suporte readonly é barrado na escrita de A pela restritiva
    expect(v.get("pa:channel_sessions:sel")).toBe("4");
    expect(v.get("sup_support_readonly:contacts:ins_a")).toBe("42501");
    expect(v.get("sup_full:contacts:ins_a")).toBe("n=1");
  });
});

describe("9028: controle negativo (o instrumento pega mutante)", () => {
  it("SELECT de channel_sessions sem o filtro por organização: o vetor muda", () => {
    const mutante = ANTIGAS.replace(
      "for select using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());",
      "for select using (organization_id is not null or public.fn_is_platform_admin());",
    );
    expect(mutante).not.toBe(ANTIGAS);
    const d = diferencas(mutante);
    expect(d.some((x) => x.startsWith("mgr_a:channel_sessions:sel"))).toBe(true);
    expect(d.some((x) => x.startsWith("out:channel_sessions:sel"))).toBe(true);
  });

  it("escrita de crm_pipelines sem o papel (só tenancy): o vetor muda", () => {
    const mutante = ANTIGAS.replace(
      `create policy "crm_pipelines_manager_write" on public.crm_pipelines
  using (public.fn_is_platform_admin() or ((organization_id in (select public.fn_user_org_ids())) and public.fn_role_at_least(organization_id, 'manager')))`,
      `create policy "crm_pipelines_manager_write" on public.crm_pipelines
  using (public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids())))`,
    );
    expect(mutante).not.toBe(ANTIGAS);
    const d = diferencas(mutante);
    expect(d.some((x) => x.startsWith("vw_a:crm_pipelines:upd"))).toBe(true);
  });

  it("contacts sem o filtro por organização: o vetor muda", () => {
    const mutante = ANTIGAS.replace(
      `using ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin())
  with check ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin());
drop policy if exists "messages_select"`,
      `using (organization_id is not null)
  with check ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin());
drop policy if exists "messages_select"`,
    );
    expect(mutante).not.toBe(ANTIGAS);
    const d = diferencas(mutante);
    expect(d.some((x) => x.startsWith("rev:contacts:sel"))).toBe(true);
  });
});
