import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9029: `fn_contagens_da_caixa` devolve, numa varredura, as seis
 * contagens que a rota `/api/v1/conversations/counts` fazia com seis `count(*)`.
 *
 * A promessa é "os mesmos números": para cada ator e cada combinação de filtro,
 * o JSON da função tem de ser IGUAL às seis consultas antigas, escritas aqui como
 * a PostgREST as executava (a mesma tabela, com a RLS de quem chama, e os mesmos
 * predicados: `.eq`, `.in`, `.not(... in ...)`, `.gt`, e o `or=` das etiquetas
 * com `cs` → `@>` e `ov` → `&&`).
 *
 * Controle negativo: uma versão da função sem o filtro de organização, e outra
 * SECURITY DEFINER (que pula a RLS), têm de dar número diferente para alguém.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `92900000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MGR_A = id(11);
const AG_OWN = id(12); // agent de A; A em modo own
const VW_A = id(13);
const REV = id(14); // agent de A revogado, agent ativo em B
const MIX = id(15); // agent em A + manager em B
const PA = id(16); // platform admin sem vínculo
const OUT = id(17); // sem vínculo
const AG_B = id(18); // agent de B (modo padrão)
const SA1 = id(21);
const SA2 = id(22);
const SB = id(23);

/** Conversas: [n, org, sessão, status, dono, tags, não lidas, entrada, grupo]. */
const CONVERSAS: Array<[number, string, string, string, string | null, string[], number, string | null, boolean]> = [
  [31, ORG_A, SA1, "open", null, ["vip"], 2, null, false],
  [32, ORG_A, SA1, "claimed", AG_OWN, ["vip", "orc"], 0, null, false],
  [33, ORG_A, SA2, "claimed", MIX, ["orc"], 1, "comentario", false],
  [34, ORG_A, SA2, "closed", AG_OWN, [], 0, "direct", false],
  [35, ORG_A, SA1, "archived", null, ["vip"], 0, null, false],
  [36, ORG_A, SA1, "pending", REV, [], 3, "comentario", false],
  [37, ORG_A, SA2, "open", null, [], 0, null, true],
  [38, ORG_A, SA1, "open", null, [], 1, null, false],
  [41, ORG_B, SB, "open", null, ["vip"], 1, null, false],
  [42, ORG_B, SB, "claimed", MIX, ["vip", "orc"], 0, "comentario", false],
  [43, ORG_B, SB, "closed", null, [], 0, null, false],
];

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
const arr = (xs: string[]) => `array[${xs.map(lit).join(",")}]::text[]`;

const seed = `
begin;
insert into auth.users(id,email) values
 ('${MGR_A}','c9029-mgr@invariant.test'),('${AG_OWN}','c9029-own@invariant.test'),('${VW_A}','c9029-vw@invariant.test'),
 ('${REV}','c9029-rev@invariant.test'),('${MIX}','c9029-mix@invariant.test'),('${PA}','c9029-pa@invariant.test'),
 ('${OUT}','c9029-out@invariant.test'),('${AG_B}','c9029-agb@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','c9029-a','C9029 A','C9029 A'),('${ORG_B}','c9029-b','C9029 B','C9029 B');
update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"own"}' where id = '${ORG_A}';
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MGR_A}','manager',now()),('${ORG_A}','${AG_OWN}','agent',now()),('${ORG_A}','${VW_A}','viewer',now()),
 ('${ORG_A}','${REV}','agent',now()),('${ORG_B}','${REV}','agent',now()),
 ('${ORG_A}','${MIX}','agent',now()),('${ORG_B}','${MIX}','manager',now()),('${ORG_B}','${AG_B}','agent',now());
insert into platform_admins(user_id,granted_by,scope,mfa_required,reason) values('${PA}','${PA}','full',false,'Local test');
insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SA1}','${ORG_A}','c9029-a1','\\x00'::bytea),('${SA2}','${ORG_A}','c9029-a2','\\x00'::bytea),('${SB}','${ORG_B}','c9029-b','\\x00'::bytea);
insert into contacts(id,organization_id,display_name,tags,force_human) values
${CONVERSAS.map(([n, org]) => ` ('${id(n + 100)}','${org}','C9029 ${n}',${n === 38 ? "array['orc']" : "'{}'"}::text[],${n === 31})`).join(",\n")};
insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id,tags,unread_count_for_assignee,instagram_entrada,is_group) values
${CONVERSAS.map(([n, org, sess, , dono, tags, naoLidas, entrada, grupo]) => ` ('${id(n)}','${org}','${id(n + 100)}','${sess}','open',${dono ? `'${dono}'` : "null"},${arr(tags)},${naoLidas},${entrada ? lit(entrada) : "null"},${grupo})`).join(",\n")};
${CONVERSAS.filter(([, , , st]) => st !== "open").map(([n, , , st]) => `update conversations set status = '${st}' where id = '${id(n)}';`).join("\n")}
update user_organizations set revoked_at = now() where organization_id = '${ORG_A}' and user_id = '${REV}';
`;

type Filtro = { canal?: string; entrada?: string; naoLidas?: boolean; marcadores?: string[]; modo?: "e" | "ou"; fila: string[] };

const FILTROS: Filtro[] = [
  { fila: ["aguardando"] },
  { fila: ["aguardando", "automatico"] },
  { fila: ["aguardando"], canal: SA1 },
  { fila: ["aguardando"], entrada: "comentario" },
  { fila: ["aguardando"], naoLidas: true },
  { fila: ["aguardando"], marcadores: ["vip"] },
  { fila: ["aguardando"], marcadores: ["orc"] },
  { fila: ["aguardando"], marcadores: ["vip", "orc"], modo: "e" },
  { fila: ["aguardando"], marcadores: ["vip", "orc"], modo: "ou" },
  { fila: ["aguardando", "automatico"], canal: SA2, naoLidas: true, marcadores: ["orc"] },
];

const TERMINAIS = ["closed", "archived"];

/** As seis consultas antigas (como a PostgREST as montava) e a função, para a org pedida. */
function compara(org: string, f: Filtro, rotulo: string) {
  const onde = [
    `c.organization_id = '${org}'`,
    f.canal ? `c.channel_session_id = '${f.canal}'` : null,
    f.entrada ? `c.instagram_entrada = ${lit(f.entrada)}` : null,
    f.naoLidas ? `c.unread_count_for_assignee > 0` : null,
    f.marcadores?.length
      ? f.marcadores.length > 1 && f.modo === "ou"
        ? `(c.tags && ${arr(f.marcadores)} or public.tags_do_contato(c) && ${arr(f.marcadores)})`
        : `(c.tags @> ${arr(f.marcadores)} or public.tags_do_contato(c) @> ${arr(f.marcadores)})`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const conta = (extra: string) => `(select count(*) from public.conversations c where ${onde}${extra ? ` and ${extra}` : ""})`;
  const antigo = `jsonb_build_object(
    'fila', ${conta(`public.comando_da_conversa(c) = any (${arr(f.fila)})`)},
    'automatico', ${conta(`public.comando_da_conversa(c) = 'automatico'`)},
    'mine', ${conta(`c.assigned_to_user_id = auth.uid() and not (c.status in (${TERMINAIS.map(lit).join(",")}))`)},
    'all', ${conta("")},
    'closed', ${conta(`c.status = 'closed'`)},
    'archived', ${conta(`c.status = 'archived'`)})`;
  const novo = `public.fn_contagens_da_caixa('${org}', ${arr(f.fila)}, ${arr(TERMINAIS)}, ${f.canal ? `'${f.canal}'` : "null"}, ${
    f.entrada ? lit(f.entrada) : "null"
  }, ${f.naoLidas ? "true" : "false"}, ${f.marcadores ? arr(f.marcadores) : "null"}, ${lit(f.modo ?? "e")})`;
  return `
do $t$ declare a jsonb; n jsonb; begin
  a := ${antigo};
  n := ${novo};
  if a is distinct from n then raise exception '%: função % <> consultas antigas %', ${lit(rotulo)}, n, a; end if;
end $t$;`;
}

const como = (user: string | null) =>
  `reset role; select set_config('request.jwt.claims', ${
    user ? lit(JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" })) : "''"
  }, true); set local role authenticated;`;

const ATORES: Array<[string, string | null]> = [
  ["mgr_a", MGR_A], ["ag_own", AG_OWN], ["vw_a", VW_A], ["rev", REV], ["mix", MIX],
  ["pa", PA], ["out", OUT], ["ag_b", AG_B], ["sem_jwt", null],
];

/** As comparações de uma lista de atores, nas duas organizações. */
const comparacoes = (atores: Array<[string, string | null]>) =>
  atores
    .flatMap(([nome, user]) =>
      [ORG_A, ORG_B].flatMap((org) =>
        FILTROS.map((f, i) => `${como(user)}\n${compara(org, f, `${nome} / ${org === ORG_A ? "A" : "B"} / filtro ${i}`)}`),
      ),
    )
    .join("\n");
const TODAS = comparacoes(ATORES);

/** O JSON que a função devolve, para as âncoras escritas à mão. */
function contagem(user: string | null, org: string): Record<string, number> {
  const out = sql(`${seed}
${como(user)}
select public.fn_contagens_da_caixa('${org}', array['aguardando'], ${arr(TERMINAIS)})::text;
reset role;
rollback;`);
  const linha = out.split("\n").map((l) => l.trim()).find((l) => l.startsWith('{"all"'));
  return JSON.parse(linha ?? "{}") as Record<string, number>;
}

function prova(corpo: string): string {
  return sql(`${seed}\n${corpo}\nreset role;\nrollback;\nselect 'provado';`);
}

describe("9029: forma e permissões", () => {
  it("SECURITY INVOKER, EXECUTE para authenticated e nada para anon/public", () => {
    const out = sql(`
      select p.prosecdef,
             has_function_privilege('authenticated', p.oid, 'EXECUTE'),
             has_function_privilege('anon', p.oid, 'EXECUTE'),
             coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)
        from pg_proc p
       where p.oid = 'public.fn_contagens_da_caixa(uuid,text[],text[],uuid,text,boolean,text[],text,boolean)'::regprocedure;`);
    expect(out).toBe("f|t|f|f");
  });
});

describe("9029: os mesmos números das seis consultas antigas", () => {
  it(`por ator (${ATORES.length}), organização (A e B) e filtro (${FILTROS.length})`, () => {
    expect(prova(TODAS)).toContain("provado");
  });

  it("âncoras escritas à mão: isolamento, escopo do agent, revogado", () => {
    // manager de A: as 8 de A, nenhuma de B
    expect(contagem(MGR_A, ORG_A)).toMatchObject({ all: 8, closed: 1, archived: 1 });
    expect(contagem(MGR_A, ORG_B)).toMatchObject({ all: 0 });
    // agent de A em modo own: só as dele (32 e 34), "minhas" sem a encerrada
    expect(contagem(AG_OWN, ORG_A)).toMatchObject({ all: 2, mine: 1, closed: 1 });
    // revogado de A não vê nada de A, mesmo com a 36 ainda atribuída a ele
    expect(contagem(REV, ORG_A)).toMatchObject({ all: 0, mine: 0 });
    // misto: agent own em A (só a 33), manager em B (as 3)
    expect(contagem(MIX, ORG_A)).toMatchObject({ all: 1, mine: 1 });
    expect(contagem(MIX, ORG_B)).toMatchObject({ all: 3, mine: 1 });
    // sem vínculo e sem JWT: zero
    expect(contagem(OUT, ORG_A)).toMatchObject({ all: 0 });
    expect(contagem(null, ORG_A)).toMatchObject({ all: 0 });
  });
});

describe("9029: controle negativo (o instrumento pega mutante)", () => {
  const corpoDaFuncao = () =>
    sql(`select pg_get_functiondef('public.fn_contagens_da_caixa(uuid,text[],text[],uuid,text,boolean,text[],text,boolean)'::regprocedure);`);

  it("sem o filtro de organização: reprova", () => {
    const def = corpoDaFuncao();
    const mutante = def.replace("where c.organization_id = p_organizacao", "where c.organization_id is not null");
    expect(mutante).not.toBe(def);
    // Só o manager de A: na org B ele tem de contar zero, e o mutante conta as de A.
    expect(() => prova(`reset role;\n${mutante};\n${comparacoes([["mgr_a", MGR_A]])}`)).toThrow(
      /mgr_a \/ B .* <> consultas antigas/,
    );
  });

  it("SECURITY DEFINER (pula a RLS de quem chama): reprova", () => {
    const def = corpoDaFuncao();
    const mutante = def.replace("\nAS $function$", "\n SECURITY DEFINER\nAS $function$");
    expect(mutante).not.toBe(def);
    // O agent em modo own passaria a contar a org inteira.
    expect(() => prova(`reset role;\n${mutante};\n${comparacoes([["ag_own", AG_OWN]])}`)).toThrow(
      /ag_own \/ A .* <> consultas antigas/,
    );
  });
});
