import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9054: cada ETAPA decide se envia conversão (Meta/Google) ao receber um
 * negócio (decisão do Peterson, 19/10/2026).
 *
 * O que se prova, no banco de verdade:
 *  - o BACKFILL da própria migration (o bloco `do $m$` lido do arquivo) preserva o
 *    comportamento: ganho → Purchase; aberta com regra do Google ligada →
 *    QualifiedLead; regra desligada e etapa comum → desligadas. Reaplicar não
 *    desfaz o que a organização mudou;
 *  - vocabulário fechado e chave ligada sem evento recusados;
 *  - livro-razão por ENTRADA: `sent` da mesma entrada não é rebaixado, escrita de
 *    entrada velha é ignorada, entrada nova reabre a linha;
 *  - `emit_event`: viewer NÃO emite `lead.*` (CONTROLE NEGATIVO: o mesmo viewer
 *    ainda emite evento que não é de negócio, e o agent emite `lead.*`);
 *    `ad_conversion.*` não sai de sessão nenhuma.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `90540000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const VIEWER = id(11);
const AGENT = id(12);
const FUNIL = id(21);
const S_NOVO = id(31);
const S_QUALI = id(32);
const S_DESLIGADA = id(33);
const S_GANHO = id(34);
const LEAD = id(41);

const seed = `
begin;
insert into auth.users(id,email) values
 ('${VIEWER}','d9054-viewer@invariant.test'),('${AGENT}','d9054-agent@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values ('${ORG}','d9054','D9054','D9054');
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG}','${VIEWER}','viewer',now()),('${ORG}','${AGENT}','agent',now());
insert into crm_pipelines(id,organization_id,name,slug) values ('${FUNIL}','${ORG}','D9054 Vendas','d9054-vendas');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_won) values
 ('${S_NOVO}','${ORG}','${FUNIL}','Novo','novo',1,false),
 ('${S_QUALI}','${ORG}','${FUNIL}','Qualificado','qualificado',2,false),
 ('${S_DESLIGADA}','${ORG}','${FUNIL}','Proposta','proposta',3,false),
 ('${S_GANHO}','${ORG}','${FUNIL}','Ganho','ganho',9,true);
insert into google_ads_conversion_rules(organization_id,stage_id,event_name,label,google_action_id,enabled) values
 ('${ORG}','${S_QUALI}','QualifiedLead','Qualificado','42',true),
 ('${ORG}','${S_DESLIGADA}','Etapa:${S_DESLIGADA}','Proposta','43',false);
insert into crm_leads(id,organization_id,pipeline_id,stage_id,title,owner_user_id,value_cents) values
 ('${LEAD}','${ORG}','${FUNIL}','${S_NOVO}','D9054 venda','${AGENT}',9900);
`;

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
const como = (user: string) =>
  `reset role; select set_config('request.jwt.claims', ${lit(
    JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" }),
  )}, true); set local role authenticated;`;

function prova(corpo: string): string {
  try {
    return sql(`${seed}\n${corpo}\nreset role;\nrollback;\nselect 'provado';`);
  } catch (erro) {
    const e = erro as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error([e.message, String(e.stderr ?? ""), String(e.stdout ?? "")].join("\n"));
  }
}

/** O bloco de backfill da PRÓPRIA migration, não uma cópia. */
const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261019180000_9054_conversao_por_etapa.sql"),
  "utf8",
);
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf("do $m$"), MIGRATION.indexOf("end $m$;") + 8);

/** psql -tA também imprime as etiquetas (BEGIN, UPDATE 1…): fica só o que casa. */
const linhas = (out: string, re: RegExp) => out.split("\n").filter((l) => re.test(l));
const saida = (out: string) => out.split("\n");

const estado = (stage: string) =>
  `select envia_conversao || '/' || coalesce(evento_de_conversao,'-') from crm_stages where id='${stage}';`;

describe("9054: backfill preserva o comportamento", () => {
  it("ganho → Purchase, regra do Google ligada → QualifiedLead, o resto desligado; reaplicar não desfaz", () => {
    expect(BACKFILL).toContain("add column envia_conversao");
    const out = prova(`
alter table public.crm_stages drop column envia_conversao cascade, drop column evento_de_conversao cascade;
${BACKFILL}
${estado(S_GANHO)}
${estado(S_QUALI)}
${estado(S_DESLIGADA)}
${estado(S_NOVO)}
update crm_stages set envia_conversao=false, evento_de_conversao=null where id='${S_GANHO}';
${BACKFILL}
${estado(S_GANHO)}`);
    expect(linhas(out, /^(true|false)\//)).toEqual([
      "true/Purchase",
      "true/QualifiedLead",
      "false/-",
      "false/-",
      "false/-",
    ]);
  });

  it("etapa nova nasce desligada; vocabulário fechado; chave ligada exige evento", () => {
    expect(
      saida(
        prova(`insert into crm_stages(organization_id,pipeline_id,name,slug,position) values ('${ORG}','${FUNIL}','Nova','nova',5);
select envia_conversao from crm_stages where slug='nova' and organization_id='${ORG}';`),
      ),
    ).toContain("f");
    expect(() => prova(`update crm_stages set envia_conversao=true where id='${S_NOVO}';`)).toThrow(
      /crm_stages_conversao_com_evento/,
    );
    expect(() =>
      prova(
        `update crm_stages set envia_conversao=true, evento_de_conversao='Lead' where id='${S_NOVO}';`,
      ),
    ).toThrow(/crm_stages_evento_de_conversao_conhecido/);
  });
});

describe("9054: etapa de GANHO nova nasce enviando a compra", () => {
  it("ganho nova → Purchase ligada; aberta nova → desligada; marcar ganho numa etapa nunca configurada liga; configurada não é sobrescrita", () => {
    const out = prova(`
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_won) values
 ('${id(51)}','${ORG}','${FUNIL}','Ganho 2','ganho-2',10,false);
update crm_stages set is_won=false where id='${S_GANHO}';
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position,is_won) values
 ('${id(52)}','${ORG}','${FUNIL}','Fechado','fechado',11,true),
 ('${id(53)}','${ORG}','${FUNIL}','Aberta','aberta',12,false);
${estado(id(52))}
${estado(id(53))}
update crm_stages set is_won=false where id='${id(52)}';
update crm_stages set envia_conversao=false where id='${id(52)}';
update crm_stages set is_won=true where id='${id(52)}';
${estado(id(52))}
update crm_stages set is_won=false where id='${id(52)}';
update crm_stages set is_won=true where id='${id(53)}';
${estado(id(53))}`);
    expect(linhas(out, /^(true|false)\//)).toEqual(["true/Purchase", "false/-", "false/Purchase", "true/Purchase"]);
  });
});

describe("9054: livro-razão por entrada", () => {
  it("mesma entrada não rebaixa sent; entrada velha é ignorada; entrada nova reabre", () => {
    const linha = `select status || '/' || entrada_em::date from ad_conversion_dispatches where lead_id='${LEAD}';`;
    const out = prova(`
insert into ad_conversion_dispatches(organization_id,lead_id,platform,event_name,status,entrada_em)
 values ('${ORG}','${LEAD}','meta_ads','Purchase','sent','2026-10-19');
update ad_conversion_dispatches set status='skipped' where lead_id='${LEAD}';
${linha}
update ad_conversion_dispatches set status='skipped', entrada_em='2026-10-01' where lead_id='${LEAD}';
${linha}
update ad_conversion_dispatches set status='skipped', entrada_em='2026-11-19' where lead_id='${LEAD}';
${linha}`);
    expect(linhas(out, /^(sent|skipped)\//)).toEqual([
      "sent/2026-10-19",
      "sent/2026-10-19",
      "skipped/2026-11-19",
    ]);
  });
});

describe("9054: emit_event — lead.* exige agent+, ad_conversion.* só do servidor", () => {
  const emite = (tipo: string) =>
    `select public.emit_event('${tipo}','crm_lead','${LEAD}','{}'::jsonb,'{}'::jsonb,'${ORG}') is not null;`;

  it("viewer é recusado em lead.stage_changed e lead.won", () => {
    expect(() => prova(`${como(VIEWER)}\n${emite("lead.stage_changed")}`)).toThrow(
      /caller_not_authorized_for_event/,
    );
    expect(() => prova(`${como(VIEWER)}\n${emite("lead.won")}`)).toThrow(
      /caller_not_authorized_for_event/,
    );
  });

  it("CONTROLE NEGATIVO: o mesmo viewer emite evento que não é de negócio; o agent emite lead.*", () => {
    expect(saida(prova(`${como(VIEWER)}\n${emite("crm.activity_write_failed")}`))).toContain("t");
    expect(saida(prova(`${como(AGENT)}\n${emite("lead.stage_changed")}`))).toContain("t");
  });

  it("ad_conversion.retry_requested não sai de sessão; o servidor (sem sessão) emite", () => {
    expect(() => prova(`${como(AGENT)}\n${emite("ad_conversion.retry_requested")}`)).toThrow(
      /reserved_server_event/,
    );
    expect(saida(prova(emite("ad_conversion.retry_requested")))).toContain("t");
  });

  it("anon não executa emit_event", () => {
    expect(
      sql(
        `select has_function_privilege('anon','public.emit_event(text,text,uuid,jsonb,jsonb,uuid)','execute');`,
      ),
    ).toBe("f");
  });
});
