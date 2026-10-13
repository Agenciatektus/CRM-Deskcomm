/**
 * O AVISO NA HORA DA TAREFA (migration 9043) — contra Postgres de verdade.
 *
 * Cada caso, um modo de falha concreto:
 *   - a coluna `crm_tasks.reminded_at` existe, é timestamptz e nasce nula (o
 *     cron só avisa tarefa com carimbo nulo; default diferente calaria tudo);
 *   - o índice parcial cobre exatamente a varredura (abertas, com prazo, não
 *     avisadas) — sem ele, a consulta de cada minuto varre a tabela inteira;
 *   - `task_due` passa no CHECK de `agent_inbox_items.kind` (senão o INSERT do
 *     aviso falha e o cron só registra `falha_no_aviso`);
 *   - a REIVINDICAÇÃO é exclusiva: o segundo UPDATE condicional em
 *     `reminded_at is null` não devolve linha — é o que impede duas réplicas
 *     de avisarem a mesma tarefa.
 * Controle: um kind fora do vocabulário continua recusado.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

const ORG = "90430000-0000-4000-8000-000000000001";
const TAREFA = "90430000-0000-4000-8000-000000000002";

const valor = (q: string) => lastLine(sql(q));

beforeEach(() => {
  sql(`
    delete from agent_inbox_items where organization_id = '${ORG}';
    delete from crm_tasks where organization_id = '${ORG}';
    insert into organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-aviso-9043', 'Org Aviso LTDA', 'Org Aviso')
      on conflict (id) do nothing;
    insert into crm_tasks (id, organization_id, title, due_date)
      values ('${TAREFA}', '${ORG}', 'Ligar', now() - interval '1 minute');
  `);
});

describe("9043 — o aviso na hora da tarefa", () => {
  it("reminded_at é timestamptz nula por padrão", () => {
    expect(
      valor(`select data_type || '|' || is_nullable || '|' || coalesce(column_default, '<null>')
               from information_schema.columns
              where table_schema = 'public' and table_name = 'crm_tasks' and column_name = 'reminded_at'`),
    ).toBe("timestamp with time zone|YES|<null>");
    expect(valor(`select coalesce(reminded_at::text, '<null>') from crm_tasks where id = '${TAREFA}'`)).toBe("<null>");
  });

  it("o índice parcial existe com o predicado da varredura", () => {
    const def = valor(`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'crm_tasks_a_avisar_idx'`);
    expect(def).toContain("(due_date)");
    expect(def).toContain("reminded_at IS NULL");
    expect(def).toContain("due_date IS NOT NULL");
    expect(def).toMatch(/pending.*in_progress/);
  });

  it("o CHECK aceita task_due e segue recusando kind desconhecido", () => {
    sql(`insert into agent_inbox_items (organization_id, kind, severity, title)
           values ('${ORG}', 'task_due', 'warn', 'Hora da tarefa: Ligar')`);
    expect(valor(`select count(*) from agent_inbox_items where organization_id = '${ORG}' and kind = 'task_due'`)).toBe("1");
    expect(() =>
      sql(`insert into agent_inbox_items (organization_id, kind, severity, title)
             values ('${ORG}', 'kind_que_nao_existe', 'warn', 'x')`),
    ).toThrow(/agent_inbox_items_kind_check/);
  });

  it("a reivindicação é exclusiva: o segundo UPDATE condicional não devolve linha", () => {
    // O CTE devolve só a contagem: o `UPDATE n` do psql não entra na saída.
    const reivindicar = `with r as (
                           update crm_tasks set reminded_at = now()
                            where id = '${TAREFA}' and reminded_at is null
                              and status in ('pending', 'in_progress')
                           returning id)
                         select count(*) from r;`;
    expect(valor(reivindicar)).toBe("1");
    expect(valor(reivindicar)).toBe("0");
  });
});
