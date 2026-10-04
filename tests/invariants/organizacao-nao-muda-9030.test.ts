import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9030: a linha não troca de organização (trigger em toda tabela cuja
 * `for all` só exige tenancy) e contato só é escrito por agent+.
 *
 * O furo: quem tinha vínculo em A e em B passava nas duas pontas da `for all`
 * (USING e WITH CHECK) e movia um contato de A para B com um UPDATE direto.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MIX = id(11); // agent em A + manager em B
const VW_A = id(12);
const AG_A = id(13);
const PA = id(14);
const CT = id(21);
const DEM = id(31);

const seed = `
begin;
insert into auth.users(id,email) values
 ('${MIX}','o9030-mix@invariant.test'),('${VW_A}','o9030-vw@invariant.test'),
 ('${AG_A}','o9030-ag@invariant.test'),('${PA}','o9030-pa@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','o9030-a','O9030 A','O9030 A'),('${ORG_B}','o9030-b','O9030 B','O9030 B');
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MIX}','agent',now()),('${ORG_B}','${MIX}','manager',now()),
 ('${ORG_A}','${VW_A}','viewer',now()),('${ORG_A}','${AG_A}','agent',now());
insert into platform_admins(user_id,granted_by,scope,mfa_required,reason) values('${PA}','${PA}','full',false,'Local test');
insert into contacts(id,organization_id,display_name) values ('${CT}','${ORG_A}','O9030 Contato');
insert into demandas(id,organization_id,contact_id) values ('${DEM}','${ORG_A}','${CT}');
`;

const como = (user: string) =>
  `reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" })}', true); set local role authenticated;`;

/** Roda o comando num subtransação e devolve `n=<linhas>` ou o SQLSTATE. */
function tenta(prefixo: string, comando: string): string {
  const out = sql(`${seed}
create temp table r9030(v text); grant all on r9030 to authenticated, service_role;
${prefixo}
do $t$ declare n bigint; begin
  begin
    ${comando}
    get diagnostics n = row_count;
    raise exception using errcode = 'P0001', message = 'n=' || n;
  exception when others then
    insert into pg_temp.r9030 values (case when sqlstate = 'P0001' then sqlerrm else sqlstate end);
  end;
end $t$;
reset role;
select 'v=' || v from pg_temp.r9030;
rollback;`);
  const linha = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith("v="));
  return linha?.slice(2) ?? `sem resultado: ${out}`;
}

const MOVE_CONTATO = `update public.contacts set organization_id = '${ORG_B}' where id = '${CT}';`;
const SEM_TRIGGER = `drop trigger trg_organizacao_nao_muda on public.contacts; drop trigger trg_organizacao_nao_muda on public.demandas;`;

describe("9030: a linha não troca de organização", () => {
  it("quem tem vínculo em A e em B não move o contato de A para B (42501)", () => {
    expect(tenta(como(MIX), MOVE_CONTATO)).toBe("42501");
  });

  it("CONTROLE: sem a trigger o mesmo UPDATE passa (o furo que ela fecha)", () => {
    expect(tenta(`${SEM_TRIGGER}\n${como(MIX)}`, MOVE_CONTATO)).toBe("n=1");
  });

  it("vale para service_role e platform admin, que não dependem da RLS", () => {
    expect(tenta("reset role; set local role service_role;", MOVE_CONTATO)).toBe("42501");
    expect(tenta(como(PA), MOVE_CONTATO)).toBe("42501");
  });

  it("vale nas outras tabelas tenant-only (demandas)", () => {
    const move = `update public.demandas set organization_id = '${ORG_B}' where id = '${DEM}';`;
    expect(tenta(como(MIX), move)).toBe("42501");
    expect(tenta(`${SEM_TRIGGER}\n${como(MIX)}`, move)).toBe("n=1");
  });

  it("fluxo legítimo passa: UPDATE comum e upsert que regrava a MESMA organização", () => {
    expect(tenta(como(AG_A), `update public.contacts set display_name = 'O9030 novo' where id = '${CT}';`)).toBe("n=1");
    expect(
      tenta(
        "reset role; set local role service_role;",
        `insert into public.contacts(id,organization_id,display_name) values ('${CT}','${ORG_A}','O9030 upsert')
           on conflict (id) do update set organization_id = excluded.organization_id, display_name = excluded.display_name;`,
      ),
    ).toBe("n=1");
  });

  it("toda tabela com organization_id e for all só de tenancy tem a trigger", () => {
    const semTrigger = sql(`
      select coalesce(string_agg(distinct p.tablename, ',' order by p.tablename), '')
        from pg_policies p
        join information_schema.columns c
          on c.table_schema = 'public' and c.table_name = p.tablename and c.column_name = 'organization_id'
       where p.schemaname = 'public' and p.cmd = 'ALL' and p.permissive = 'PERMISSIVE'
         and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%role_at_least%'
         -- a regra decide pela organização (fora: \`incidents\`, que é só do platform admin)
         and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%organization_id%'
         and not exists (
           select 1 from pg_trigger t
            where t.tgrelid = format('public.%I', p.tablename)::regclass
              and t.tgname = 'trg_organizacao_nao_muda' and not t.tgisinternal);`);
    expect(semTrigger).toBe("");
    const comTrigger = sql(`select count(*) from pg_trigger where tgname = 'trg_organizacao_nao_muda' and not tgisinternal;`);
    expect(Number(comTrigger)).toBeGreaterThanOrEqual(52);
  });
});

describe("9030: contato só é escrito por agent+", () => {
  it("viewer não grava contato (42501 no INSERT; UPDATE e DELETE não alcançam linha)", () => {
    expect(
      tenta(como(VW_A), `insert into public.contacts(organization_id,display_name) values ('${ORG_A}','O9030 do viewer');`),
    ).toBe("42501");
    expect(tenta(como(VW_A), `update public.contacts set display_name = 'x' where id = '${CT}';`)).toBe("n=0");
    expect(tenta(como(VW_A), `delete from public.contacts where id = '${CT}';`)).toBe("n=0");
  });

  it("viewer continua LENDO o contato", () => {
    expect(tenta(como(VW_A), `perform 1 from public.contacts where id = '${CT}';`)).toBe("n=1");
  });

  it("agent e platform admin gravam", () => {
    expect(
      tenta(como(AG_A), `insert into public.contacts(organization_id,display_name) values ('${ORG_A}','O9030 do agent');`),
    ).toBe("n=1");
    expect(tenta(como(PA), `update public.contacts set display_name = 'y' where id = '${CT}';`)).toBe("n=1");
  });
});
