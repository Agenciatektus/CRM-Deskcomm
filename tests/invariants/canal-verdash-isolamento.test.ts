import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * UMA INSTÂNCIA DA VERDASH PERTENCE A UMA ORGANIZAÇÃO — E ISSO SE MEDE.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * O provider `verdash` foi escrito inteiro (cerca de 4.000 linhas) sem nenhum
 * invariante próprio. Os canais que vieram antes têm os seus; este entrou em
 * produção com dois clientes reais na mesma instalação e nada que provasse a
 * propriedade que o sustenta.
 *
 * A propriedade é esta: `verdash_instance_name` é o endereço no FZAP, e é por
 * ele que mensagem sai e webhook chega. Se duas organizações do mesmo CRM
 * apontarem para a mesma instância, as conversas de uma aparecem na caixa da
 * outra — sem bug de código, sem RLS furada, só por duas linhas coerentes
 * apontando para o mesmo lugar. Nenhuma policy pega isso, porque cada linha
 * está corretamente na sua org. Quem pega é o índice único.
 *
 * ═══ POR QUE NÃO BASTA O ÍNDICE EXISTIR ═══
 *
 * Ele é PARCIAL (`where provider = 'verdash' and archived_at is null`), e índice
 * parcial tem duas formas de estar errado que se parecem com estar certo:
 * amplo demais (impede reconectar o número depois de arquivar, que é um fluxo
 * legítimo e frequente) ou estreito demais (deixa passar o caso que ele existe
 * para barrar). Este arquivo mede os dois lados.
 *
 * E ele JÁ ESTEVE QUEBRADO de um jeito que só um teste de instalação pegaria:
 * o bloco estava no apêndice errado do `baseline.sql` e referenciava
 * `archived_at` antes de a coluna nascer, então toda instalação nova morria —
 * enquanto produção, que chegou por migrations incrementais, seguia verde. Ver
 * a nota no fim do baseline.
 */
const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 3,
});

/** A organização que conectou a instância primeiro. */
const ORG_A = "ced45a00-0000-4000-8000-00000000000a";
/** A vizinha, que tentaria reivindicar a mesma. */
const ORG_B = "ced45a00-0000-4000-8000-00000000000b";

const SESSAO_A = "ced45a00-0000-4000-8000-0000000000a1";
const SESSAO_B = "ced45a00-0000-4000-8000-0000000000b1";
const SESSAO_A2 = "ced45a00-0000-4000-8000-0000000000a2";

/** O nome da instância no FZAP — na vida real, algo como `tektus-dr-paulo-torres`. */
const INSTANCIA = "tektus-invariante-canal";

/**
 * Insere um canal `verdash`. `waha_session_name` fica nulo de propósito: o
 * `channel_sessions_provider_ref_check` exige que cada provider preencha O SEU
 * campo de endereço, e passar o do vizinho mascararia justamente isso.
 */
async function conectar(
  sessao: string,
  org: string,
  instancia: string,
  arquivadoEm: string | null = null,
): Promise<void> {
  await pool.query(
    `insert into channel_sessions
       (id, organization_id, provider, verdash_instance_name, status,
        webhook_secret_encrypted, archived_at)
     values ($1, $2, 'verdash', $3, 'WORKING', '\\x00'::bytea, $4)`,
    [sessao, org, instancia, arquivadoEm],
  );
}

/** O erro do Postgres, ou `null` se o comando passou. */
async function erroAo(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    const e = err as { message?: string; constraint?: string };
    return e.constraint ?? e.message ?? "erro sem mensagem";
  }
}

beforeAll(async () => {
  for (const [id, slug] of [
    [ORG_A, "canal-verdash-a"],
    [ORG_B, "canal-verdash-b"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name)
       values ($1, $2, 'Canal Verdash LTDA', 'Canal Verdash')
       on conflict (id) do nothing`,
      [id, slug],
    );
  }
  await conectar(SESSAO_A, ORG_A, INSTANCIA);
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("a instância da Verdash não é compartilhada entre organizações", () => {
  it("o cenário está montado — sem isto, os casos abaixo medem o vazio", async () => {
    const { rows } = await pool.query<{ organization_id: string; provider: string }>(
      "select organization_id, provider from channel_sessions where id = $1",
      [SESSAO_A],
    );
    expect(rows[0]?.organization_id).toBe(ORG_A);
    expect(rows[0]?.provider).toBe("verdash");
  });

  it("a organização vizinha NÃO consegue reivindicar a mesma instância", async () => {
    // O caso que o índice existe para barrar. Sem ele, as duas linhas convivem
    // — cada uma correta na sua org — e o FZAP entrega a mesma conversa nas
    // duas caixas. Nenhuma policy de RLS vê problema nisso.
    const erro = await erroAo(() => conectar(SESSAO_B, ORG_B, INSTANCIA));
    expect(erro).toBe("channel_sessions_verdash_instance_unique");

    const { rows } = await pool.query<{ n: string }>(
      "select count(*)::text as n from channel_sessions where verdash_instance_name = $1 and archived_at is null",
      [INSTANCIA],
    );
    expect(rows[0]!.n).toBe("1");
  });

  it("arquivar LIBERA a instância — reconectar continua possível", async () => {
    // O outro lado da trava, e o motivo de ela ser parcial. Canal com histórico
    // não pode ser apagado (conversations referencia com ON DELETE RESTRICT):
    // ele é arquivado. Se o índice não fosse parcial, a linha arquivada seguiria
    // ocupando o nome e reconectar o MESMO número estouraria 23505 — um erro que
    // na tela vira "essa instância já está em uso" para o próprio dono dela.
    await pool.query("update channel_sessions set archived_at = now() where id = $1", [SESSAO_A]);

    const erro = await erroAo(() => conectar(SESSAO_A2, ORG_A, INSTANCIA));
    expect(erro).toBeNull();

    // E a trava volta a valer para a vizinha assim que existe um canal ativo.
    const erroVizinha = await erroAo(() => conectar(SESSAO_B, ORG_B, INSTANCIA));
    expect(erroVizinha).toBe("channel_sessions_verdash_instance_unique");
  });

  it("um canal `verdash` sem endereço de instância não entra", async () => {
    // `channel_sessions_provider_ref_check`. Sem ele, uma linha com
    // provider='verdash' e instância nula passa, e o defeito só aparece na hora
    // de enviar — quando o adapter não tem para onde endereçar e o operador vê
    // uma falha de envio sem relação aparente com a conexão.
    const erro = await erroAo(() =>
      pool.query(
        `insert into channel_sessions
           (id, organization_id, provider, status, webhook_secret_encrypted)
         values ($1, $2, 'verdash', 'WORKING', '\\x00'::bytea)`,
        ["ced45a00-0000-4000-8000-0000000000c1", ORG_A],
      ),
    );
    expect(erro).toBe("channel_sessions_provider_ref_check");
  });

  it("quem tem só a anon key não alcança o token da instância", async () => {
    // `verdash_token_encrypted` é o que autoriza mandar mensagem em nome do
    // número do cliente. Ele é por-instância de propósito — nunca o adminToken
    // global do FZAP —, o que limita o estrago, mas não dispensa a barreira.
    //
    // ── POR QUE ESTE TESTE MEDE COMPORTAMENTO, E NÃO PRIVILÉGIO ──
    //
    // A primeira versão perguntava `has_column_privilege('anon', …)` e
    // REPROVAVA. Investiguei antes de chamar de defeito, e o privilégio está
    // aberto mesmo — só que para a tabela INTEIRA e para os três tokens
    // (`meta_token_encrypted`, `zernio_token_encrypted` e este), herdado do
    // `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon` que todo projeto
    // Supabase traz. Não é do provider `verdash`, e nenhum canal jamais revogou.
    //
    // Onde o repo revoga de verdade é em segredo de INSTALAÇÃO
    // (`platform_meta_app`, `platform_google_oauth`), que não é tenant-aware e
    // por isso não tem RLS para se apoiar. Aqui a barreira desenhada é outra: a
    // policy `channel_sessions_tenant_isolation_all`, que resolve
    // `organization_id IN fn_user_org_ids()`. Para `anon` isso é conjunto vazio,
    // porque `auth.uid()` é nulo — então o privilégio existe e não alcança nada.
    //
    // Afirmar aqui a regra dos segredos de instalação seria inventar um padrão
    // que a casa não segue e reprovar o repo por ela. O que este teste prende é
    // a barreira REAL: se um dia alguém acrescentar uma policy de leitura ampla
    // a `channel_sessions` — que é a mudança plausível, não a remoção do grant —
    // este teste fica vermelho no mesmo instante.
    // Grava um token para haver o que vazar. Sem isto o teste conta zero de um
    // universo vazio e fica verde sem medir nada — que é o modo de falha mais
    // comum deste tipo de asserção.
    await pool.query(
      "update channel_sessions set verdash_token_encrypted = '\\x6e6f74616b656e'::bytea where id = $1",
      [SESSAO_A2],
    );
    const comoDono = await pool.query<{ n: string }>(
      "select count(*)::text as n from channel_sessions where verdash_token_encrypted is not null",
    );
    expect(comoDono.rows[0]!.n, "a guarda falhou: não há token no banco para alcançar").toBe("1");

    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      // `set local role anon` faz a RLS valer: `postgres` é dono da tabela e
      // não é filtrado por policy, então medir na conexão normal aprovaria
      // qualquer coisa.
      await cliente.query("set local role anon");

      // DOIS desfechos contam como "não alcança", e medi os dois porque o que
      // acontece hoje não foi o que eu esperava:
      //
      //  - zero linhas, se a policy resolver e filtrar; ou
      //  - `permission denied for function fn_user_org_ids`, que é o que
      //    acontece de fato — `anon` não tem EXECUTE na função que a policy
      //    chama, então nem chega a ser filtrado.
      //
      // O segundo é a barreira mais forte, mas seria frágil exigir SÓ ele: um
      // grant de EXECUTE acrescentado amanhã por outro motivo trocaria o erro
      // por zero linhas, e o teste ficaria vermelho sem que nada tivesse
      // piorado. O que precisa continuar verdade é o desfecho — a linha não
      // chega a quem só tem a anon key —, não o mecanismo.
      let linhas: string | null = null;
      let recusa: string | null = null;
      try {
        const { rows } = await cliente.query<{ n: string }>(
          "select count(*)::text as n from channel_sessions where verdash_token_encrypted is not null",
        );
        linhas = rows[0]!.n;
      } catch (err) {
        recusa = (err as { message?: string }).message ?? "recusa sem mensagem";
      }

      expect(
        linhas === "0" || recusa !== null,
        `anon alcançou ${linhas} linha(s) de channel_sessions com token — deveria alcançar nenhuma`,
      ).toBe(true);
    } finally {
      await cliente.query("rollback").catch(() => {});
      cliente.release();
    }
  });
});
