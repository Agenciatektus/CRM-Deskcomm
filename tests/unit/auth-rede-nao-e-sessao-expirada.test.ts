import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FALHA DE REDE NÃO É SESSÃO EXPIRADA — E O USUÁRIO PRECISA SABER A DIFERENÇA.
 *
 * ## O que aconteceu, medido em produção (18/09/2026)
 *
 * O Peterson abriu o CRM e viu `Auth required.` com um requestId. Foi investigar a conta
 * do cliente, que não tinha nada. A causa estava no log da aplicação:
 *
 *     [auth] getUser falhou — tratando como não autenticado
 *     AuthRetryableFetchError: fetch failed
 *     ⨯ getaddrinfo EAI_AGAIN aws-0-eu-central-1.pooler.supabase.com
 *
 * `EAI_AGAIN` é falha de resolução de DNS. A VPS30 não conseguiu resolver o host do
 * Supabase de Frankfurt por alguns segundos — 18 ocorrências em seis horas, sempre nesse
 * host, com o DNS respondendo normalmente antes e depois.
 *
 * ## Os dois defeitos que isso expôs
 *
 * **Primeiro: desistir na primeira tentativa.** A janela é de segundos. Tentar de novo
 * resolve a maioria antes de virar erro visível.
 *
 * **Segundo, e o que custou o tempo dele: contar a mesma coisa para causas diferentes.**
 * O código JÁ distinguia rede de token ilegível no log — há comentário no `server.ts`
 * explicando por que `name` viaja junto. Mas na resposta as duas viravam `Auth required.`,
 * que manda relogar. Relogar não conserta DNS, e quem lê a mensagem vai procurar o
 * problema na conta.
 *
 * A ação continua a mesma e isso é deliberado: sem usuário confirmado, recusar é o
 * desfecho seguro. Falhar fechado na AÇÃO é regra. Falhar fechado na EXPLICAÇÃO é bug.
 */

interface RespostaGetUser {
  data: { user: unknown };
  error: { name?: string; message: string; status?: number; code?: string } | null;
}

/** Fila: cada chamada consome uma resposta. É o que torna o retry observável. */
const fila: RespostaGetUser[] = [];
let chamadas = 0;

const USUARIO = { id: "u-1", email: "peterson@tektus.com.br" };

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        chamadas++;
        return fila.shift() ?? { data: { user: null }, error: null };
      },
    },
    // `readSupportContext` chama uma RPC logo depois do getUser. Sem contexto de suporte
    // é o caso comum, e é o que estes casos precisam.
    rpc: async () => ({ data: null, error: null }),
    // Com usuário confirmado a função consulta memberships. Devolver vazio basta: o que
    // estes casos medem é o caminho ATÉ ali, não o que vem depois.
    from: () => {
      // Encadeamento que devolve a si mesmo: `loadAuthUser` usa select/eq/is/in/order/
      // maybeSingle em combinações diferentes por consulta, e fixar uma forma só faria o
      // teste quebrar a cada consulta nova — por mock, não por comportamento.
      // A folha é encadeável E aguardável: `.order().order()` existe no código real, e
      // o resultado é consumido com `await`. Um `then` na própria folha cobre os dois
      // sem precisar adivinhar onde a cadeia termina.
      const folha: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "neq", "limit", "filter", "order"]) {
        folha[m] = () => folha;
      }
      folha.maybeSingle = async () => ({ data: null });
      folha.single = async () => ({ data: null });
      folha.then = (resolve: (v: unknown) => unknown) => resolve({ data: [] });
      return folha;
    },
  }),
}));

const { carregarUsuarioComMotivo } = await import("@/lib/auth/server");

const REDE = {
  name: "AuthRetryableFetchError",
  message: "fetch failed",
  status: 0,
};

beforeEach(() => {
  fila.length = 0;
  chamadas = 0;
});

describe("falha de rede tem tratamento próprio", () => {
  it("tenta de novo quando a causa é transitória — e a segunda vez salva a requisição", async () => {
    fila.push({ data: { user: null }, error: REDE });
    fila.push({ data: { user: USUARIO }, error: null });

    // Uma chamada só: fora do Next, o `cache()` do React não compartilha resultado entre
    // as duas exports, e medir em duas chamadas consumiria a fila duas vezes.
    const { user, motivo } = await carregarUsuarioComMotivo();

    expect(chamadas).toBe(2);
    expect(user).not.toBeNull();
    // O ponto: o usuário NÃO vê erro nenhum. A intermitência de segundos morre aqui.
    expect(motivo).toBe("ok");
  });

  it("NÃO tenta de novo quando o token é ilegível — insistir não conserta e só soma espera", async () => {
    // `AuthApiError` é a classe de token inválido. Retentar aqui atrasaria o caminho de
    // quem simplesmente não está logado, que é o tráfego mais comum da aplicação.
    fila.push({
      data: { user: null },
      error: { name: "AuthApiError", message: "invalid claim", status: 401 },
    });

    const r = await carregarUsuarioComMotivo();
    expect(r.user).toBeNull();
    expect(chamadas).toBe(1);
    expect(r.motivo).toBe("sem_sessao");
  });

  it("quando a rede falha DUAS vezes, marca infra — é o que troca a mensagem ao usuário", async () => {
    fila.push({ data: { user: null }, error: REDE });
    fila.push({ data: { user: null }, error: REDE });

    const r = await carregarUsuarioComMotivo();
    expect(r.user).toBeNull(); // a ação não muda: continua recusando
    expect(chamadas).toBe(2);
    // ...mas o gate de rota agora pode dizer "não consegui verificar sua sessão" em vez
    // de "Auth required", que mandaria a pessoa relogar contra um problema de DNS.
    expect(r.motivo).toBe("infra");
  });

  it("visitante deslogado não é falha de infra, e não retenta", async () => {
    // O estado mais comum da aplicação. Se ele entrasse no caminho de retry, toda visita
    // anônima pagaria 300ms a troco de nada.
    fila.push({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
    });

    const r = await carregarUsuarioComMotivo();
    expect(r.user).toBeNull();
    expect(chamadas).toBe(1);
    expect(r.motivo).toBe("sem_sessao");
  });
});
