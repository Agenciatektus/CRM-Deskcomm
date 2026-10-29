import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * TOLERÂNCIA NO FIM (migration 9084) — o banco desconta a mesma tolerância que o motor.
 *
 * Com capacidade > 1 quem segura a gravação é `fn_agenda_lotada` (gatilho da 9083). Se ela
 * contasse o compromisso inteiro, o motor ofereceria 11:30 e o INSERT recusaria com 23P01:
 * horário oferecido que a gravação recusa. Cada caso tem o controle com tolerância 0.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)");
}
const PSQL = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"];

function sql(script: string): string {
  return execFileSync("docker", PSQL, { input: script, encoding: "utf8" }).trim();
}

/** Devolve o motivo da recusa, ou `null` se entrou. */
function marca(dono: string, inicio: string, fim: string): string | null {
  try {
    sql(`insert into public.calendar_appointments (organization_id, owner_user_id, title, starts_at, ends_at, status)
         values ('${ORG}', '${dono}', 'cliente', '${inicio}', '${fim}', 'confirmed');`);
    return null;
  } catch (e) {
    const saida = String((e as { stderr?: string }).stderr ?? e);
    if (saida.includes("agenda_capacidade_esgotada")) return "23P01";
    if (saida.includes("agenda_mesmo_instante")) return "23505";
    return "outro";
  }
}

function lotada(dono: string, inicio: string, fim: string): boolean {
  return sql(`select public.fn_agenda_lotada('${ORG}', '${dono}', null, '${inicio}', '${fim}');`) === "t";
}

const ORG = "dd000000-0000-4000-8000-0000000009c4";
const CAMILA = "dd000000-1111-4000-8000-0000000009c1"; // capacidade 2, tolerância 30
const SEM_TOL = "dd000000-1111-4000-8000-0000000009c2"; // capacidade 2, tolerância 0 (controle)
const NIEDJA = "dd000000-1111-4000-8000-0000000009c3"; // capacidade 1, tolerância 30

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${CAMILA}', 'tol-camila@invariant.test'), ('${SEM_TOL}', 'tol-sem@invariant.test'), ('${NIEDJA}', 'tol-niedja@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'agenda-tol', 'Agenda Tol', 'Agenda Tol') on conflict (id) do nothing;
    insert into public.attendant_availability (organization_id, user_id, simultaneous_appointments, overlap_tolerance_minutes) values
      ('${ORG}', '${CAMILA}', 2, 30), ('${ORG}', '${SEM_TOL}', 2, 0), ('${ORG}', '${NIEDJA}', 1, 30)
      on conflict (organization_id, user_id) do update
        set simultaneous_appointments = excluded.simultaneous_appointments,
            overlap_tolerance_minutes = excluded.overlap_tolerance_minutes;
    delete from public.calendar_appointments where organization_id = '${ORG}';
  `);
});

describe("a coluna", () => {
  it("nasce 0 — nenhuma org muda sozinha", () => {
    expect(sql(`select column_default from information_schema.columns
                 where table_name = 'attendant_availability' and column_name = 'overlap_tolerance_minutes';`)).toBe("0");
  });

  it("recusa negativo e acima de 120", () => {
    expect(() => sql(`update public.attendant_availability set overlap_tolerance_minutes = -1 where user_id = '${CAMILA}';`)).toThrow();
    expect(() => sql(`update public.attendant_availability set overlap_tolerance_minutes = 121 where user_id = '${CAMILA}';`)).toThrow();
  });
});

describe("capacidade 2, tolerância 30: dois das 10h às 12h", () => {
  it("entram os dois", () => {
    for (const dono of [CAMILA, SEM_TOL]) {
      expect(marca(dono, "2026-11-05 13:00+00", "2026-11-05 15:00+00")).toBeNull();
      expect(marca(dono, "2026-11-05 13:00+00", "2026-11-05 15:00+00")).toBeNull();
    }
  });

  it("11:00 é recusado (23P01)", () => {
    expect(marca(CAMILA, "2026-11-05 14:00+00", "2026-11-05 16:00+00")).toBe("23P01");
  });

  it("11:29 é recusado — um minuto antes da tolerância", () => {
    expect(marca(CAMILA, "2026-11-05 14:29+00", "2026-11-05 16:29+00")).toBe("23P01");
  });

  it("11:30 entra", () => {
    expect(marca(CAMILA, "2026-11-05 14:30+00", "2026-11-05 16:30+00")).toBeNull();
  });

  it("CONTROLE: com tolerância 0, o mesmo 11:30 é recusado", () => {
    expect(marca(SEM_TOL, "2026-11-05 14:30+00", "2026-11-05 16:30+00")).toBe("23P01");
  });

  it("vale para os dois lados: o novo que termina 30 min depois do início dos dois seguintes cabe", () => {
    // 08:00–10:30 local contra os dois das 10h: o mesmo encaixe visto da outra ponta.
    expect(lotada(CAMILA, "2026-11-05 11:00+00", "2026-11-05 13:30+00")).toBe(false);
    expect(lotada(CAMILA, "2026-11-05 11:00+00", "2026-11-05 13:31+00")).toBe(true);
    expect(lotada(SEM_TOL, "2026-11-05 11:00+00", "2026-11-05 13:30+00")).toBe(true);
  });
});

describe("capacidade 1, tolerância 30 (régua do commit do Google)", () => {
  it("10:00–12:00 marcado; 11:30 não lota, 11:29 lota, e o mesmo instante segue vetado", () => {
    expect(marca(NIEDJA, "2026-11-05 13:00+00", "2026-11-05 15:00+00")).toBeNull();
    expect(lotada(NIEDJA, "2026-11-05 14:30+00", "2026-11-05 16:30+00")).toBe(false);
    expect(lotada(NIEDJA, "2026-11-05 14:29+00", "2026-11-05 16:29+00")).toBe(true);
    expect(marca(NIEDJA, "2026-11-05 13:00+00", "2026-11-05 15:00+00")).toBe("23505");
  });

  it("tolerância maior que a duração não esvazia o compromisso: o primeiro minuto continua ocupado", () => {
    sql(`update public.attendant_availability set overlap_tolerance_minutes = 120 where user_id = '${NIEDJA}';`);
    expect(lotada(NIEDJA, "2026-11-05 13:00+00", "2026-11-05 13:20+00")).toBe(true);
    sql(`update public.attendant_availability set overlap_tolerance_minutes = 30 where user_id = '${NIEDJA}';`);
  });
});
