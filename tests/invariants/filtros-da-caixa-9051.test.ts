import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9051: os filtros da Inbox por funil, etapa, responsável e período.
 *
 * `funis_da_conversa(c)` e `etapas_da_conversa(c)` são os campos calculados que a
 * lista filtra (`cs`/`ov` do PostgREST); `fn_contagens_da_caixa` ganha `p_funil`,
 * `p_etapas`, `p_responsavel` e `p_desde` e aplica as MESMAS funções.
 *
 * O que se prova, por ator (manager, agent em modo `own`, quem é de outra
 * organização): o "Todas" da contagem bate com a pergunta da lista escrita À MÃO
 * sobre `crm_leads` (um `exists`, sem as funções novas, para que a prova não seja
 * a função conferindo a si mesma), ninguém conta o que é de outra organização
 * passando o id dela, e as funções seguem INVOKER, sem EXECUTE para anon/public.
 * Controle negativo: sem o predicado do funil, sem o das etapas, ou com SECURITY
 * DEFINER, os números mudam.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `90510000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MGR_A = id(11);
const AG_A = id(12); // agent de A; A em modo own
const MGR_B = id(14);
const SESS_A = id(41);
const SESS_B = id(42);
const P1 = id(51);
const P2 = id(52);
const PB = id(53);
const S11 = id(61);
const S12 = id(62);
const S21 = id(63);
const SB1 = id(64);
const K = (n: number) => id(100 + n);
const CV = (n: number) => id(200 + n);

const ASSINATURA =
  "public.fn_contagens_da_caixa(uuid,text[],text[],uuid,text,boolean,text[],text,boolean,text,boolean,uuid,uuid[],text,timestamptz)";

// Negócios: K1 em P1/S11, K2 em P1/S12, K3 em P2/S21 E em P1/S11 (dois negócios, uma
// conversa só), K4 em P1/S12 (dono: o agent), K5 sem negócio, K6 (B) em PB/SB1.
// Conversas: CV4 é do agent, CV5 sem responsável. Última mensagem: CV1 e CV4 há 1 h,
// CV2 há 3 dias, CV3 há 10 dias, CV5 nunca.
const seed = `
begin;
insert into auth.users(id,email) values
 ('${MGR_A}','d9051-mgra@invariant.test'),('${AG_A}','d9051-aga@invariant.test'),('${MGR_B}','d9051-mgrb@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','d9051-a','D9051 A','D9051 A'),('${ORG_B}','d9051-b','D9051 B','D9051 B');
update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"own"}' where id = '${ORG_A}';
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MGR_A}','manager',now()),('${ORG_A}','${AG_A}','agent',now()),('${ORG_B}','${MGR_B}','manager',now());
insert into contacts(id,organization_id,display_name) values
 ('${K(1)}','${ORG_A}','D9051 K1'),('${K(2)}','${ORG_A}','D9051 K2'),('${K(3)}','${ORG_A}','D9051 K3'),
 ('${K(4)}','${ORG_A}','D9051 K4'),('${K(5)}','${ORG_A}','D9051 K5'),('${K(6)}','${ORG_B}','D9051 K6');
insert into crm_pipelines(id,organization_id,name,slug) values
 ('${P1}','${ORG_A}','D9051 P1','d9051-p1'),('${P2}','${ORG_A}','D9051 P2','d9051-p2'),('${PB}','${ORG_B}','D9051 PB','d9051-pb');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values
 ('${S11}','${ORG_A}','${P1}','Entrada','entrada',1),('${S12}','${ORG_A}','${P1}','Proposta','proposta',2),
 ('${S21}','${ORG_A}','${P2}','Entrada','entrada',1),('${SB1}','${ORG_B}','${PB}','Entrada','entrada',1);
insert into crm_leads(organization_id,pipeline_id,stage_id,contact_id,title,owner_user_id) values
 ('${ORG_A}','${P1}','${S11}','${K(1)}','D9051 L1',null),
 ('${ORG_A}','${P1}','${S12}','${K(2)}','D9051 L2',null),
 ('${ORG_A}','${P2}','${S21}','${K(3)}','D9051 L3',null),
 ('${ORG_A}','${P1}','${S11}','${K(3)}','D9051 L3b',null),
 ('${ORG_A}','${P1}','${S12}','${K(4)}','D9051 L4','${AG_A}'),
 ('${ORG_B}','${PB}','${SB1}','${K(6)}','D9051 L6',null);
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SESS_A}','${ORG_A}','d9051-a','\\x00'::bytea),('${SESS_B}','${ORG_B}','d9051-b','\\x00'::bytea);
insert into conversations(id,organization_id,contact_id,channel_session_id,channel,status,assigned_to_user_id,last_message_at) values
 ('${CV(1)}','${ORG_A}','${K(1)}','${SESS_A}','whatsapp','open','${MGR_A}',now() - interval '1 hour'),
 ('${CV(2)}','${ORG_A}','${K(2)}','${SESS_A}','whatsapp','open','${MGR_A}',now() - interval '3 days'),
 ('${CV(3)}','${ORG_A}','${K(3)}','${SESS_A}','whatsapp','open','${MGR_A}',now() - interval '10 days'),
 ('${CV(4)}','${ORG_A}','${K(4)}','${SESS_A}','whatsapp','open','${AG_A}',now() - interval '1 hour'),
 ('${CV(5)}','${ORG_A}','${K(5)}','${SESS_A}','whatsapp','open',null,null),
 ('${CV(6)}','${ORG_B}','${K(6)}','${SESS_B}','whatsapp','open','${MGR_B}',now() - interval '1 hour');
`;

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

const como = (user: string | null) =>
  `reset role; select set_config('request.jwt.claims', ${
    user ? lit(JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" })) : "''"
  }, true); set local role authenticated;`;

const espera = (rotulo: string, expressao: string, esperado: string) => `
do $t$ declare v text; begin
  v := (${expressao})::text;
  if v is distinct from ${esperado} then raise exception '%: deu %, esperado %', ${lit(rotulo)}, v, ${esperado}; end if;
end $t$;`;

interface Filtro {
  nome: string;
  funil?: string;
  etapas?: string[];
  responsavel?: string;
  /** Expressão SQL do corte (a rota manda o valor já calculado). */
  desde?: string;
}

const uuids = (xs: string[]) => `array[${xs.map((x) => `'${x}'`).join(",")}]::uuid[]`;

/** O "Todas" da contagem com o filtro. */
const badge = (org: string, f: Filtro) =>
  `select (public.fn_contagens_da_caixa('${org}', array['aguardando'], array['closed','archived']${
    f.funil ? `, p_funil => '${f.funil}'` : ""
  }${f.etapas ? `, p_etapas => ${uuids(f.etapas)}` : ""}${f.responsavel ? `, p_responsavel => '${f.responsavel}'` : ""}${
    f.desde ? `, p_desde => ${f.desde}` : ""
  })->>'all')::bigint`;

/** A pergunta da lista, escrita à mão sobre `crm_leads` (sem as funções novas). */
const lista = (org: string, f: Filtro) => {
  const negocio = (cond: string) =>
    ` and exists (select 1 from public.crm_leads l where l.contact_id = c.contact_id and l.organization_id = c.organization_id and ${cond})`;
  const partes = [
    f.etapas ? negocio(`l.stage_id = any (${uuids(f.etapas)})`) : f.funil ? negocio(`l.pipeline_id = '${f.funil}'`) : "",
    f.responsavel === "ninguem"
      ? " and c.assigned_to_user_id is null"
      : f.responsavel
        ? ` and c.assigned_to_user_id = '${f.responsavel}'`
        : "",
    f.desde ? ` and c.last_message_at >= ${f.desde}` : "",
  ];
  return `(select count(*) from public.conversations c where c.organization_id = '${org}'${partes.join("")})::text`;
};

const ATORES = [
  ["mgr_a", MGR_A],
  ["ag_a", AG_A],
  ["mgr_b", MGR_B],
] as const;
const DOIS_DIAS = "now() - interval '2 days'";
const FILTROS: Filtro[] = [
  { nome: "P1", funil: P1 },
  { nome: "P1-S12", funil: P1, etapas: [S12] },
  { nome: "P1-S11-S12", funil: P1, etapas: [S11, S12] },
  { nome: "P2", funil: P2 },
  { nome: "PB", funil: PB },
  { nome: "SB1", etapas: [SB1] },
  { nome: "ninguem", responsavel: "ninguem" },
  { nome: "mgr_a", responsavel: MGR_A },
  { nome: "2d", desde: DOIS_DIAS },
  { nome: "P1-2d", funil: P1, desde: DOIS_DIAS },
];

const PROVA = ATORES.flatMap(([nome, user]) =>
  [ORG_A, ORG_B].flatMap((org) =>
    FILTROS.map(
      (f) => `${como(user)}
${espera(`${nome}/${org === ORG_A ? "A" : "B"}/${f.nome}`, badge(org, f), lista(org, f))}`,
    ),
  ),
).join("\n");

/** Roda a prova e, se o psql falhar, lança com o stderr dele (a linha do RAISE). */
function prova(corpo: string): string {
  try {
    return sql(`${seed}\n${corpo}\nreset role;\nrollback;\nselect 'provado';`);
  } catch (erro) {
    const e = erro as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error([e.message, String(e.stderr ?? ""), String(e.stdout ?? "")].join("\n"));
  }
}

describe("9051: forma e permissões", () => {
  it.each([
    ASSINATURA,
    "public.funis_da_conversa(public.conversations)",
    "public.etapas_da_conversa(public.conversations)",
  ])("%s: SECURITY INVOKER, EXECUTE para authenticated e nada para anon/public", (assinatura) => {
    const out = sql(`
      select p.prosecdef,
             has_function_privilege('authenticated', p.oid, 'EXECUTE'),
             has_function_privilege('anon', p.oid, 'EXECUTE'),
             coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)
        from pg_proc p
       where p.oid = '${assinatura}'::regprocedure;`);
    expect(out).toBe("f|t|f|f");
  });

  it("uma assinatura só (a de 11 parâmetros caiu: a chamada por nome não fica ambígua)", () => {
    const out = sql(`select count(*) from pg_proc where proname = 'fn_contagens_da_caixa' and pronamespace = 'public'::regnamespace;`);
    expect(out).toBe("1");
  });
});

describe("9051: o badge conta o MESMO que a lista", () => {
  it(`por ator (${ATORES.length}), organização (A e B) e filtro (${FILTROS.length})`, () => {
    expect(prova(PROVA)).toContain("provado");
  });

  it("âncoras escritas à mão: funil, etapa, isolamento e escopo do agent", () => {
    expect(
      prova(`${como(MGR_A)}
${espera("mgr_a A P1 (K3 tem dois negócios, conta uma vez)", badge(ORG_A, { nome: "", funil: P1 }), "'4'")}
${espera("mgr_a A P1 só Proposta", badge(ORG_A, { nome: "", funil: P1, etapas: [S12] }), "'2'")}
${espera("mgr_a A P2", badge(ORG_A, { nome: "", funil: P2 }), "'1'")}
${espera("mgr_a A funil de B", badge(ORG_A, { nome: "", funil: PB }), "'0'")}
${espera("mgr_a B funil de B (outra organização)", badge(ORG_B, { nome: "", funil: PB }), "'0'")}
${espera("mgr_a A sem responsável", badge(ORG_A, { nome: "", responsavel: "ninguem" }), "'1'")}
${espera("mgr_a A últimos 2 dias", badge(ORG_A, { nome: "", desde: DOIS_DIAS }), "'2'")}
${espera("mgr_a A lista: funis da CV3", `select array_length(public.funis_da_conversa(c), 1) from public.conversations c where c.id = '${CV(3)}'`, "'2'")}
${como(AG_A)}
${espera("ag_a A P1 Proposta (modo own)", badge(ORG_A, { nome: "", funil: P1, etapas: [S12] }), "'1'")}
${espera("ag_a A P2 (modo own)", badge(ORG_A, { nome: "", funil: P2 }), "'0'")}
${como(MGR_B)}
${espera("mgr_b B etapa de B", badge(ORG_B, { nome: "", etapas: [SB1] }), "'1'")}
${espera("mgr_b A P1 (outra organização)", badge(ORG_A, { nome: "", funil: P1 }), "'0'")}
${como(null)}
${espera("sem jwt", badge(ORG_A, { nome: "", funil: P1 }), "'0'")}`),
    ).toContain("provado");
  });
});

describe("9051: controle negativo (o instrumento pega mutante)", () => {
  const def = () => sql(`select pg_get_functiondef('${ASSINATURA}'::regprocedure);`);

  it("sem o predicado do funil: reprova", () => {
    const original = def();
    const mutante = original.replace("public.funis_da_conversa(c) @> array[p_funil]", "true");
    expect(mutante).not.toBe(original);
    // A prova começa pelo manager de A com P1: sem o predicado, o badge conta as 5 de A.
    expect(() => prova(`reset role;\n${mutante};\n${PROVA}`)).toThrow(/mgr_a\/A\/P1: deu 5, esperado 4/);
  });

  it("sem o predicado das etapas: reprova", () => {
    const original = def();
    const mutante = original.replace("public.etapas_da_conversa(c) && p_etapas", "true");
    expect(mutante).not.toBe(original);
    expect(() => prova(`reset role;\n${mutante};\n${PROVA}`)).toThrow(/mgr_a\/A\/P1-S12: deu 5, esperado 2/);
  });

  it("SECURITY DEFINER (pula a RLS de quem chama): reprova", () => {
    const original = def();
    const mutante = original.replace("\nAS $function$", "\n SECURITY DEFINER\nAS $function$");
    expect(mutante).not.toBe(original);
    // Sem a RLS de quem chama, o manager de A passa a contar a conversa de B no funil de B.
    expect(() => prova(`reset role;\n${mutante};\n${PROVA}`)).toThrow(/mgr_a\/B\/PB: deu 1, esperado 0/);
  });
});
