/**
 * A PODA DO BUS DE EVENTOS NUNCA PERDE TRABALHO — migration 9021.
 *
 * ## O incidente que pediu este arquivo
 *
 * Entre 27 e 29/09/2026 o banco de um cliente (Supabase free, cota de 500 MB)
 * chegou a 735 MB e entrou em `default_transaction_read_only`: dois dias sem
 * sistema, e 36–37% dos webhooks de WhatsApp recusados — o FZAP não reenvia,
 * então essas mensagens não existem no CRM. O culpado foi uma tabela de log sem
 * poda. Com o banco já limpo (77 MB), `event_log` era a maior das que restaram
 * sem dono: 13 MB, 16.094 linhas, nenhuma poda em lugar nenhum.
 *
 * ## O que este arquivo mede que o estático não mede
 *
 * `tests/unit/retencao-todo-piso-tem-dono.test.ts` casa o par do TypeScript com
 * o TEXTO `greatest(coalesce(p_retencao_dias, 120), 90)` dentro do corpo da
 * função no `baseline.sql`. É prova de SÍMBOLO: ela não distingue um piso que
 * está escrito de um piso que está escrito e IGNORADO — bastaria usar
 * `p_retencao_dias` cru na cláusula `where` logo abaixo para o texto continuar
 * lá e o piso não valer nada.
 *
 * Aqui a função REAL roda contra linhas REAIS, e o que se mede é quem sobrou.
 *
 * ## O risco do conserto, que é o que este arquivo vigia
 *
 * Uma poda mal cortada PERDE TRABALHO, e neste bus o trabalho perdido é a
 * resposta a um cliente. `pending` é evento que ainda vai ser processado — um
 * pendente de 200 dias não é lixo velho, é um dreno que parou, e apagá-lo troca
 * uma pane visível (fila que cresce) por uma invisível (fila que some sozinha).
 * `processing` está com um dreno AGORA, ou ficou órfão de um que morreu no meio
 * — e nesse caso `lib/routing/worker.ts` o devolve para `pending`; apagar por
 * idade competiria com essa recuperação e a poda ganharia, em silêncio.
 *
 * O terceiro caso que só um Postgres de verdade prova é o corte por
 * `created_at`: `trg_event_log_touch` reescreve `updated_at` a cada tentativa, e
 * uma poda que medisse idade por ele deixaria a linha REJUVENESCER a cada retry
 * — a tabela nunca encolheria e o teste do horizonte continuaria verde.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

const ORG = "90210000-0000-4000-8000-000000000001";
const REGRA = "90210000-1111-4000-8000-000000000001";

/** Um id determinístico por caso — sem colisão com os outros arquivos. */
function id(n: number): string {
  return `90210000-2222-4000-8000-${String(n).padStart(12, "0")}`;
}

function valor(consulta: string): number {
  const saida = sql(consulta).trim().split("\n").at(-1) ?? "";
  if (!/^-?\d+$/.test(saida)) throw new Error(`saída inesperada do psql: ${saida}`);
  return Number(saida);
}

function texto(consulta: string): string {
  return sql(consulta).trim().split("\n").at(-1) ?? "";
}

/**
 * Semeia um evento com idade e status escolhidos.
 *
 * `entity_id` fica nulo de propósito: `event_log_routing_active_unique` é única
 * por (organização, entidade) entre os `pending`/`processing` de
 * `conversation.routing_requested`, e semear entidade repetida faria um caso de
 * RETENÇÃO morrer com `23505` — um vermelho que não fala de retenção nenhuma.
 */
function semear(opts: { id: string; status: string; idadeDias: number }): void {
  sql(`
    insert into public.event_log (id, organization_id, event_type, entity_kind, status, created_at)
    values ('${opts.id}', '${ORG}', 'teste.poda', 'contact', '${opts.status}',
            now() - make_interval(days => ${opts.idadeDias}));
  `);
}

function quantosRestam(): number {
  return valor(`select count(*) from public.event_log where organization_id = '${ORG}'`);
}

beforeEach(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'org-poda-9021', 'Org Poda 9021 LTDA', 'Org Poda 9021')
      on conflict (id) do nothing;
    insert into public.automation_rules (id, organization_id, name, trigger_event)
      values ('${REGRA}', '${ORG}', 'Regra da poda 9021', 'teste.poda')
      on conflict (id) do nothing;
    delete from public.automation_rule_runs where organization_id = '${ORG}';
    delete from public.event_log where organization_id = '${ORG}';
  `);
});

describe("fn_podar_event_log — o terminal velho sai, o trabalho fica", () => {
  it("controle positivo: a função existe e devolve inteiro", () => {
    // Sem isto, uma função AUSENTE faria todos os casos de "não apagou" passarem
    // por vacuidade — zero apagados é verdade quando nada roda.
    expect(valor(`select public.fn_podar_event_log(120, 100)`)).toBeGreaterThanOrEqual(0);
  });

  it("apaga done/dead velhos e NÃO toca em pending/processing da MESMA idade", () => {
    semear({ id: id(1), status: "done", idadeDias: 400 });
    semear({ id: id(2), status: "dead", idadeDias: 400 });
    // Os dois abaixo têm a MESMA idade: se a regra fosse só idade, os quatro
    // sairiam juntos. É o corte por STATUS que este caso mede, e ele é a
    // diferença entre podar log e perder a resposta a um cliente.
    semear({ id: id(3), status: "pending", idadeDias: 400 });
    semear({ id: id(4), status: "processing", idadeDias: 400 });

    expect(valor(`select public.fn_podar_event_log(120, 1000)`)).toBe(2);
    expect(
      texto(
        `select string_agg(status, ',' order by status) from public.event_log
          where organization_id = '${ORG}'`,
      ),
    ).toBe("pending,processing");
  });

  it("pending e processing não saem em IDADE NENHUMA, nem com o knob no chão", () => {
    // Dez anos, e o chamador pedindo zero dias de retenção. Se existisse um
    // caminho por idade para apagar trabalho não processado, ele apareceria
    // aqui. O corte por status vem ANTES do de idade, e é por isso que não há.
    semear({ id: id(5), status: "pending", idadeDias: 3650 });
    semear({ id: id(6), status: "processing", idadeDias: 3650 });

    expect(
      valor(`select public.fn_podar_event_log(0, 1000)`),
      "a poda apagou evento não processado — isso é trabalho perdido, não espaço liberado",
    ).toBe(0);
    expect(quantosRestam()).toBe(2);
  });

  it("NÃO apaga linha RECENTE: o corte é por idade", () => {
    // O controle negativo do horizonte. Sem ele, uma função que apagasse TUDO o
    // que é `done` deixaria os casos acima verdes — eles só olham quem sobrou
    // entre linhas velhas.
    semear({ id: id(7), status: "done", idadeDias: 10 });
    semear({ id: id(8), status: "dead", idadeDias: 30 });
    expect(valor(`select public.fn_podar_event_log(120, 1000)`)).toBe(0);
    expect(quantosRestam()).toBe(2);
  });

  it("o corte é por created_at, e NÃO por updated_at (que o dreno reescreve)", () => {
    // `trg_event_log_touch` põe `now()` em `updated_at` a cada tentativa. Uma
    // poda que medisse idade por ele veria uma linha de 400 dias como recém-
    // nascida a cada retry, e a tabela nunca encolheria — com todos os outros
    // casos deste arquivo ainda verdes, porque neles as duas colunas concordam.
    semear({ id: id(9), status: "done", idadeDias: 400 });
    sql(`update public.event_log set attempts = attempts + 1 where id = '${id(9)}';`);
    expect(
      valor(
        `select count(*) from public.event_log
          where id = '${id(9)}' and updated_at > now() - interval '1 minute'`,
      ),
      "INSTRUMENTO: o trigger de updated_at não tocou a linha — o caso não mede nada",
    ).toBe(1);

    expect(valor(`select public.fn_podar_event_log(120, 1000)`)).toBe(1);
  });

  it("o PISO de 90 dias mora na função: p_retencao_dias = 0 não apaga o de um mês", () => {
    // É esta linha que impede o knob de espaço de virar apagador de GRÁFICO: as
    // telas de IA leem `event_log` direto por `created_at`, com janela máxima de
    // 90 dias. Quem chama pede zero; a função eleva ao piso.
    semear({ id: id(10), status: "done", idadeDias: 30 });
    semear({ id: id(11), status: "done", idadeDias: 200 });
    expect(valor(`select public.fn_podar_event_log(0, 1000)`)).toBe(1);
    expect(valor(`select count(*) from public.event_log where id = '${id(10)}'`)).toBe(1);
  });

  it("respeita o `p_limite` — é isso que torna o DELETE lote, e não travamento", () => {
    // `event_log` é escrita por todo gatilho e lida pelo dreno A CADA MINUTO. Um
    // `limit` decorativo apagaria as cinco de uma vez, e o tempo de lock cresce
    // com o backlog: a poda derrubaria a entrada de mensagem, que é o oposto do
    // que ela existe para proteger.
    for (let i = 0; i < 5; i += 1) semear({ id: id(20 + i), status: "done", idadeDias: 300 });
    expect(valor(`select public.fn_podar_event_log(120, 2)`)).toBe(2);
    expect(quantosRestam()).toBe(3);
  });

  it("apaga da PONTA MAIS VELHA — o lote não escolhe a esmo", () => {
    // `order by created_at` antes do `limit`. Sem ele o lote pegaria linhas
    // arbitrárias, e uma instalação com backlog nunca alcançaria o estado
    // estável: a ponta velha sobreviveria por sorteio, rodada após rodada.
    semear({ id: id(30), status: "done", idadeDias: 500 });
    semear({ id: id(31), status: "done", idadeDias: 300 });
    expect(valor(`select public.fn_podar_event_log(120, 1)`)).toBe(1);
    expect(valor(`select count(*) from public.event_log where id = '${id(30)}'`)).toBe(0);
    expect(valor(`select count(*) from public.event_log where id = '${id(31)}'`)).toBe(1);
  });

  it("o run da automação SOBREVIVE e só perde o ponteiro (efeito DECLARADO)", () => {
    // `automation_rule_runs.event_id` é `on delete set null`. O histórico do que
    // a regra fez FICA — é o que a tela de runs mostra —, e o botão "Reenviar"
    // já sabe responder `event_gone`/409 quando o ponteiro é nulo. Sem este caso
    // uma FK trocada para `cascade` apagaria o histórico junto, em silêncio.
    semear({ id: id(40), status: "done", idadeDias: 400 });
    sql(`
      insert into public.automation_rule_runs (organization_id, rule_id, event_id, status)
      values ('${ORG}', '${REGRA}', '${id(40)}', 'success');
    `);

    expect(valor(`select public.fn_podar_event_log(120, 1000)`)).toBe(1);

    expect(
      valor(`select count(*) from public.automation_rule_runs where organization_id = '${ORG}'`),
      "a poda levou o histórico da automação junto — a FK deixou de ser `set null`",
    ).toBe(1);
    expect(
      valor(
        `select count(*) from public.automation_rule_runs
          where organization_id = '${ORG}' and event_id is null`,
      ),
    ).toBe(1);
  });
});

describe("quem pode chamar a poda do bus", () => {
  it("não é executável por anon nem por authenticated", () => {
    // As DUAS origens de EXECUTE: o grant DIRETO do `ALTER DEFAULT PRIVILEGES
    // ... TO anon` do baseline, e o grant a PUBLIC que o Postgres dá na criação.
    // Tratar só uma deixa a função alcançável pela anon key, que vai ao browser
    // — e esta apaga linhas.
    for (const papel of ["anon", "authenticated"]) {
      expect(
        texto(`
          select has_function_privilege('${papel}',
            'public.fn_podar_event_log(int,int)', 'EXECUTE')::text
        `),
        `${papel} pode executar fn_podar_event_log`,
      ).toBe("false");
    }
  });

  it("service_role PODE — controle positivo do revoke", () => {
    // Sem este controle, um `revoke` largo demais deixaria o caso acima verde e
    // a poda MORTA: o cron responderia `permission denied` todo dia, e a tabela
    // voltaria a crescer sem teto com o gate inteiro no verde.
    expect(
      texto(`
        select has_function_privilege('service_role',
          'public.fn_podar_event_log(int,int)', 'EXECUTE')::text
      `),
    ).toBe("true");
  });
});
