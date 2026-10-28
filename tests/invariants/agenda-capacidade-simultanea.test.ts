import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * ATENDIMENTOS SIMULTÂNEOS (migration 9083) — o banco segura a capacidade, inclusive na corrida.
 *
 * A Camila (salão) atende 4 clientes ao mesmo tempo. O índice único da 0182 vetava a 2ª
 * cliente das 13h; virou o gatilho `fn_agenda_respeita_capacidade`, que pega um advisory
 * lock por (org, dono) e conta o PICO de simultâneos. Capacidade 1 segue a régua da 0182
 * (só o mesmo instante colide) — quem vigia isso é `agenda-sem-duplicata.test.ts`, que
 * não foi tocado.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)");
}
const containerName: string = container;
const PSQL = ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"];

function sql(script: string): string {
  return execFileSync("docker", PSQL, { input: script, encoding: "utf8" }).trim();
}

/** Devolve o SQLSTATE da recusa, ou `null` se entrou. */
function marca(dono: string, inicio: string, fim: string): string | null {
  try {
    sql(`insert into public.calendar_appointments (organization_id, owner_user_id, title, starts_at, ends_at, status)
         values ('${ORG}', '${dono}', 'cliente', '${inicio}', '${fim}', 'confirmed');`);
    return null;
  } catch (e) {
    // O psql mostra a mensagem, não o SQLSTATE: cada recusa tem um nome próprio.
    const saida = String((e as { stderr?: string }).stderr ?? e);
    if (saida.includes("agenda_capacidade_esgotada")) return "23P01";
    if (saida.includes("agenda_mesmo_instante")) return "23505";
    return "outro";
  }
}

/** psql assíncrono com stdin, para duas sessões ao mesmo tempo. */
function sqlAssincrono(script: string): Promise<{ ok: boolean; saida: string }> {
  return new Promise((resolve) => {
    const filho = execFile("docker", PSQL, { encoding: "utf8" }, (erro, stdout, stderr) =>
      resolve({ ok: !erro, saida: `${stdout}${stderr}` }),
    );
    filho.stdin?.end(script);
  });
}
const espera = promisify(setTimeout);

function contar(dono: string): number {
  return Number(
    sql(`select count(*) from public.calendar_appointments
          where organization_id = '${ORG}' and owner_user_id = '${dono}' and status = 'confirmed';`),
  );
}

const ORG = "dd000000-0000-4000-8000-0000000000c4";
const CAMILA = "dd000000-1111-4000-8000-0000000000c4"; // capacidade 4
const UMA = "dd000000-1111-4000-8000-0000000000c1"; // capacidade 1 (sem linha de jornada)
const CORRIDA = "dd000000-1111-4000-8000-0000000000c5"; // capacidade 4, para a corrida

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${CAMILA}', 'cap-camila@invariant.test'),
      ('${UMA}', 'cap-uma@invariant.test'),
      ('${CORRIDA}', 'cap-corrida@invariant.test')
      on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'agenda-cap', 'Agenda Cap', 'Agenda Cap') on conflict (id) do nothing;
    insert into public.attendant_availability (organization_id, user_id, simultaneous_appointments) values
      ('${ORG}', '${CAMILA}', 4), ('${ORG}', '${CORRIDA}', 4)
      on conflict (organization_id, user_id) do update set simultaneous_appointments = 4;
    delete from public.calendar_appointments where organization_id = '${ORG}';
  `);
});

describe("a coluna", () => {
  it("nasce 1 para quem já existia — nenhuma org muda sozinha", () => {
    expect(sql(`select column_default from information_schema.columns
                 where table_name = 'attendant_availability' and column_name = 'simultaneous_appointments';`)).toBe("1");
  });

  it("recusa 0 e acima de 20", () => {
    expect(() => sql(`update public.attendant_availability set simultaneous_appointments = 0 where user_id = '${CAMILA}';`)).toThrow();
    expect(() => sql(`update public.attendant_availability set simultaneous_appointments = 21 where user_id = '${CAMILA}';`)).toThrow();
  });
});

describe("capacidade 1 continua a régua da 0182", () => {
  it("o mesmo instante é recusado (23505, o código do índice antigo)", () => {
    expect(marca(UMA, "2026-11-05 16:00+00", "2026-11-05 17:00+00")).toBeNull();
    expect(marca(UMA, "2026-11-05 16:00+00", "2026-11-05 17:00+00")).toBe("23505");
  });

  it("o encaixe sobreposto continua entrando — quem o veta é a rota, não o banco", () => {
    expect(marca(UMA, "2026-11-05 16:30+00", "2026-11-05 17:30+00")).toBeNull();
  });
});

describe("capacidade 4 aceita 4 e recusa a 5ª", () => {
  it("quatro clientes às 13h entram, inclusive no MESMO instante", () => {
    for (let i = 0; i < 4; i++) expect(marca(CAMILA, "2026-11-05 16:00+00", "2026-11-05 18:30+00")).toBeNull();
  });

  it("a 5ª é recusada com 23P01", () => {
    expect(marca(CAMILA, "2026-11-05 17:00+00", "2026-11-05 18:00+00")).toBe("23P01");
    expect(contar(CAMILA)).toBe(4);
  });

  it("depois que as 4 acabam, o horário seguinte entra — encostar não é sobrepor", () => {
    expect(marca(CAMILA, "2026-11-05 18:30+00", "2026-11-05 19:30+00")).toBeNull();
  });

  it("cancelar uma libera a vaga", () => {
    sql(`update public.calendar_appointments set status = 'cancelled', cancelled_at = now()
          where id = (select id from public.calendar_appointments
                       where owner_user_id = '${CAMILA}' and starts_at = '2026-11-05 16:00+00' limit 1);`);
    expect(marca(CAMILA, "2026-11-05 17:00+00", "2026-11-05 18:00+00")).toBeNull();
  });

  it("remarcar para dentro de um horário lotado é recusado no UPDATE também", () => {
    expect(() =>
      sql(`update public.calendar_appointments set starts_at = '2026-11-05 17:00+00', ends_at = '2026-11-05 18:00+00'
            where owner_user_id = '${CAMILA}' and starts_at = '2026-11-05 18:30+00';`),
    ).toThrow(/agenda_capacidade_esgotada/);
  });

  it("fn_agenda_lotada com capacidade 1 é 'qualquer sobreposição' — a régua antiga do commit do Google", () => {
    expect(sql(`select public.fn_agenda_lotada('${ORG}', '${UMA}', null, '2026-11-05 16:45+00', '2026-11-05 16:50+00');`)).toBe("t");
    expect(sql(`select public.fn_agenda_lotada('${ORG}', '${UMA}', null, '2026-11-05 20:00+00', '2026-11-05 21:00+00');`)).toBe("f");
  });
});

describe("a corrida: duas reservas simultâneas para a última vaga", () => {
  it("só uma entra — a segunda espera o lock e já conta a primeira", async () => {
    for (let i = 0; i < 3; i++) expect(marca(CORRIDA, "2026-11-06 16:00+00", "2026-11-06 17:00+00")).toBeNull();

    const insere = `insert into public.calendar_appointments (organization_id, owner_user_id, title, starts_at, ends_at, status)
                    values ('${ORG}', '${CORRIDA}', 'corrida', '2026-11-06 16:00+00', '2026-11-06 17:00+00', 'confirmed');`;
    // A segura a transação aberta depois do INSERT; B chega no meio. Sem o lock, B não
    // veria a linha não comitada de A e as duas entrariam (5 com capacidade 4).
    const a = sqlAssincrono(`begin; ${insere} select pg_sleep(1.5); commit;`);
    await espera(400);
    const b = sqlAssincrono(insere);
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.ok, ra.saida).toBe(true);
    expect(rb.ok, "a segunda reserva estourou a capacidade na corrida").toBe(false);
    expect(rb.saida).toMatch(/agenda_capacidade_esgotada/);
    expect(contar(CORRIDA)).toBe(4);
  });
});
