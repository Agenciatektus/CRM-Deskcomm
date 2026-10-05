import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * 9035: O ARQUIVO DE WEBHOOK É LIDO SÓ POR MANAGER+, E NENHUMA SESSÃO LÊ O CORPO.
 *
 * Antes: `webhook_events_log_tenant_read` org-flat sem papel, e `authenticated`
 * com SELECT na tabela inteira — um `viewer` lia `raw_body`, `headers` e
 * `payload_parsed` de toda entrega da organização pelo PostgREST (revisão do
 * @Cassio_SecRev na #98).
 *
 * Conectar como `postgres` mediria NADA (rolbypassrls = t). Aqui é `set role
 * authenticated` + `request.jwt.claims`, o caminho da produção. O controle
 * negativo recria o estado antigo dentro de uma transação desfeita e prova que
 * o mesmo instrumento ENXERGA o vazamento — senão "0 linhas" poderia ser só
 * semente que não entrou.
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

/** Roda e devolve o erro do psql (stderr), ou `null` se não houve erro. */
function erroDe(script: string): string | null {
  try {
    sql(script);
    return null;
  } catch (err) {
    const e = err as { stderr?: string | Buffer; message?: string };
    return String(e.stderr ?? e.message ?? err);
  }
}

function como(userId: string): string {
  return `set role authenticated;
select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', false);`;
}

function ultimoNumero(out: string): number {
  const last = out.split("\n").pop() ?? "";
  if (!/^\d+$/.test(last)) throw new Error(`saída inesperada do psql: ${out}`);
  return Number(last);
}

function contar(userId: string, where: string): number {
  return ultimoNumero(sql(`${como(userId)}\nselect count(*) from public.webhook_events_log where ${where};`));
}

const ORG_A = "dddddddd-0000-4000-8000-00000000000a";
const ORG_B = "dddddddd-0000-4000-8000-00000000000b";
const MANAGER_A = "dddddddd-1111-4000-8000-00000000000a";
const VIEWER_A = "dddddddd-1111-4000-8000-00000000000c";
const AGENT_A = "dddddddd-1111-4000-8000-00000000000d";
const MANAGER_B = "dddddddd-1111-4000-8000-00000000000b";
const SENTINELA = "corpo-sentinela-9035";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${MANAGER_A}', 'arquivo-9035-mgr-a@invariant.test'),
      ('${VIEWER_A}',  'arquivo-9035-viewer-a@invariant.test'),
      ('${AGENT_A}',   'arquivo-9035-agent-a@invariant.test'),
      ('${MANAGER_B}', 'arquivo-9035-mgr-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'arquivo-9035-a', 'Arquivo 9035 A', 'Arquivo A'),
      ('${ORG_B}', 'arquivo-9035-b', 'Arquivo 9035 B', 'Arquivo B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${MANAGER_A}', '${ORG_A}', 'manager', now()),
      ('${VIEWER_A}',  '${ORG_A}', 'viewer',  now()),
      ('${AGENT_A}',   '${ORG_A}', 'agent',   now()),
      ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;

    insert into public.webhook_events_log (organization_id, provider, http_method, headers, raw_body, payload_parsed, status)
    select v.org, 'generic', 'POST', '{"x-teste":"${SENTINELA}"}'::jsonb, '${SENTINELA}',
           '{"nome":"${SENTINELA}"}'::jsonb, 'received'
      from (values ('${ORG_A}'::uuid), ('${ORG_B}'::uuid)) as v(org)
     where not exists (select 1 from public.webhook_events_log w where w.organization_id = v.org);
  `);
});

describe("9035: leitura por papel", () => {
  it("o manager lê as linhas da própria org (controle positivo)", () => {
    expect(contar(MANAGER_A, `organization_id = '${ORG_A}'`)).toBeGreaterThan(0);
  });

  it("viewer e agent da própria org leem ZERO linhas", () => {
    expect(contar(VIEWER_A, `organization_id = '${ORG_A}'`)).toBe(0);
    expect(contar(AGENT_A, `organization_id = '${ORG_A}'`)).toBe(0);
  });

  it("o manager de A não alcança a org B", () => {
    expect(contar(MANAGER_A, `organization_id = '${ORG_B}'`)).toBe(0);
    expect(contar(MANAGER_A, "true")).toBe(contar(MANAGER_A, `organization_id = '${ORG_A}'`));
  });

  it("o manager lê as colunas de metadado (o que a tela e os filtros usam)", () => {
    const out = sql(`${como(MANAGER_A)}
      select count(*) from (
        select id, status, valid_signature, received_at, provider, event_type, error_message
          from public.webhook_events_log
         where organization_id = '${ORG_A}' and webhook_path_token is null
      ) x;`);
    expect(ultimoNumero(out)).toBeGreaterThan(0);
  });
});

describe("9035: nenhuma sessão lê o corpo", () => {
  for (const coluna of ["raw_body", "headers", "payload_parsed", "*"]) {
    it(`select ${coluna} como manager → 42501`, () => {
      const erro = erroDe(`${como(MANAGER_A)}\nselect ${coluna} from public.webhook_events_log limit 1;`);
      expect(erro, `select ${coluna} passou`).toMatch(/permission denied for table webhook_events_log/);
    });
  }

  it("filtrar PELO corpo também é recusado (WHERE exige o privilégio da coluna)", () => {
    const erro = erroDe(`${como(MANAGER_A)}\nselect count(*) from public.webhook_events_log where raw_body like '%${SENTINELA}%';`);
    expect(erro).toMatch(/permission denied/);
  });

  it("anon e authenticated sem privilégio de tabela (TRUNCATE incluído)", () => {
    const out = sql(`
      select string_agg(r || ':' || p || '=' || has_table_privilege(r, 'public.webhook_events_log', p)::text, ',' order by r, p)
        from unnest(array['anon','authenticated']) r, unnest(array['SELECT','TRUNCATE','REFERENCES','TRIGGER','INSERT','UPDATE','DELETE']) p;`);
    expect(out).not.toContain("=true");
    expect(
      sql(`select has_column_privilege('authenticated', 'public.webhook_events_log', 'status', 'SELECT')`),
    ).toBe("t");
    expect(
      sql(`select has_column_privilege('authenticated', 'public.webhook_events_log', 'raw_body', 'SELECT')`),
    ).toBe("f");
  });

  it("TRUNCATE como authenticated é recusado", () => {
    const erro = erroDe(`${como(MANAGER_A)}\ntruncate public.webhook_events_log;`);
    expect(erro).toMatch(/permission denied/);
    expect(ultimoNumero(sql(`select count(*) from public.webhook_events_log where organization_id = '${ORG_A}';`))).toBeGreaterThan(0);
  });
});

describe("9035: controle negativo (o instrumento enxerga o estado antigo)", () => {
  it("com a policy org-flat e o grant de tabela de antes, o viewer lê o corpo", () => {
    const out = sql(`
      begin;
      drop policy "webhook_events_log_tenant_read" on public.webhook_events_log;
      create policy "webhook_events_log_tenant_read" on public.webhook_events_log for select
        using (public.fn_is_platform_admin() or (organization_id is not null and organization_id in (select public.fn_user_org_ids())));
      grant select on table public.webhook_events_log to authenticated;
      ${como(VIEWER_A)}
      select count(*) from public.webhook_events_log where organization_id = '${ORG_A}' and raw_body = '${SENTINELA}';
      reset role;
      rollback;`);
    const linhas = out.split("\n").filter((l) => /^\d+$/.test(l));
    expect(Number(linhas.pop())).toBeGreaterThan(0);
    // E o rollback devolveu o estado da 9035.
    expect(contar(VIEWER_A, `organization_id = '${ORG_A}'`)).toBe(0);
  });
});
