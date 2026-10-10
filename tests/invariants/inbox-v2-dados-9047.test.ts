import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * Migration 9047: os dados do visual v2 da Inbox (fase 8a).
 *
 *   - `fn_tarefas_atrasadas(org)`: tarefas abertas vencidas COM quem chama;
 *   - `fn_leads_abertos_por_funil(org)`: leads `open` por funil, pela RLS;
 *   - `passo_da_conversa(c)` e `autor_da_ultima_mensagem(c)`: campos calculados
 *     da lista;
 *   - `fn_contagens_da_caixa(..., p_sem_passo)`: o badge conta o MESMO filtro
 *     que a lista aplica (`passo_da_conversa = 'sem_passo'`).
 *
 * O que se prova, por ator: isolamento por organização (ninguém conta o que é
 * de outra organização, nem passando o id dela), o escopo do `agent` em modo
 * `own` (conta só o que o quadro mostra a ele) e a ausência de vínculo dando
 * zero. Controle negativo: sem o filtro de organização, e com SECURITY DEFINER,
 * os números mudam para alguém.
 *
 * Zero PII: e-mails @invariant.test e nomes sintéticos.
 */

const id = (n: number) => `90470000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ORG_A = id(1);
const ORG_B = id(2);
const MGR_A = id(11);
const AG_A = id(12); // agent de A; A em modo own
const MIX = id(13); // agent em A + manager em B
const MGR_B = id(14);
const OUT = id(15); // sem vínculo

const PA1 = id(21);
const PA2 = id(22);
const PB1 = id(23);
const SA1 = id(31);
const SA2 = id(32);
const SB1 = id(33);
const SESS_A = id(41);
const SESS_B = id(42);
const KA = (n: number) => id(100 + n); // contatos de A
const KB1 = id(150);
const CV = (n: number) => id(200 + n); // conversas de A

const seed = `
begin;
insert into auth.users(id,email) values
 ('${MGR_A}','d9047-mgra@invariant.test'),('${AG_A}','d9047-aga@invariant.test'),('${MIX}','d9047-mix@invariant.test'),
 ('${MGR_B}','d9047-mgrb@invariant.test'),('${OUT}','d9047-out@invariant.test');
insert into organizations(id,slug,display_name,legal_name) values
 ('${ORG_A}','d9047-a','D9047 A','D9047 A'),('${ORG_B}','d9047-b','D9047 B','D9047 B');
update organizations set settings = coalesce(settings,'{}'::jsonb) || '{"visibility_mode":"own"}' where id = '${ORG_A}';
insert into user_organizations(organization_id,user_id,role,accepted_at) values
 ('${ORG_A}','${MGR_A}','manager',now()),('${ORG_A}','${AG_A}','agent',now()),
 ('${ORG_A}','${MIX}','agent',now()),('${ORG_B}','${MIX}','manager',now()),('${ORG_B}','${MGR_B}','manager',now());

insert into crm_pipelines(id,organization_id,name,slug) values
 ('${PA1}','${ORG_A}','Funil A1','d9047-a1'),('${PA2}','${ORG_A}','Funil A2','d9047-a2'),('${PB1}','${ORG_B}','Funil B1','d9047-b1');
insert into crm_stages(id,organization_id,pipeline_id,name,slug,position) values
 ('${SA1}','${ORG_A}','${PA1}','Etapa','etapa',1000),('${SA2}','${ORG_A}','${PA2}','Etapa','etapa',1000),
 ('${SB1}','${ORG_B}','${PB1}','Etapa','etapa',1000);
insert into crm_leads(organization_id,pipeline_id,stage_id,title,status,owner_user_id,closed_at) values
 ('${ORG_A}','${PA1}','${SA1}','L1','open','${AG_A}',null),
 ('${ORG_A}','${PA1}','${SA1}','L2','open','${MGR_A}',null),
 ('${ORG_A}','${PA1}','${SA1}','L3','open',null,null),
 ('${ORG_A}','${PA1}','${SA1}','L4','won','${AG_A}',now()),
 ('${ORG_A}','${PA2}','${SA2}','L5','open','${AG_A}',null),
 ('${ORG_B}','${PB1}','${SB1}','L6','open',null,null),
 ('${ORG_B}','${PB1}','${SB1}','L7','open','${MGR_B}',null);

insert into contacts(id,organization_id,display_name) values
 ('${KA(1)}','${ORG_A}','D9047 K1'),('${KA(2)}','${ORG_A}','D9047 K2'),('${KA(3)}','${ORG_A}','D9047 K3'),
 ('${KA(4)}','${ORG_A}','D9047 K4'),('${KA(5)}','${ORG_A}','D9047 K5'),('${KB1}','${ORG_B}','D9047 KB');

-- Tarefas. A: T1 e T2 vencidas e abertas com AG_A (contam 2), T3 futura, T4
-- vencida mas feita, T5 vencida com MGR_A, T6 sem prazo. B: T7 vencida com MIX,
-- T8 vencida com AG_A (que NÃO é de B: a RLS a esconde dele).
insert into crm_tasks(organization_id,title,status,due_date,assigned_to,contact_id) values
 ('${ORG_A}','T1','pending',     now() - interval '2 hours','${AG_A}','${KA(1)}'),
 ('${ORG_A}','T2','in_progress', now() - interval '1 day',  '${AG_A}','${KA(2)}'),
 ('${ORG_A}','T3','pending',     now() + interval '1 day',  '${AG_A}','${KA(3)}'),
 ('${ORG_A}','T4','done',        now() - interval '1 day',  '${AG_A}','${KA(4)}'),
 ('${ORG_A}','T5','pending',     now() - interval '1 hour', '${MGR_A}',null),
 ('${ORG_A}','T6','pending',     null,                      '${AG_A}',null),
 ('${ORG_B}','T7','pending',     now() - interval '1 hour', '${MIX}','${KB1}'),
 ('${ORG_B}','T8','pending',     now() - interval '1 hour', '${AG_A}','${KB1}');

insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values
 ('${SESS_A}','${ORG_A}','d9047-a','\\x00'::bytea),('${SESS_B}','${ORG_B}','d9047-b','\\x00'::bytea);
-- Conversas de A, todas do manager (o agent em modo own não as vê).
-- CV1: K1, tarefa vencida -> atrasada. CV2: K3, tarefa futura -> em_dia.
-- CV3: K4 (só tarefa feita) -> sem_passo. CV4: K5 fechada -> nulo. CV5: K4 em grupo -> nulo.
insert into conversations(id,organization_id,contact_id,channel_session_id,status,assigned_to_user_id,is_group) values
 ('${CV(1)}','${ORG_A}','${KA(1)}','${SESS_A}','open','${MGR_A}',false),
 ('${CV(2)}','${ORG_A}','${KA(3)}','${SESS_A}','open','${MGR_A}',false),
 ('${CV(3)}','${ORG_A}','${KA(4)}','${SESS_A}','open','${MGR_A}',false),
 ('${CV(4)}','${ORG_A}','${KA(5)}','${SESS_A}','open','${MGR_A}',false),
 ('${CV(5)}','${ORG_A}','${KA(4)}','${SESS_A}','open','${MGR_A}',true);
update conversations set status = 'closed' where id = '${CV(4)}';

-- Mensagens: CV1 cliente e depois IA (-> ia); CV2 equipe e depois uma REAÇÃO
-- do cliente (reação não conta -> equipe); CV3 só cliente (-> cliente).
insert into messages(organization_id,conversation_id,channel_session_id,contact_id,type,direction,status,body,sent_via,sent_at) values
 ('${ORG_A}','${CV(1)}','${SESS_A}','${KA(1)}','text','inbound','delivered','oi','external_device', now() - interval '3 minutes'),
 ('${ORG_A}','${CV(1)}','${SESS_A}','${KA(1)}','text','outbound','sent','olá','ai', now() - interval '2 minutes'),
 ('${ORG_A}','${CV(2)}','${SESS_A}','${KA(3)}','text','outbound','sent','combinado','crm', now() - interval '2 minutes'),
 ('${ORG_A}','${CV(2)}','${SESS_A}','${KA(3)}','reaction','inbound','delivered','👍','external_device', now() - interval '1 minute'),
 ('${ORG_A}','${CV(3)}','${SESS_A}','${KA(4)}','text','inbound','delivered','quanto custa?','external_device', now() - interval '1 minute');
`;

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

const como = (user: string | null) =>
  `reset role; select set_config('request.jwt.claims', ${
    user ? lit(JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" })) : "''"
  }, true); set local role authenticated;`;

/** Um `do` que reprova com rótulo quando o valor não é o esperado. */
const espera = (rotulo: string, expressao: string, esperado: string) => `
do $t$ declare v text; begin
  v := (${expressao})::text;
  if v is distinct from ${esperado} then raise exception '%: deu %, esperado %', ${lit(rotulo)}, v, ${esperado}; end if;
end $t$;`;

const atrasadas = (org: string) => `select public.fn_tarefas_atrasadas('${org}')`;
const porFunil = (org: string) =>
  `select coalesce(jsonb_object_agg(pipeline_id, abertos order by pipeline_id), '{}'::jsonb) from public.fn_leads_abertos_por_funil('${org}')`;
/** O esperado como jsonb: a comparação é pelo texto CANÔNICO do jsonb, dos dois lados. */
const json = (o: Record<string, number>) => lit(JSON.stringify(o));

/** O que cada ator tem de ver, nas duas organizações. */
const CASOS_DAS_CONTAGENS = [
  // [ator, org, tarefas atrasadas, leads abertos por funil]
  ["mgr_a", MGR_A, ORG_A, 1, { [PA1]: 3, [PA2]: 1 }],
  ["mgr_a", MGR_A, ORG_B, 0, {}],
  ["ag_a", AG_A, ORG_A, 2, { [PA1]: 1, [PA2]: 1 }],
  // AG_A tem T8 em B, mas não é de B: nem a RLS nem o parâmetro a entregam.
  ["ag_a", AG_A, ORG_B, 0, {}],
  ["mix", MIX, ORG_A, 0, {}],
  ["mix", MIX, ORG_B, 1, { [PB1]: 2 }],
  ["mgr_b", MGR_B, ORG_A, 0, {}],
  ["mgr_b", MGR_B, ORG_B, 0, { [PB1]: 2 }],
  ["out", OUT, ORG_A, 0, {}],
  ["sem_jwt", null, ORG_A, 0, {}],
] as const;

const PROVA_DAS_CONTAGENS = CASOS_DAS_CONTAGENS.map(
  ([nome, user, org, tarefas, funis]) => `${como(user)}
${espera(`${nome}/${org === ORG_A ? "A" : "B"}/tarefas`, atrasadas(org), lit(String(tarefas)))}
${espera(`${nome}/${org === ORG_A ? "A" : "B"}/funis`, porFunil(org), `${json(funis as Record<string, number>)}::jsonb::text`)}`,
).join("\n");

function prova(corpo: string): string {
  return sql(`${seed}\n${corpo}\nreset role;\nrollback;\nselect 'provado';`);
}

const FUNCOES = [
  "public.fn_tarefas_atrasadas(uuid)",
  "public.fn_leads_abertos_por_funil(uuid)",
  "public.passo_da_conversa(public.conversations)",
  "public.autor_da_ultima_mensagem(public.conversations)",
  "public.fn_contagens_da_caixa(uuid,text[],text[],uuid,text,boolean,text[],text,boolean)",
];

describe("9047: forma e permissões", () => {
  it.each(FUNCOES)("%s é SECURITY INVOKER, executável por authenticated e não por anon/public", (assinatura) => {
    const out = sql(`
      select p.prosecdef,
             has_function_privilege('authenticated', p.oid, 'EXECUTE'),
             has_function_privilege('anon', p.oid, 'EXECUTE'),
             coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), false)
        from pg_proc p
       where p.oid = '${assinatura}'::regprocedure;`);
    expect(out).toBe("f|t|f|f");
  });

  it("a assinatura antiga de fn_contagens_da_caixa (8 parâmetros) não sobrou: a chamada por nome seria ambígua", () => {
    const out = sql(`select count(*) from pg_proc where proname = 'fn_contagens_da_caixa' and pronamespace = 'public'::regnamespace;`);
    expect(out).toBe("1");
  });

  it("os índices da 9047 existem", () => {
    const out = sql(`
      select count(*) from pg_indexes where schemaname = 'public' and indexname in (
        'crm_tasks_abertas_do_contato_idx', 'crm_tasks_atrasadas_do_responsavel_idx',
        'idx_contacts_display_name_trgm', 'idx_contacts_phone_number_trgm', 'idx_crm_leads_title_trgm');`);
    expect(out).toBe("5");
  });
});

describe("9047: contagens do menu isoladas por organização e por papel", () => {
  it(`tarefas atrasadas e leads abertos, por ator (${CASOS_DAS_CONTAGENS.length} casos)`, () => {
    expect(prova(PROVA_DAS_CONTAGENS)).toContain("provado");
  });
});

describe("9047: campos calculados da lista e o badge do filtro", () => {
  const passo = (n: number) => `select public.passo_da_conversa(c) from public.conversations c where c.id = '${CV(n)}'`;
  const autor = (n: number) => `select public.autor_da_ultima_mensagem(c) from public.conversations c where c.id = '${CV(n)}'`;

  it("próximo passo e autor, como o manager de A", () => {
    expect(
      prova(`${como(MGR_A)}
${espera("passo CV1", passo(1), "'atrasada'")}
${espera("passo CV2", passo(2), "'em_dia'")}
${espera("passo CV3", passo(3), "'sem_passo'")}
${espera("passo CV4 fechada", passo(4), "null")}
${espera("passo CV5 grupo", passo(5), "null")}
${espera("autor CV1", autor(1), "'ia'")}
${espera("autor CV2 (reação não conta)", autor(2), "'equipe'")}
${espera("autor CV3", autor(3), "'cliente'")}
${espera("autor CV4 sem mensagem", autor(4), "null")}`),
    ).toContain("provado");
  });

  it("de outra organização a função não enxerga mensagem nem tarefa de A (INVOKER)", () => {
    // A linha de A passada à mão (como o RPC de um campo calculado permitiria):
    // com a RLS de quem chama, o autor some e a tarefa vencida não aparece.
    expect(
      prova(`reset role;
create temp table linha_9047 (r public.conversations);
insert into linha_9047 select c from public.conversations c where c.id = '${CV(1)}';
grant select on linha_9047 to authenticated;
${como(MGR_B)}
${espera("autor visto de B", "select public.autor_da_ultima_mensagem(l.r) from linha_9047 l", "null")}
${espera("passo visto de B", "select public.passo_da_conversa(l.r) from linha_9047 l", "'sem_passo'")}`),
    ).toContain("provado");
  });

  it("p_sem_passo conta o MESMO que o filtro da lista, por ator", () => {
    const igual = (nome: string, user: string, org: string) => `${como(user)}
${espera(
  `${nome}: badge sem passo`,
  `select (public.fn_contagens_da_caixa('${org}', array['aguardando'], array['closed','archived'], p_sem_passo => true)->>'all')::bigint`,
  `(select count(*) from public.conversations c where c.organization_id = '${org}' and public.passo_da_conversa(c) = 'sem_passo')::text`,
)}`;
    expect(
      prova([igual("mgr_a", MGR_A, ORG_A), igual("ag_a", AG_A, ORG_A), igual("mgr_b", MGR_B, ORG_A), igual("mix", MIX, ORG_B)].join("\n")),
    ).toContain("provado");
    // Âncora: para o manager de A, só a CV3.
    expect(
      prova(`${como(MGR_A)}
${espera("âncora", `select (public.fn_contagens_da_caixa('${ORG_A}', array['aguardando'], array['closed','archived'], p_sem_passo => true)->>'all')`, "'1'")}`),
    ).toContain("provado");
  });
});

describe("9047: controle negativo (o instrumento pega mutante)", () => {
  const def = (assinatura: string) => sql(`select pg_get_functiondef('${assinatura}'::regprocedure);`);

  it("tarefas sem o filtro de organização: reprova", () => {
    const original = def("public.fn_tarefas_atrasadas(uuid)");
    const mutante = original.replace("t.organization_id = p_organizacao", "t.organization_id is not null");
    expect(mutante).not.toBe(original);
    // AG_A pedindo B: o mutante conta as tarefas dele em A.
    expect(() => prova(`reset role;\n${mutante};\n${PROVA_DAS_CONTAGENS}`)).toThrow(/\/tarefas: deu/);
  });

  it("leads por funil como SECURITY DEFINER (pula a RLS de quem chama): reprova", () => {
    const original = def("public.fn_leads_abertos_por_funil(uuid)");
    const mutante = original.replace("\nAS $function$", "\n SECURITY DEFINER\nAS $function$");
    expect(mutante).not.toBe(original);
    // Sem a RLS, quem não é de B conta os leads de B (e o agent own, o funil inteiro).
    expect(() => prova(`reset role;\n${mutante};\n${PROVA_DAS_CONTAGENS}`)).toThrow(/\/funis: deu/);
  });
});
