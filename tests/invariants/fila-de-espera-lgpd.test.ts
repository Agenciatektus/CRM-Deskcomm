import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * Anonimizar o contato zera o texto livre da fila de espera (notes, desired_window) e cancela a
 * espera viva; o vizinho fica intacto. Molde de agenda-lgpd-alcanca.test.ts (migration 9085).
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

const ORG = "16be0000-0000-4000-8000-00000000000a";
const ALVO = "16be0000-2222-4000-8000-000000000001";
const VIZINHO = "16be0000-2222-4000-8000-000000000002";

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'fila-lgpd', 'Fila LGPD', 'Fila LGPD') on conflict (id) do nothing;
    insert into public.contacts (id, organization_id, name) values
      ('${ALVO}', '${ORG}', 'Maria Silva'), ('${VIZINHO}', '${ORG}', 'Joao Pereira')
      on conflict (id) do nothing;
    insert into public.calendar_waitlist (organization_id, contact_id, desired_window, notes)
      select '${ORG}', c, 'sabado de manha', 'gestante, prefere sem amonia'
        from unnest(array['${ALVO}', '${VIZINHO}']::uuid[]) c
       where not exists (select 1 from public.calendar_waitlist w where w.contact_id = c);
  `);
});

const campo = (contato: string, coluna: string) =>
  sql(`select coalesce(${coluna}::text, '<null>') from public.calendar_waitlist where contact_id = '${contato}' limit 1;`);

describe("a cascata de LGPD alcança a fila de espera", () => {
  it("ANTES: o texto está legível (controle positivo)", () => {
    expect(campo(ALVO, "notes")).toContain("gestante");
  });
  it("anonimizar zera o texto e cancela a espera viva", () => {
    sql(`select public.fn_lgpd_cascade_redact_contact('${ORG}', '${ALVO}', gen_random_uuid());`);
    expect(campo(ALVO, "notes")).toBe("<null>");
    expect(campo(ALVO, "desired_window")).toBe("<null>");
    expect(campo(ALVO, "status")).toBe("cancelled");
  });
  it("o vizinho não é tocado", () => {
    expect(campo(VIZINHO, "notes")).toContain("gestante");
    expect(campo(VIZINHO, "status")).toBe("open");
  });
});

// ── Isolamento por organização e por papel (JWT simulado, não postgres: rolbypassrls mediria nada) ──
const ORG_B = "16be0000-0000-4000-8000-00000000000b";
const GERENTE_A = "16be0000-1111-4000-8000-00000000000a";
const GERENTE_B = "16be0000-1111-4000-8000-00000000000b";
const ATENDENTE_A = "16be0000-1111-4000-8000-00000000000c";
const CONTATO_B = "16be0000-2222-4000-8000-00000000000b";

function contarComo(usuario: string, consulta: string): number {
  const saida = sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${usuario}"}', false);
    ${consulta}
  `);
  const n = saida.split(/\r?\n/).pop() ?? "";
  if (!/^\d+$/.test(n)) throw new Error(`saída inesperada do psql: ${saida}`);
  return Number(n);
}

describe("RLS da fila de espera", () => {
  beforeAll(() => {
    sql(`
      insert into auth.users (id, email) values
        ('${GERENTE_A}', 'fila-a@invariant.test'), ('${GERENTE_B}', 'fila-b@invariant.test'),
        ('${ATENDENTE_A}', 'fila-c@invariant.test') on conflict do nothing;
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${ORG_B}', 'fila-lgpd-b', 'Fila LGPD B', 'Fila LGPD B') on conflict (id) do nothing;
      insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
        ('${GERENTE_A}', '${ORG}', 'manager', now()), ('${GERENTE_B}', '${ORG_B}', 'manager', now()),
        ('${ATENDENTE_A}', '${ORG}', 'agent', now()) on conflict do nothing;
      insert into public.contacts (id, organization_id, name) values ('${CONTATO_B}', '${ORG_B}', 'Ana Souza')
        on conflict (id) do nothing;
      insert into public.calendar_waitlist (organization_id, contact_id, notes)
        select '${ORG_B}', '${CONTATO_B}', 'nota da org B'
         where not exists (select 1 from public.calendar_waitlist w where w.contact_id = '${CONTATO_B}');
    `);
  });

  it("controle positivo: o gerente enxerga a fila da própria organização", () => {
    expect(contarComo(GERENTE_A, "select count(*) from public.calendar_waitlist;")).toBeGreaterThan(0);
  });
  it("o gerente de A não enxerga nada da organização B, e o de B nada da A", () => {
    expect(contarComo(GERENTE_A, `select count(*) from public.calendar_waitlist where organization_id = '${ORG_B}';`)).toBe(0);
    expect(contarComo(GERENTE_B, `select count(*) from public.calendar_waitlist where organization_id = '${ORG}';`)).toBe(0);
  });
  it("atendente (agent) não lê a tabela direto: leitura é de manager+", () => {
    expect(contarComo(ATENDENTE_A, "select count(*) from public.calendar_waitlist;")).toBe(0);
  });
});
