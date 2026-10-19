import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9053: levar o negócio para outro funil MOVE O MESMO CARD (decisão do
 * Peterson, 19/10/2026) e o funil de ORIGEM segue contando a passagem.
 *
 * O que se prova, no banco de verdade:
 *  - mover não duplica: continua UM negócio, com o mesmo id, no funil de destino,
 *    aberto e na etapa escolhida;
 *  - a origem mantém o ganho: `crm_desfechos_de_negocio` conta o ganho no funil de
 *    Vendas e `fn_attendant_metrics`/`fn_atrito_metrics` seguem dando 1 ganho.
 *    CONTROLE NEGATIVO: o mesmo ganho lido só de `crm_leads` (pipeline/status
 *    atuais) dá ZERO; a passagem é o que o mantém;
 *  - nenhum `lead.won`/`lead.lost` sai da troca (nenhuma conversão de novo);
 *  - isolamento: o manager de outra organização não move, não vê a passagem nem o
 *    desfecho;
 *  - forma: função e view INVOKER, nada para anon.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `90530000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MGR_A = id(11);
const MGR_B = id(12);
const AG_A = id(13);
const VENDAS = id(21);
const POS = id(22);
const S_NOVO = id(31);
const S_GANHO = id(32);
const S_POS_1 = id(33);
const S_POS_2 = id(34);
const LEAD = id(41);

const seed = `
begin;
insert into auth.users(id,email) values
 ('${MGR_A}','d9053-mgra@invariant.test'),('${MGR_B}','d9053-mgrb@invariant.test'),('${AG_A}','d9053-aga@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','d9053-a','D9053 A','D9053 A'),('${ORG_B}','d9053-b','D9053 B','D9053 B');
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MGR_A}','manager',now()),('${ORG_B}','${MGR_B}','manager',now()),('${ORG_A}','${AG_A}','agent',now());
insert into crm_pipelines(id,organization_id,name,slug) values
 ('${VENDAS}','${ORG_A}','D9053 Vendas','d9053-vendas'),('${POS}','${ORG_A}','D9053 Pos','d9053-pos');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_won) values
 ('${S_NOVO}','${ORG_A}','${VENDAS}','Novo','novo',1,false),
 ('${S_GANHO}','${ORG_A}','${VENDAS}','Ganho','ganho',9,true),
 ('${S_POS_1}','${ORG_A}','${POS}','Boas-vindas','boas-vindas',1,false),
 ('${S_POS_2}','${ORG_A}','${POS}','Recompra','recompra',2,false);
insert into crm_leads(id,organization_id,pipeline_id,stage_id,title,owner_user_id,value_cents) values
 ('${LEAD}','${ORG_A}','${VENDAS}','${S_GANHO}','D9053 venda','${MGR_A}',500000);
`;

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

const como = (user: string) =>
  `reset role; select set_config('request.jwt.claims', ${lit(
    JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" }),
  )}, true); set local role authenticated;`;

const espera = (rotulo: string, expressao: string, esperado: string) => `
do $t$ declare v text; begin
  v := (${expressao})::text;
  if v is distinct from ${esperado} then raise exception '%: deu %, esperado %', ${lit(rotulo)}, v, ${esperado}; end if;
end $t$;`;

function prova(corpo: string): string {
  try {
    return sql(`${seed}\n${corpo}\nreset role;\nrollback;\nselect 'provado';`);
  } catch (erro) {
    const e = erro as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error([e.message, String(e.stderr ?? ""), String(e.stdout ?? "")].join("\n"));
  }
}

const mover = (etapa = S_POS_1) =>
  `select public.fn_mover_lead_de_funil('${ORG_A}','${LEAD}','${POS}','${etapa}','${MGR_A}');`;

const JANELA = "now() - interval '1 day', now() + interval '1 day'";

describe("9053: forma e permissões", () => {
  it("fn_mover_lead_de_funil é INVOKER, com EXECUTE para authenticated e nada para anon/public", () => {
    const out = sql(`
      select p.prosecdef,
             has_function_privilege('authenticated', p.oid, 'EXECUTE'),
             has_function_privilege('anon', p.oid, 'EXECUTE'),
             coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)
        from pg_proc p
       where p.oid = 'public.fn_mover_lead_de_funil(uuid,uuid,uuid,uuid,uuid)'::regprocedure;`);
    expect(out).toBe("f|t|f|f");
  });

  it("a tabela tem RLS e a view é security_invoker; anon não lê nenhuma das duas", () => {
    const out = sql(`
      select (select relrowsecurity from pg_class where oid = 'public.crm_lead_passagens_de_funil'::regclass),
             (select coalesce('security_invoker=true' = any(reloptions), false) from pg_class where oid = 'public.crm_desfechos_de_negocio'::regclass),
             has_table_privilege('anon', 'public.crm_lead_passagens_de_funil', 'SELECT'),
             has_table_privilege('anon', 'public.crm_desfechos_de_negocio', 'SELECT'),
             has_table_privilege('authenticated', 'public.crm_lead_passagens_de_funil', 'UPDATE');`);
    expect(out).toBe("t|t|f|f|f");
  });
});

describe("9053: mover não duplica e a origem mantém o ganho", () => {
  it("ganho em Vendas levado ao Pós-venda: mesmo card, aberto no destino, ganho contado em Vendas", () => {
    expect(
      prova(`${como(MGR_A)}
${espera("antes: ganho em Vendas pelo crm_leads", `(select count(*) from crm_leads where pipeline_id = '${VENDAS}' and status = 'won')`, "'1'")}
${mover(S_POS_2)}
${espera("um negócio só na org", `(select count(*) from crm_leads where organization_id = '${ORG_A}')`, "'1'")}
${espera("o mesmo card no destino", `(select pipeline_id || '/' || stage_id || '/' || status || '/' || coalesce(closed_at::text,'-') || '/' || coalesce(value_cents::text,'-') from crm_leads where id = '${LEAD}')`, `'${POS}/${S_POS_2}/open/-/-'`)}
${espera("uma passagem, com o retrato da saída", `(select count(*) || '/' || max(status_na_saida) || '/' || max(value_cents) || '/' || max(de_stage_id::text) from crm_lead_passagens_de_funil where lead_id = '${LEAD}')`, `'1/won/500000/${S_GANHO}'`)}
${espera("CONTROLE NEGATIVO: só pelo crm_leads, Vendas perdeu o ganho", `(select count(*) from crm_leads where pipeline_id = '${VENDAS}' and status = 'won')`, "'0'")}
${espera("Vendas segue com o ganho nos desfechos", `(select count(*) || '/' || sum(value_cents) from crm_desfechos_de_negocio where pipeline_id = '${VENDAS}' and status = 'won')`, "'1/500000'")}
${espera("Pós-venda não ganha nada", `(select count(*) from crm_desfechos_de_negocio where pipeline_id = '${POS}')`, "'0'")}
${espera("ganho do responsável", `(public.fn_attendant_metrics('${ORG_A}', ${JANELA})->'attendants'->0->>'won')`, "'1'")}
${espera("eficiência do atrito", `(public.fn_atrito_metrics('${ORG_A}', ${JANELA})->'eficiencia'->>'ganhos')`, "'1'")}
reset role;
${espera("nenhum lead.won/lost novo depois da troca", `(select count(*) from event_log where organization_id = '${ORG_A}' and event_type in ('lead.won','lead.lost','lead.created','lead.stage_changed') and created_at > (select movido_em from crm_lead_passagens_de_funil where lead_id = '${LEAD}') )`, "'0'")}`),
    ).toContain("provado");
  });

  it("mesmo funil e etapa de outro funil são recusados, sem passagem", () => {
    expect(() =>
      prova(`${como(MGR_A)}
select public.fn_mover_lead_de_funil('${ORG_A}','${LEAD}','${VENDAS}','${S_NOVO}','${MGR_A}');`),
    ).toThrow(/pipeline_unchanged/);
    expect(() =>
      prova(`${como(MGR_A)}
select public.fn_mover_lead_de_funil('${ORG_A}','${LEAD}','${POS}','${S_NOVO}','${MGR_A}');`),
    ).toThrow(/stage_pipeline_mismatch/);
  });
});

describe("9053: o retrato é do GATILHO, com o OLD real", () => {
  it("UPDATE direto de pipeline_id grava a passagem; trocar só a etapa não grava", () => {
    expect(
      prova(`
update crm_leads set stage_id = '${S_NOVO}' where id = '${LEAD}';
${espera("trocar etapa no mesmo funil não é passagem", `(select count(*) from crm_lead_passagens_de_funil)`, "'0'")}
update crm_leads set stage_id = '${S_GANHO}' where id = '${LEAD}';
update crm_leads set pipeline_id = '${POS}', stage_id = '${S_POS_1}' where id = '${LEAD}';
${espera("o UPDATE de pipeline_id gravou o retrato do OLD", `(select count(*) || '/' || max(status_na_saida) || '/' || max(value_cents) || '/' || max(de_pipeline_id::text) from crm_lead_passagens_de_funil where lead_id = '${LEAD}')`, `'1/won/500000/${VENDAS}'`)}`),
    ).toContain("provado");
  });

  it("movido_por é auth.uid(): o p_ator do cliente é ignorado com sessão", () => {
    expect(
      prova(`${como(MGR_A)}
select public.fn_mover_lead_de_funil('${ORG_A}','${LEAD}','${POS}','${S_POS_1}','${MGR_B}');
${espera("ator = quem está logado", `(select movido_por_user_id::text from crm_lead_passagens_de_funil where lead_id = '${LEAD}')`, `'${MGR_A}'`)}`),
    ).toContain("provado");
  });

  it("sem sessão (service_role), vale o p_ator", () => {
    expect(
      prova(`
select public.fn_mover_lead_de_funil('${ORG_A}','${LEAD}','${POS}','${S_POS_1}','${MGR_A}');
${espera("ator = p_ator", `(select movido_por_user_id::text from crm_lead_passagens_de_funil where lead_id = '${LEAD}')`, `'${MGR_A}'`)}`),
    ).toContain("provado");
  });
});

describe("9053: isolamento entre organizações", () => {
  it("o manager de B não move o negócio de A, nem vê a passagem ou o desfecho", () => {
    expect(() => prova(`${como(MGR_B)}\n${mover()}`)).toThrow(/lead_not_found/);
    expect(
      prova(`${como(MGR_A)}
${mover()}
${como(MGR_B)}
${espera("B não vê a passagem de A", `(select count(*) from crm_lead_passagens_de_funil)`, "'0'")}
${espera("B não vê o desfecho de A", `(select count(*) from crm_desfechos_de_negocio where organization_id = '${ORG_A}')`, "'0'")}
${como(MGR_A)}
${espera("A vê a própria passagem (controle positivo)", `(select count(*) from crm_lead_passagens_de_funil)`, "'1'")}`),
    ).toContain("provado");
  });

  it("ninguém do cliente grava retrato: nem o agent da PRÓPRIA org, nem o de outra (P1 da #206)", () => {
    const retratoFalso = `insert into crm_lead_passagens_de_funil (organization_id, lead_id, de_pipeline_id, status_na_saida, value_cents, closed_at, para_pipeline_id, para_stage_id)
values ('${ORG_A}','${LEAD}','${VENDAS}','won',99900000,now(),'${POS}','${S_POS_1}');`;
    expect(() => prova(`${como(AG_A)}
${retratoFalso}`)).toThrow(/permission denied/);
    expect(() => prova(`${como(MGR_A)}
${retratoFalso}`)).toThrow(/permission denied/);
    expect(() => prova(`${como(MGR_B)}
${retratoFalso}`)).toThrow(/permission denied/);
    expect(
      sql(`select has_table_privilege('authenticated','public.crm_lead_passagens_de_funil','INSERT'),
                  has_table_privilege('anon','public.crm_lead_passagens_de_funil','INSERT');`),
    ).toBe("f|f");
  });
});
