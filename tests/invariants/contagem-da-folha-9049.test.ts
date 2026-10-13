import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9049: a contagem com os filtros da folha do celular.
 *
 * `fn_contagens_da_caixa` ganha `p_canal_tipo` (`conversations.channel`) e
 * `p_grupos` (`is_group`: nulo, só grupos ou sem grupos), para "Ver N conversas" contar
 * o MESMO que a lista.
 *
 * O que se prova, por ator: o número bate com a consulta da lista feita com a mesma
 * RLS (manager, agent em modo `own`, quem é de outra organização), ninguém conta o
 * que é de outra organização passando o id dela, e a função segue INVOKER, sem
 * EXECUTE para anon/public, numa assinatura só. Controle negativo: sem o predicado do
 * tipo de canal, ou com SECURITY DEFINER, os números mudam.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `90490000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MGR_A = id(11);
const AG_A = id(12); // agent de A; A em modo own
const MGR_B = id(14);
const SESS_A = id(41);
const SESS_B = id(42);
const K = (n: number) => id(100 + n);
const CV = (n: number) => id(200 + n);

const ASSINATURA = "public.fn_contagens_da_caixa(uuid,text[],text[],uuid,text,boolean,text[],text,boolean,text,boolean,uuid,uuid[],text,timestamptz)";

// A: CV1 e CV2 WhatsApp (CV2 grupo), CV3 e CV4 Instagram (CV4 do agent), CV5 Facebook.
// B: CV6 Instagram. O agent de A em modo own vê só a CV4.
const seed = `
begin;
insert into auth.users(id,email) values
 ('${MGR_A}','d9049-mgra@invariant.test'),('${AG_A}','d9049-aga@invariant.test'),('${MGR_B}','d9049-mgrb@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','d9049-a','D9049 A','D9049 A'),('${ORG_B}','d9049-b','D9049 B','D9049 B');
update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"own"}' where id = '${ORG_A}';
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MGR_A}','manager',now()),('${ORG_A}','${AG_A}','agent',now()),('${ORG_B}','${MGR_B}','manager',now());
insert into contacts(id,organization_id,display_name) values
 ('${K(1)}','${ORG_A}','D9049 K1'),('${K(2)}','${ORG_A}','D9049 K2'),('${K(3)}','${ORG_A}','D9049 K3'),
 ('${K(4)}','${ORG_A}','D9049 K4'),('${K(5)}','${ORG_A}','D9049 K5'),('${K(6)}','${ORG_B}','D9049 K6');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SESS_A}','${ORG_A}','d9049-a','\\x00'::bytea),('${SESS_B}','${ORG_B}','d9049-b','\\x00'::bytea);
insert into conversations(id,organization_id,contact_id,channel_session_id,channel,status,assigned_to_user_id,is_group) values
 ('${CV(1)}','${ORG_A}','${K(1)}','${SESS_A}','whatsapp','open','${MGR_A}',false),
 ('${CV(2)}','${ORG_A}','${K(2)}','${SESS_A}','whatsapp','open','${MGR_A}',true),
 ('${CV(3)}','${ORG_A}','${K(3)}','${SESS_A}','instagram','open','${MGR_A}',false),
 ('${CV(4)}','${ORG_A}','${K(4)}','${SESS_A}','instagram','open','${AG_A}',false),
 ('${CV(5)}','${ORG_A}','${K(5)}','${SESS_A}','facebook','open','${MGR_A}',false),
 ('${CV(6)}','${ORG_B}','${K(6)}','${SESS_B}','instagram','open','${MGR_B}',false);
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

/** O "Todas" da contagem com o filtro, e a mesma pergunta feita como a lista faz. */
const badge = (org: string, canal: string | null, grupos: boolean | null) =>
  `select (public.fn_contagens_da_caixa('${org}', array['aguardando'], array['closed','archived'], p_canal_tipo => ${
    canal ? `'${canal}'` : "null"
  }, p_grupos => ${grupos === null ? "null" : grupos})->>'all')::bigint`;
const lista = (org: string, canal: string | null, grupos: boolean | null) =>
  `(select count(*) from public.conversations c where c.organization_id = '${org}'${canal ? ` and c.channel = '${canal}'` : ""}${
    grupos === true ? " and c.is_group" : grupos === false ? " and not c.is_group" : ""
  })::text`;

const ATORES = [
  ["mgr_a", MGR_A],
  ["ag_a", AG_A],
  ["mgr_b", MGR_B],
] as const;
const FILTROS: [string | null, boolean | null][] = [
  ["whatsapp", null],
  ["instagram", null],
  ["facebook", null],
  [null, true],
  ["whatsapp", true],
  // "sem grupos", que a lista aceita (P2 do Cassio na #179).
  [null, false],
  ["whatsapp", false],
];
const rotuloDosGrupos = (g: boolean | null) => (g === true ? "grupos" : g === false ? "sem-grupos" : "-");

const PROVA = ATORES.flatMap(([nome, user]) =>
  [ORG_A, ORG_B].flatMap((org) =>
    FILTROS.map(
      ([canal, grupos]) => `${como(user)}
${espera(`${nome}/${org === ORG_A ? "A" : "B"}/${canal ?? "todos"}/${rotuloDosGrupos(grupos)}`, badge(org, canal, grupos), lista(org, canal, grupos))}`,
    ),
  ),
).join("\n");

/**
 * Roda a prova e, se o psql falhar, lança com o stderr e o stdout DELE na mensagem.
 * Medido na VPS30: o erro do `execFileSync` chegou só com "Command failed: docker
 * exec …", sem a linha do RAISE, e o controle negativo não tinha como provar o
 * MOTIVO da reprovação. Com o stderr anexado, o regex casa no texto do `espera`.
 */
function prova(corpo: string): string {
  try {
    return sql(`${seed}\n${corpo}\nreset role;\nrollback;\nselect 'provado';`);
  } catch (erro) {
    const e = erro as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
    throw new Error([e.message, String(e.stderr ?? ""), String(e.stdout ?? "")].join("\n"));
  }
}

describe("9049: forma e permissões", () => {
  it("SECURITY INVOKER, EXECUTE para authenticated e nada para anon/public", () => {
    const out = sql(`
      select p.prosecdef,
             has_function_privilege('authenticated', p.oid, 'EXECUTE'),
             has_function_privilege('anon', p.oid, 'EXECUTE'),
             coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)
        from pg_proc p
       where p.oid = '${ASSINATURA}'::regprocedure;`);
    expect(out).toBe("f|t|f|f");
  });

  it("uma assinatura só (a de 9 parâmetros caiu: a chamada por nome não fica ambígua)", () => {
    const out = sql(`select count(*) from pg_proc where proname = 'fn_contagens_da_caixa' and pronamespace = 'public'::regnamespace;`);
    expect(out).toBe("1");
  });
});

describe("9049: o badge conta o MESMO que a lista", () => {
  it(`por ator (${ATORES.length}), organização (A e B) e filtro (${FILTROS.length})`, () => {
    expect(prova(PROVA)).toContain("provado");
  });

  it("âncoras escritas à mão: isolamento e escopo do agent", () => {
    expect(
      prova(`${como(MGR_A)}
${espera("mgr_a A instagram", badge(ORG_A, "instagram", null), "'2'")}
${espera("mgr_a A whatsapp grupos", badge(ORG_A, "whatsapp", true), "'1'")}
${espera("mgr_a A sem grupos", badge(ORG_A, null, false), "'4'")}
${espera("mgr_a B instagram (outra organização)", badge(ORG_B, "instagram", null), "'0'")}
${como(AG_A)}
${espera("ag_a A instagram (modo own)", badge(ORG_A, "instagram", null), "'1'")}
${espera("ag_a A whatsapp (modo own)", badge(ORG_A, "whatsapp", null), "'0'")}
${como(MGR_B)}
${espera("mgr_b A instagram (outra organização)", badge(ORG_A, "instagram", null), "'0'")}
${como(null)}
${espera("sem jwt", badge(ORG_A, null, null), "'0'")}`),
    ).toContain("provado");
  });
});

describe("9049: controle negativo (o instrumento pega mutante)", () => {
  const def = () => sql(`select pg_get_functiondef('${ASSINATURA}'::regprocedure);`);

  it("sem o predicado do tipo de canal: reprova", () => {
    const original = def();
    const mutante = original.replace("(p_canal_tipo is null or c.channel = p_canal_tipo)", "true");
    expect(mutante).not.toBe(original);
    // O psql para no PRIMEIRO `espera` que falha, e a prova começa pelo manager de A
    // com WhatsApp: sem o predicado, o badge conta as 5 de A e a lista, as 2 do WhatsApp.
    expect(() => prova(`reset role;\n${mutante};\n${PROVA}`)).toThrow(/mgr_a\/A\/whatsapp\/-: deu 5, esperado 2/);
  });

  it("SECURITY DEFINER (pula a RLS de quem chama): reprova", () => {
    const original = def();
    const mutante = original.replace("\nAS $function$", "\n SECURITY DEFINER\nAS $function$");
    expect(mutante).not.toBe(original);
    // Sem a RLS de quem chama, o manager de A passa a contar a conversa de Instagram de B.
    expect(() => prova(`reset role;\n${mutante};\n${PROVA}`)).toThrow(/mgr_a\/B\/instagram\/-: deu 1, esperado 0/);
  });
});
