import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * 9032 (P2-3 do Cassio na #70): reaplicar o baseline sobre um banco que já tem
 * `trg_organizacao_nao_muda` não toma lock nenhum das tabelas com
 * organization_id, e a primeira aplicação cria uma por vez.
 *
 * O bloco medido é o do FIM do `baseline.sql`, lido do arquivo (não copiado):
 * se alguém voltar ao `create or replace` em todas, este teste reprova.
 */

const BASELINE = readFileSync(join(__dirname, "..", "..", "supabase", "baseline.sql"), "utf8");
const MARCA = "-- 9032 (P2-3 do Cassio na #70)";
const BLOCO = (() => {
  const i = BASELINE.lastIndexOf(MARCA);
  if (i < 0) throw new Error("bloco da 9032 não achado no baseline");
  const ini = BASELINE.indexOf("do $$", i);
  const fim = BASELINE.indexOf("end $$;", ini) + "end $$;".length;
  return BASELINE.slice(ini, fim);
})();

/** O bloco de ANTES da 9032: create or replace em toda tabela, num do só. */
const BLOCO_ANTIGO = `do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format('create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.%I '
                   'for each row execute function public.fn_organizacao_da_linha_nao_muda()', t);
  end loop;
end $$;`;

/** Locks SHARE ROW EXCLUSIVE que ESTA sessão segura depois do bloco, na mesma transação. */
const locksDepoisDe = (bloco: string) =>
  Number(
    sql(`begin;
${bloco}
select count(*) from pg_locks
 where pid = pg_backend_pid() and locktype = 'relation' and mode = 'ShareRowExclusiveLock';
rollback;`)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l))
      .pop(),
  );

const TABELAS = `select count(*) from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`;
const COM_TRIGGER = `select count(*) from pg_trigger where tgname = 'trg_organizacao_nao_muda' and not tgisinternal`;

describe("9032: a trava de organização é leve na reaplicação", () => {
  it("reaplicar o bloco num banco que já tem as triggers toma ZERO lock", () => {
    expect(sql(COM_TRIGGER)).toBe(sql(TABELAS));
    expect(locksDepoisDe(BLOCO)).toBe(0);
  });

  it("CONTROLE: o bloco de antes (create or replace em todas) acumulava um lock por tabela", () => {
    expect(locksDepoisDe(BLOCO_ANTIGO)).toBe(Number(sql(TABELAS)));
  });

  it("primeira aplicação: recria só as que faltam, com COMMIT entre elas (fora de transação)", () => {
    sql(`drop trigger trg_organizacao_nao_muda on public.contacts;
drop trigger trg_organizacao_nao_muda on public.messages;
drop trigger trg_organizacao_nao_muda on public.crm_leads;`);
    expect(Number(sql(COM_TRIGGER))).toBe(Number(sql(TABELAS)) - 3);
    // Em autocommit, como o psql -f do baseline: o COMMIT do laço vale.
    sql(BLOCO);
    expect(sql(COM_TRIGGER)).toBe(sql(TABELAS));
  });

  it("a trigger com a função ERRADA não conta como presente: o bloco a refaz", () => {
    sql(`create function public.t9032_outra() returns trigger language plpgsql as $f$ begin return new; end $f$;
create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.demandas
  for each row execute function public.t9032_outra();`);
    sql(BLOCO);
    expect(
      sql(`select p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where t.tgrelid = 'public.demandas'::regclass and t.tgname = 'trg_organizacao_nao_muda';`),
    ).toBe("fn_organizacao_da_linha_nao_muda");
    sql(`drop function public.t9032_outra();`);
  });

  it("trigger DESABILITADA ou com WHEN não conta como presente: o bloco a refaz valendo", () => {
    sql(`alter table public.lead_notes disable trigger trg_organizacao_nao_muda;`);
    sql(`create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.demandas
  for each row when (false) execute function public.fn_organizacao_da_linha_nao_muda();`);
    sql(BLOCO);
    expect(
      sql(`select string_agg(c.relname || ':' || t.tgenabled::text || ':' || (t.tgqual is null)::text, ',' order by c.relname)
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
            where t.tgname = 'trg_organizacao_nao_muda' and c.relname in ('demandas', 'lead_notes');`),
    ).toBe("demandas:O:true,lead_notes:O:true");
  });
});
