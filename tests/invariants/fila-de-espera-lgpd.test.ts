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
