/**
 * AS OBSERVAÇÕES DO CONTATO (migration 9041) — contra Postgres de verdade.
 *
 * Cada caso, um modo de falha concreto:
 *   - a coluna existe, é text e nula (contato sem observação é o normal);
 *   - o CHECK recusa mais de 4000 caracteres e texto só de espaços, mesmo por
 *     uma porta que não seja a rota (PostgREST direto, MCP);
 *   - RLS coerente: agent da organização grava; viewer lê e não grava; agent de
 *     OUTRA organização nem vê a linha; anon não vê nada;
 *   - LGPD: a anonimização apaga a observação (por qualquer porta que vire
 *     `is_anonymized`), e a função da trigger não é chamável pela REST.
 * Controle: o mesmo UPDATE do viewer, feito pelo agent, afeta 1 linha.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  lastLine,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

const CONTATO = "90410000-0000-4000-8000-0000000000c1";
const ORG_B = "90410000-0000-4000-8000-0000000000b1";
const AGENT_B = "90410000-0000-4000-8000-0000000000a2";

/** Executa e devolve a mensagem de erro do Postgres, ou null se passou. */
function erroDe(script: string): string | null {
  try {
    sql(script);
    return null;
  } catch (err) {
    return String((err as { stderr?: string }).stderr ?? err);
  }
}

const obsDoContato = () =>
  lastLine(sql(`select coalesce(observacoes, '<null>') from public.contacts where id = '${CONTATO}'`));

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email) values ('${AGENT_B}', 'obs-9041-b@invariant.test') on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'org-obs-9041-b', 'Org Obs B LTDA', 'Org Obs B') on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${AGENT_B}', '${ORG_B}', 'agent', now()) on conflict do nothing;
  `);
});

beforeEach(() => {
  sql(`
    delete from public.contacts where id in ('90410000-0000-4000-8000-0000000000c2', '${CONTATO}');
    insert into public.contacts (id, organization_id, display_name, observacoes)
      values ('${CONTATO}', '${GOV_ORG}', 'Contato Obs 9041', 'prefere ligação à tarde');
  `);
});

describe("contacts.observacoes — forma (9041)", () => {
  it("a coluna existe, text, nula", () => {
    expect(
      lastLine(sql(`select data_type || ',' || is_nullable from information_schema.columns
                     where table_schema = 'public' and table_name = 'contacts' and column_name = 'observacoes'`)),
    ).toBe("text,YES");
  });

  it("o CHECK existe e fala de 4000 e de branco", () => {
    const def = lastLine(sql(`select pg_get_constraintdef(oid) from pg_constraint
                               where conname = 'contacts_observacoes_tamanho' and conrelid = 'public.contacts'::regclass`));
    expect(def).toMatch(/4000/);
    expect(def).toMatch(/btrim/);
  });

  it("aceita null e exatamente 4000 caracteres (controle)", () => {
    expect(erroDe(`update public.contacts set observacoes = null where id = '${CONTATO}'`)).toBeNull();
    expect(erroDe(`update public.contacts set observacoes = repeat('é', 4000) where id = '${CONTATO}'`)).toBeNull();
  });

  it("recusa 4001 caracteres e texto só de espaços", () => {
    expect(erroDe(`update public.contacts set observacoes = repeat('a', 4001) where id = '${CONTATO}'`))
      .toMatch(/contacts_observacoes_tamanho/);
    expect(erroDe(`update public.contacts set observacoes = '   ' where id = '${CONTATO}'`))
      .toMatch(/contacts_observacoes_tamanho/);
    expect(obsDoContato()).toBe("prefere ligação à tarde");
  });
});

describe("contacts.observacoes — RLS (policies por comando da 9030)", () => {
  it("agent da organização grava (controle positivo)", () => {
    expect(writeCountAs(GOV_AGENT_A, `update public.contacts set observacoes = 'cliente VIP' where id = '${CONTATO}'`)).toBe(1);
    expect(obsDoContato()).toBe("cliente VIP");
  });

  it("viewer lê a observação e não grava", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.contacts where id = '${CONTATO}' and observacoes is not null`)).toBe(1);
    expect(writeCountAs(GOV_VIEWER, `update public.contacts set observacoes = 'viewer escreveu' where id = '${CONTATO}'`)).toBe(0);
    expect(obsDoContato()).toBe("prefere ligação à tarde");
  });

  it("agent de OUTRA organização nem vê nem grava", () => {
    expect(countAs(AGENT_B, `select count(*) from public.contacts where id = '${CONTATO}'`)).toBe(0);
    expect(writeCountAs(AGENT_B, `update public.contacts set observacoes = 'vazou' where id = '${CONTATO}'`)).toBe(0);
    expect(obsDoContato()).toBe("prefere ligação à tarde");
  });

  it("anon não vê a linha", () => {
    // O banco pode barrar o anon antes de contar ("permission denied") ou contar
    // zero; as duas respostas provam que a observação não chega a ele.
    let resultado: string;
    try {
      resultado = lastLine(sql(`set role anon; select count(*) from public.contacts where id = '${CONTATO}';`));
    } catch (e) {
      expect(String(e)).toMatch(/permission denied/);
      return;
    }
    expect(resultado).toBe("0");
  });
});

describe("contacts.observacoes — LGPD", () => {
  it("anonimizar apaga a observação", () => {
    sql(`update public.contacts set is_anonymized = true, anonymized_at = now() where id = '${CONTATO}'`);
    expect(obsDoContato()).toBe("<null>");
  });

  it("UPDATE que não anonimiza não mexe na observação (controle)", () => {
    sql(`update public.contacts set display_name = 'Outro nome' where id = '${CONTATO}'`);
    expect(obsDoContato()).toBe("prefere ligação à tarde");
  });

  it("a função da trigger não é chamável por anon nem por authenticated", () => {
    const r = lastLine(sql(`select
        has_function_privilege('anon', 'public.fn_contato_anonimizado_limpa_observacoes()', 'EXECUTE')::text || ',' ||
        has_function_privilege('authenticated', 'public.fn_contato_anonimizado_limpa_observacoes()', 'EXECUTE')::text`));
    expect(r).toBe("false,false");
  });
});

describe("contacts.observacoes — fusão de contatos", () => {
  const ABSORVIDO = "90410000-0000-4000-8000-0000000000c2";
  const obsDe = (id: string) =>
    lastLine(sql(`select coalesce(observacoes, '<null>') from public.contacts where id = '${id}'`));
  const fundir = (comObsNoPrincipal: boolean) =>
    sql(`
      delete from public.contacts where id = '${ABSORVIDO}';
      update public.contacts set observacoes = ${comObsNoPrincipal ? "'do principal'" : "null"} where id = '${CONTATO}';
      insert into public.contacts (id, organization_id, display_name, observacoes)
        values ('${ABSORVIDO}', '${GOV_ORG}', 'Absorvido 9041', 'do absorvido');
      select public.fn_mesclar_contatos('${GOV_ORG}', '${CONTATO}', array['${ABSORVIDO}']::uuid[]);
    `);

  it("principal SEM observação herda a do absorvido", () => {
    fundir(false);
    expect(obsDe(CONTATO)).toBe("do absorvido");
    // A lápide não guarda cópia: anonimizar o principal não a alcançaria.
    expect(obsDe(ABSORVIDO)).toBe("<null>");
  });

  it("principal COM observação mantém a dele, sem concatenar (controle)", () => {
    fundir(true);
    expect(obsDe(CONTATO)).toBe("do principal");
    expect(obsDe(ABSORVIDO)).toBe("<null>");
  });
});
