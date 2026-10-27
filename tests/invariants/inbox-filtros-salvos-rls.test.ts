import { beforeAll, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `inbox_filtros_salvos` (migration 9079): filtros nomeados do Inbox, por usuário.
 *
 * Arquivo próprio, e não linha em rls-isolation.test.ts (congelado por hook);
 * `rls-completude-varredura.test.ts` aponta para cá em `PROVA_PROPRIA`.
 *
 * Conectar como `postgres` mediria NADA (rolbypassrls): aqui é `set role
 * authenticated` + `request.jwt.claims`, o caminho da produção.
 */

const ORG_A = "09790979-0000-4000-8000-00000000000a";
const ORG_B = "09790979-0000-4000-8000-00000000000b";
const A1 = "09790979-1111-4000-8000-0000000000a1";
const A2 = "09790979-1111-4000-8000-0000000000a2";
const B1 = "09790979-1111-4000-8000-0000000000b1";
const LOTE = "09790979-1111-4000-8000-0000000000c1";
const FILTRO = `'{"onlyUnread":true}'::jsonb`;

function como(usuario: string, comando: string): string {
  return sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${usuario}"}', false);
    ${comando}
  `)
    .split("\n")
    .pop() as string;
}

const contarComo = (usuario: string, onde = "true") =>
  Number(como(usuario, `select count(*) from public.inbox_filtros_salvos where ${onde};`));

function erroComo(usuario: string, comando: string): string | null {
  try {
    como(usuario, `${comando};`);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

beforeAll(() => {
  sql(`
    delete from public.inbox_filtros_salvos where organization_id in ('${ORG_A}', '${ORG_B}');
    insert into auth.users (id, email) values
      ('${A1}', 'filtros-a1@invariant.test'),
      ('${A2}', 'filtros-a2@invariant.test'),
      ('${B1}', 'filtros-b1@invariant.test'),
      ('${LOTE}', 'filtros-lote@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'filtros-0979-a', 'Filtros 0979 A', 'Filtros A'),
      ('${ORG_B}', 'filtros-0979-b', 'Filtros 0979 B', 'Filtros B')
      on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${A1}', '${ORG_A}', 'agent', now()),
      ('${A2}', '${ORG_A}', 'agent', now()),
      ('${LOTE}', '${ORG_A}', 'agent', now()),
      ('${B1}', '${ORG_B}', 'agent', now())
      on conflict do nothing;
    insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values
      ('${ORG_A}', '${A1}', 'Do A1', ${FILTRO}),
      ('${ORG_A}', '${A2}', 'Do A2', ${FILTRO}),
      ('${ORG_B}', '${B1}', 'Do B1', ${FILTRO});
  `);
});

describe("inbox_filtros_salvos: cada usuário só enxerga as próprias linhas", () => {
  it("controle positivo: cada um lê a sua, e só a sua", () => {
    expect(contarComo(A1)).toBe(1);
    expect(contarComo(A1, `nome = 'Do A1'`)).toBe(1);
    expect(contarComo(B1)).toBe(1);
  });

  it("A1 não lê a linha do colega da MESMA org nem a de outra org", () => {
    expect(contarComo(A1, `nome = 'Do A2'`)).toBe(0);
    expect(contarComo(A1, `nome = 'Do B1'`)).toBe(0);
    expect(contarComo(B1, `nome = 'Do A1'`)).toBe(0);
  });

  it("A1 não apaga a linha do colega nem a de outra org (0 linhas), e B1 não apaga a de A1", () => {
    for (const [quem, alvo] of [
      [A1, "Do A2"],
      [A1, "Do B1"],
      [B1, "Do A1"],
    ] as const) {
      const n = como(quem, `with d as (delete from public.inbox_filtros_salvos where nome = '${alvo}' returning 1) select count(*) from d;`);
      expect(Number(n), `${quem} apagou "${alvo}"`).toBe(0);
    }
    expect(sql(`select count(*) from public.inbox_filtros_salvos where organization_id in ('${ORG_A}', '${ORG_B}');`)).toBe("3");
  });

  it("o dono apaga a própria", () => {
    sql(`insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A1}', 'Some', ${FILTRO});`);
    const n = como(A1, `with d as (delete from public.inbox_filtros_salvos where nome = 'Some' returning 1) select count(*) from d;`);
    expect(Number(n)).toBe(1);
  });

  it("não insere em nome de outro usuário nem em organização que não é sua", () => {
    const outroUsuario = erroComo(A1, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A2}', 'Forjado', ${FILTRO})`);
    expect(outroUsuario).toContain("row-level security");
    const outraOrg = erroComo(A1, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_B}', '${A1}', 'Forjado', ${FILTRO})`);
    expect(outraOrg).toContain("row-level security");
  });

  it("insere a própria (controle positivo do with check)", () => {
    expect(erroComo(A1, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A1}', 'Segundo', ${FILTRO})`)).toBeNull();
  });

  it("não há update para ninguém, e anon não alcança a tabela", () => {
    expect(erroComo(A1, `update public.inbox_filtros_salvos set nome = 'x'`)).toContain("permission denied");
    expect(erroComo(A1, `update public.inbox_filtros_salvos set filtros = '{}'::jsonb`)).toContain("permission denied");
    try {
      sql(`set role anon; select count(*) from public.inbox_filtros_salvos;`);
      expect.unreachable("anon leu a tabela");
    } catch (err) {
      expect(motivoDoErro(err)).toContain("permission denied");
    }
  });
});

describe("inbox_filtros_salvos: nome, forma e teto", () => {
  it("nome é único por usuário sem diferenciar caixa, mas outro usuário pode repetir", () => {
    expect(erroComo(A1, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A1}', 'DO a1', ${FILTRO})`)).toContain("duplicate key");
    expect(erroComo(A2, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A2}', 'Do A1', ${FILTRO})`)).toBeNull();
  });

  it("nome de 1 a 40 caracteres e filtros só objeto", () => {
    const inserir = (nome: string, filtros: string) =>
      erroComo(A1, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A1}', '${nome}', '${filtros}'::jsonb)`);
    expect(inserir("", "{}")).toContain("inbox_filtros_salvos_nome_tam");
    expect(inserir("x".repeat(41), "{}")).toContain("inbox_filtros_salvos_nome_tam");
    expect(inserir("Lista", "[1]")).toContain("inbox_filtros_salvos_filtros_obj");
  });

  it("o 21º filtro do mesmo usuário é recusado pelo banco", () => {
    sql(`
      insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros)
      select '${ORG_A}', '${LOTE}', 'f' || g, ${FILTRO} from generate_series(1, 20) g;
    `);
    expect(erroComo(LOTE, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${LOTE}', 'f21', ${FILTRO})`)).toContain("limite de 20");
    // O teto é por usuário: o colega ainda salva.
    expect(erroComo(A2, `insert into public.inbox_filtros_salvos (organization_id, user_id, nome, filtros) values ('${ORG_A}', '${A2}', 'Livre', ${FILTRO})`)).toBeNull();
  });
});
