/**
 * CURADORIA DE ETIQUETAS (migration 9005) — quem pode chamar cada uma das cinco.
 *
 * As cinco escritas (`fn_tags_criar`, `fn_tags_arquivar`, `fn_tags_renomear`,
 * `fn_tags_mesclar`, `fn_tags_apagar`) são executáveis por `authenticated` DE
 * PROPÓSITO: a server action chama pela sessão de quem clicou, e é a própria
 * função que decide — `fn_tags_guarda` confere papel mínimo, suporte de escrita
 * e MFA antes de qualquer `update`.
 *
 * ## Por que este arquivo existe
 *
 * `hardening-definer-varredura.test.ts` aceita essas cinco como exceção em
 * `AUTHENTICATED_PERMITIDO`, e uma exceção lá é uma AFIRMAÇÃO sobre
 * comportamento: "a função recusa sozinha". A varredura, porém, só lê catálogo —
 * ela sabe QUEM tem EXECUTE, nunca o que a função faz com quem executou. Toda
 * entrada comparável daquela lista cita um invariante que fecha esse vão; estas
 * cinco entraram citando nada, e uma razão que ninguém mede é uma razão
 * confiada. Este arquivo é a medida que faltava.
 *
 * ## O que ele NÃO cobre
 *
 * Efeito das operações (renomear atravessa registros? mesclar deduplica?) é de
 * `tags-vocabulario.test.ts` e `tags-cor-de-etiqueta.test.ts`, sobre a outra
 * função de vocabulário. Aqui a pergunta é só uma: a recusa acontece, e ela
 * acontece ANTES da escrita.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 5,
});

type Papel = "viewer" | "agent" | "manager" | "admin";
const PAPEIS: readonly Papel[] = ["viewer", "agent", "manager", "admin"];

/** Duas organizações completas: a de casa e a vizinha, que serve de atacante. */
const casa = { org: randomUUID(), viewer: "", agent: "", manager: "", admin: "" };
const vizinha = { org: randomUUID(), viewer: "", agent: "", manager: "", admin: "" };
for (const tenant of [casa, vizinha]) {
  for (const papel of PAPEIS) tenant[papel] = randomUUID();
}

/**
 * As cinco, com o piso que a migration declarou e uma chamada COMPLETA de cada.
 *
 * A chamada precisa ser válida até o fim: se um argumento estivesse errado, a
 * função morreria em `tags_escopo_invalido` ANTES da guarda e o teste ficaria
 * verde afirmando uma recusa de papel que nunca aconteceu.
 *
 * Escopo `conversa` de propósito — `contato` passaria por `fn_tags_reserva`, que
 * tem regra própria sobre a etiqueta `cliente` e nada tem a ver com papel.
 */
interface Escrita {
  readonly nome: string;
  readonly piso: "manager" | "admin";
  readonly sql: string;
  readonly valores: (org: string, etiqueta: string) => unknown[];
}

const ESCRITAS: readonly Escrita[] = [
  {
    nome: "fn_tags_criar",
    piso: "manager",
    sql: "select public.fn_tags_criar($1,'conversa',$2) as r",
    valores: (org, etiqueta) => [org, etiqueta],
  },
  {
    nome: "fn_tags_arquivar",
    piso: "manager",
    sql: "select public.fn_tags_arquivar($1,'conversa',$2,true) as r",
    valores: (org, etiqueta) => [org, etiqueta],
  },
  {
    nome: "fn_tags_renomear",
    piso: "admin",
    sql: "select public.fn_tags_renomear($1,'conversa',$2,$3) as r",
    valores: (org, etiqueta) => [org, etiqueta, `${etiqueta}-b`],
  },
  {
    nome: "fn_tags_mesclar",
    piso: "admin",
    sql: "select public.fn_tags_mesclar($1,'conversa',array[$2::text],$3) as r",
    valores: (org, etiqueta) => [org, etiqueta, `${etiqueta}-d`],
  },
  {
    nome: "fn_tags_apagar",
    piso: "admin",
    sql: "select public.fn_tags_apagar($1,'conversa',$2) as r",
    valores: (org, etiqueta) => [org, etiqueta],
  },
];

/** As três internas: existem para as cinco, e para mais ninguém. */
const INTERNAS = [
  "public.fn_tags_guarda(uuid,text)",
  "public.fn_tags_chave(text,boolean)",
  "public.fn_tags_reserva(uuid,text,text[])",
] as const;

/**
 * Roda com a identidade de quem chama: papel de sessão + claims do JWT, que é o
 * caminho que o PostgREST usa. Como as cinco são `security definer`, medir como
 * `postgres` não provaria nada sobre papel — é justamente o superusuário que a
 * definer imita.
 */
async function chamar(
  role: "anon" | "authenticated" | "service_role",
  user: string | null,
  sql: string,
  valores: unknown[] = [],
  aal = "aal2",
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role, aal, ...(user ? { sub: user } : {}) }),
    ]);
    const resultado = await client.query(sql, valores);
    await client.query("commit");
    return resultado;
  } catch (erro) {
    await client.query("rollback");
    throw erro;
  } finally {
    client.release();
  }
}

/** O vocabulário canônico de conversa da organização, direto do settings. */
async function vocabulario(org: string): Promise<string[]> {
  const { rows } = await pool.query(
    "select coalesce(settings->'canonical_conversation_tags','[]'::jsonb) as v from organizations where id=$1",
    [org],
  );
  return (rows[0]?.v ?? []) as string[];
}

beforeAll(async () => {
  for (const tenant of [casa, vizinha]) {
    await pool.query(
      "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'ACL curadoria','ACL curadoria')",
      [tenant.org],
    );
    for (const papel of PAPEIS) {
      const user = tenant[papel];
      await pool.query("insert into auth.users(id,email) values($1,$2)", [
        user,
        `${user}@invariant.test`,
      ]);
      await pool.query(
        "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())",
        [user, tenant.org, papel],
      );
    }
  }
});

afterAll(() => pool.end());

describe("9005 — curadoria de etiquetas: quem pode chamar", () => {
  it.each(ESCRITAS)("viewer e agent são recusados em $nome", async (escrita) => {
    for (const papel of ["viewer", "agent"] as const) {
      await expect(
        chamar("authenticated", casa[papel], escrita.sql, escrita.valores(casa.org, "acl-piso")),
      ).rejects.toThrow(/tags_forbidden/);
    }
  });

  it.each(ESCRITAS.filter((e) => e.piso === "admin"))(
    "manager é recusado em $nome (piso admin)",
    async (escrita) => {
      // As três destrutivas reescrevem `tags` em massa e não têm desfazer — por
      // isso o piso delas é admin e não manager, e a diferença tem de ser
      // MEDIDA: um `fn_tags_guarda(p_org, 'manager')` copiado por engano numa
      // delas passaria despercebido pela varredura de catálogo.
      await expect(
        chamar(
          "authenticated",
          casa.manager,
          escrita.sql,
          escrita.valores(casa.org, "acl-destrutiva"),
        ),
      ).rejects.toThrow(/tags_forbidden/);
    },
  );

  it("manager cria e arquiva na própria organização (controle positivo do piso)", async () => {
    // Sem este caso, uma guarda que recusasse SEMPRE deixaria os dois casos
    // acima verdes pelo motivo errado.
    const criar = await chamar(
      "authenticated",
      casa.manager,
      "select public.fn_tags_criar($1,'conversa','acl-manager') as r",
      [casa.org],
    );
    expect(criar.rows[0].r).toEqual({ mudou: true, motivo: "criada" });
    expect(await vocabulario(casa.org)).toContain("acl-manager");

    const arquivar = await chamar(
      "authenticated",
      casa.manager,
      "select public.fn_tags_arquivar($1,'conversa','acl-manager',true) as r",
      [casa.org],
    );
    expect(arquivar.rows[0].r).toEqual({ mudou: true, arquivada: true });
    expect(await vocabulario(casa.org)).not.toContain("acl-manager");
  });

  it.each(ESCRITAS)("admin da própria organização é aceito em $nome", async (escrita) => {
    const etiqueta = `acl-admin-${escrita.nome.replace("fn_tags_", "")}`;
    const r = await chamar(
      "authenticated",
      casa.admin,
      escrita.sql,
      escrita.valores(casa.org, etiqueta),
    );
    expect((r.rows[0].r as { mudou: boolean }).mudou).toBe(true);
  });

  it.each(ESCRITAS)(
    "admin de OUTRA organização é recusado em $nome, e o vocabulário de casa não muda",
    async (escrita) => {
      // O caso que mais importa: `p_org` é ARGUMENTO, e numa `security definer`
      // rodando como dono do schema a RLS de `organizations` não intervém. Se a
      // guarda não conferisse membership, qualquer pessoa logada em qualquer
      // tenant reescreveria o vocabulário de qualquer outro — sem RLS nenhuma
      // para segurar, porque a definer já passou por ela.
      const antes = await vocabulario(casa.org);
      await expect(
        chamar(
          "authenticated",
          vizinha.admin,
          escrita.sql,
          escrita.valores(casa.org, "acl-invasao"),
        ),
      ).rejects.toThrow(/tags_forbidden/);
      expect(await vocabulario(casa.org)).toEqual(antes);
    },
  );

  it.each(ESCRITAS)("service_role é recusado em $nome (auth.uid() nulo)", async (escrita) => {
    // É POR ISTO que as cinco puderam ficar executáveis por `authenticated` em
    // vez de serem revogadas e chamadas pela service key: sem JWT, a primeira
    // linha de `fn_tags_guarda` já recusa. Quem trocasse a server action para
    // `createClient` de serviço descobriria aqui, e não em produção.
    await expect(
      chamar("service_role", null, escrita.sql, escrita.valores(casa.org, "acl-servico")),
    ).rejects.toThrow(/tags_forbidden/);
  });

  it.each(ESCRITAS)("anon não tem EXECUTE em $nome", async (escrita) => {
    await expect(
      chamar("anon", null, escrita.sql, escrita.valores(casa.org, "acl-anon")),
    ).rejects.toThrow(/permission denied for function/);
  });

  it("admin com fator TOTP verificado precisa de aal2 — aal1 é recusada", async () => {
    // `fn_session_mfa_proven` exige aal2 só de quem tem fator verificado; quem
    // nunca cadastrou MFA passa em aal1, e é a regra do produto inteiro. Sem o
    // fator, este caso mediria o vazio.
    const fator = randomUUID();
    await pool.query(
      "insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')",
      [fator, casa.admin],
    );
    try {
      await expect(
        chamar(
          "authenticated",
          casa.admin,
          "select public.fn_tags_criar($1,'conversa','acl-mfa') as r",
          [casa.org],
          "aal1",
        ),
      ).rejects.toThrow(/tags_mfa_required/);
      expect(await vocabulario(casa.org)).not.toContain("acl-mfa");

      // Controle: a MESMA pessoa, na MESMA função, em aal2 passa.
      await chamar(
        "authenticated",
        casa.admin,
        "select public.fn_tags_criar($1,'conversa','acl-mfa') as r",
        [casa.org],
        "aal2",
      );
      expect(await vocabulario(casa.org)).toContain("acl-mfa");
    } finally {
      await pool.query("delete from auth.mfa_factors where id=$1", [fator]);
    }
  });

  it.each(INTERNAS)("a interna %s não é executável por authenticated nem por anon", async (fn) => {
    const { rows } = await pool.query(
      "select has_function_privilege('authenticated',$1,'execute') as auth, has_function_privilege('anon',$1,'execute') as anon",
      [fn],
    );
    expect(rows[0]).toEqual({ auth: false, anon: false });
  });

  it("a guarda não é alcançável pela sessão — nem para ser sondada", async () => {
    // O catálogo acima diz o grant; isto diz o comportamento. Importa porque a
    // guarda é o ÚNICO lugar onde a decisão mora: exposta, um chamador poderia
    // perguntar "sou admin da org X?" sobre qualquer organização da instalação e
    // enumerar membership alheia sem tocar em tabela nenhuma.
    await expect(
      chamar("authenticated", casa.admin, "select public.fn_tags_guarda($1,'manager')", [casa.org]),
    ).rejects.toThrow(/permission denied for function/);
  });
});
