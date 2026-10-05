import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * 9036: A POLICY DO ARQUIVO DE WEBHOOK PERGUNTA O PAPEL UMA VEZ POR CONSULTA.
 *
 * A 9035 chamava `fn_role_at_least(organization_id, 'manager')` por linha; a
 * contagem como manager passou de 2 min em produção. A 9036 troca pelo
 * predicado de conjunto da 9027 (`fn_escopo_orgs()`).
 *
 * Duas provas, as duas com controle negativo (a policy da 9035 recriada numa
 * transação desfeita):
 *  1. MESMAS LINHAS por identidade, antes e depois (viewer 0, manager só a
 *     própria org, outra org 0, platform admin tudo, vínculo revogado 0).
 *  2. `fn_role_at_least` ZERO chamadas na policy nova, contra ≥ uma por linha
 *     na antiga — contadas por `pg_stat_xact_user_functions` com
 *     `track_functions = 'all'`, que conta chamada de função não inlineada.
 *
 * Como `postgres` a RLS não vale (rolbypassrls): tudo roda em `set role
 * authenticated` + `request.jwt.claims`, o caminho da produção.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Valores das linhas `R:<chave>=<valor>` da saída do psql. */
function marcados(out: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const linha of out.split("\n")) {
    const m = /^R:([^=]+)=(.*)$/.exec(linha);
    if (m) r[m[1]!] = m[2]!;
  }
  return r;
}

const ORG_A = "eeeeeeee-0000-4000-8000-00000000000a";
const ORG_B = "eeeeeeee-0000-4000-8000-00000000000b";
const U = {
  managerA: "eeeeeeee-1111-4000-8000-000000000001",
  adminA: "eeeeeeee-1111-4000-8000-000000000002",
  viewerA: "eeeeeeee-1111-4000-8000-000000000003",
  agentA: "eeeeeeee-1111-4000-8000-000000000004",
  managerB: "eeeeeeee-1111-4000-8000-000000000005",
  revogado: "eeeeeeee-1111-4000-8000-000000000006",
  plataforma: "eeeeeeee-1111-4000-8000-000000000007",
  misto: "eeeeeeee-1111-4000-8000-000000000008",
} as const;
const LINHAS_A = 3000;
const LINHAS_B = 500;

const POLICY_9035 = `
  drop policy "webhook_events_log_tenant_read" on public.webhook_events_log;
  create policy "webhook_events_log_tenant_read" on public.webhook_events_log for select
    using ((select public.fn_is_platform_admin())
      or (organization_id is not null and public.fn_role_at_least(organization_id, 'manager')));`;

function como(userId: string): string {
  return `set role authenticated;
select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true) is null;`;
}

/** Contagens por org de cada identidade, sob a policy vigente (ou a da 9035). */
function contagens(antiga: boolean): Record<string, string> {
  const partes = Object.entries(U).map(
    ([nome, id]) => `${como(id)}
select 'R:${nome}=' || count(*) filter (where organization_id = '${ORG_A}') || '/'
                    || count(*) filter (where organization_id = '${ORG_B}') || '/'
                    || count(*) filter (where organization_id is null)
  from public.webhook_events_log
 where external_id = 'inv-9036';
reset role;`,
  );
  return marcados(sql(`begin;\n${antiga ? POLICY_9035 : ""}\n${partes.join("\n")}\nrollback;`));
}

/** Chamadas de função durante UMA contagem como manager de A. */
function chamadas(antiga: boolean): { roleAtLeast: number; escopo: number; linhas: number } {
  const out = sql(`
    begin;
    ${antiga ? POLICY_9035 : ""}
    set local track_functions = 'all';
    ${como(U.managerA)}
    select 'R:linhas=' || count(*) from public.webhook_events_log where external_id = 'inv-9036';
    reset role;
    select 'R:role=' || coalesce((select calls from pg_stat_xact_user_functions
                                   where schemaname = 'public' and funcname = 'fn_role_at_least'), 0);
    select 'R:escopo=' || coalesce((select calls from pg_stat_xact_user_functions
                                     where schemaname = 'public' and funcname = 'fn_escopo_orgs'), 0);
    rollback;`);
  const r = marcados(out);
  return { roleAtLeast: Number(r.role), escopo: Number(r.escopo), linhas: Number(r.linhas) };
}

function plano(antiga: boolean): string {
  return sql(`
    begin;
    ${antiga ? POLICY_9035 : ""}
    ${como(U.managerA)}
    explain (analyze, buffers, costs off, timing on) select count(*) from public.webhook_events_log;
    reset role;
    rollback;`);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email)
    select id::uuid, 'arquivo-9036-' || n || '@invariant.test'
      from (values ${Object.values(U).map((id, i) => `('${id}', ${i})`).join(",")}) v(id, n)
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'arquivo-9036-a', 'Arquivo 9036 A', 'Arquivo A'),
      ('${ORG_B}', 'arquivo-9036-b', 'Arquivo 9036 B', 'Arquivo B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at, revoked_at) values
      ('${U.managerA}', '${ORG_A}', 'manager', now(), null),
      ('${U.adminA}',   '${ORG_A}', 'admin',   now(), null),
      ('${U.viewerA}',  '${ORG_A}', 'viewer',  now(), null),
      ('${U.agentA}',   '${ORG_A}', 'agent',   now(), null),
      ('${U.managerB}', '${ORG_B}', 'manager', now(), null),
      ('${U.revogado}', '${ORG_A}', 'manager', now(), now()),
      ('${U.misto}',    '${ORG_A}', 'agent',   now(), null),
      ('${U.misto}',    '${ORG_B}', 'manager', now(), null)
      on conflict do nothing;

    insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason)
      values ('${U.plataforma}', '${U.plataforma}', 'full', false, 'invariante 9036')
      on conflict do nothing;

    insert into public.webhook_events_log (organization_id, provider, http_method, raw_body, external_id, status)
    select '${ORG_A}'::uuid, 'generic', 'POST', '', 'inv-9036', 'received' from generate_series(1, ${LINHAS_A});
    insert into public.webhook_events_log (organization_id, provider, http_method, raw_body, external_id, status)
    select '${ORG_B}'::uuid, 'generic', 'POST', '', 'inv-9036', 'received' from generate_series(1, ${LINHAS_B});
    insert into public.webhook_events_log (organization_id, provider, http_method, raw_body, external_id, status)
    values (null, 'generic', 'POST', '', 'inv-9036', 'received');
    analyze public.webhook_events_log;
  `);
});

describe("9036: mesmas linhas antes e depois, por identidade", () => {
  it("a policy de conjunto devolve o que a da 9035 devolvia (e o esperado por papel)", () => {
    const depois = contagens(false);
    const antes = contagens(true);
    expect(depois).toEqual({
      managerA: `${LINHAS_A}/0/0`,
      adminA: `${LINHAS_A}/0/0`,
      viewerA: "0/0/0",
      agentA: "0/0/0",
      managerB: `0/${LINHAS_B}/0`,
      revogado: "0/0/0",
      plataforma: `${LINHAS_A}/${LINHAS_B}/1`,
      misto: `0/${LINHAS_B}/0`,
    });
    expect(depois).toEqual(antes);
  });
});

describe("9036: o papel é perguntado uma vez por consulta, não por linha", () => {
  it("controle negativo: na policy da 9035, fn_role_at_least roda ao menos uma vez por linha", () => {
    const r = chamadas(true);
    expect(r.linhas).toBe(LINHAS_A);
    expect(r.roleAtLeast).toBeGreaterThanOrEqual(LINHAS_A);
  });

  it("na policy da 9036, fn_role_at_least não roda e fn_escopo_orgs roda uma vez", () => {
    const r = chamadas(false);
    expect(r.linhas).toBe(LINHAS_A);
    expect(r.roleAtLeast).toBe(0);
    expect(r.escopo).toBeGreaterThanOrEqual(1);
    expect(r.escopo).toBeLessThanOrEqual(2);
  });

  it("EXPLAIN: o filtro da policy nova é semi-join com o conjunto, sem função por linha", () => {
    const antes = plano(true);
    const depois = plano(false);
    // Registrado no log do CI para o relatório (tempo e buffers, antes/depois).
    console.info(`[9036] EXPLAIN 9035 (por linha):\n${antes}\n\n[9036] EXPLAIN 9036 (conjunto):\n${depois}`);
    expect(antes).toMatch(/fn_role_at_least/);
    expect(depois).not.toMatch(/fn_role_at_least/);
    expect(depois).toMatch(/fn_escopo_orgs/);
    expect(depois).toMatch(/SubPlan|Semi Join|InitPlan/);
  });
});
