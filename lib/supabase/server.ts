/**
 * Supabase client para Server Components, Route Handlers e Server Actions.
 *
 * Lê/escreve cookies via next/headers. Sempre use `getUser()` (valida JWT no
 * backend), NUNCA `getSession()` (confia no cookie local sem revalidar).
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";

/**
 * Tudo o que vale para TODO cookie deste cliente, menos o `sameSite` — que é
 * justamente o que muda entre a sessão e o verificador de PKCE (ver
 * `createClientDeEntradaComGoogle`).
 *
 * ⚠️ Precisa ser FUNÇÃO, não constante de módulo: `cookieSecure()` lê
 * `env.NEXT_PUBLIC_APP_URL` em runtime, e quem importa este arquivo (direto ou
 * por `lib/audit`) costuma mockar `@/lib/env` no teste. Constante de módulo
 * executa no IMPORT — antes do mock existir — e derruba a suíte inteira com
 * "Cannot access 'envMock' before initialization".
 */
function opcoesDeCookie(sameSite: "strict" | "lax") {
  // D-01.01: cookie name canônico alinhado ao middleware.
  return {
    name: "sb-deskcomm-auth",
    sameSite,
    httpOnly: true,
    secure: cookieSecure(),
    path: "/",
  };
}

async function clienteDeServidor(sameSite: "strict" | "lax") {
  const cookieStore = await cookies();

  return createServerClient(
    // #1082: a BASE fica na URL pública, porque é dela que o SDK monta os links
    // que este cliente entrega a terceiros — `signInWithOAuth` → `data.url`
    // (login com Google) e o storage → `signedUrl` (mídia, avatar, PDF da LGPD).
    // O endereço interno entra SÓ no transporte, no `global.fetch` abaixo: a
    // requisição vai pelo caminho curto, o link sai público.
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        fetch: fetchDoServidor(
          urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
          env.NEXT_PUBLIC_SUPABASE_URL,
        ),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // A sessão mudou (login, logout, refresh, MFA): quem perguntar de novo
          // nesta requisição pergunta ao GoTrue, não à memória.
          getUserDaRequisicao.delete(cookieStore);
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll pode ser chamado de Server Component; nesse caso, ignoramos.
            // Refresh de sessão acontece no middleware do Next.
          }
        },
      },
      cookieOptions: opcoesDeCookie(sameSite),
    },
  );
}

/**
 * UM `getUser()` POR REQUISIÇÃO — sem afrouxar a verificação.
 *
 * Uma rota de API chamava o GoTrue duas ou três vezes para a mesma pessoa: a
 * própria rota (`supabase.auth.getUser()`), `loadAuthUser()` e, nas que gravam,
 * o `audit()`. Cada chamada é uma ida e volta ao servidor de auth — e com o
 * servidor na França, ~200 ms do Brasil cada uma.
 *
 * ⚠️ O `cache()` do React NÃO resolve isto em Route Handler, e por isso a memória
 * mora aqui. Medido no `react-server-dom-webpack` que o Next 16.3 embarca: fora
 * de uma renderização RSC, `getCacheForType` devolve um `new Map()` a cada
 * chamada, então `loadAuthUser = cache(...)` só deduplica em Server Component —
 * numa rota de API ele roda inteiro de novo a cada chamada.
 *
 * A CHAVE é o objeto de cookies da requisição (`await cookies()`), que o Next
 * cria uma vez por requisição e devolve o MESMO objeto a cada chamada
 * (`CachedCookies`, em next/dist/server/request/cookies.js). Consequências:
 *
 * - duas requisições nunca compartilham resposta — cada uma tem o seu objeto;
 * - a verificação continua sendo `getUser()` no GoTrue, nunca `getSession()`:
 *   a memória só evita PERGUNTAR DE NOVO o que esta requisição já confirmou;
 * - resposta com erro NÃO fica guardada: a segunda tentativa de
 *   `carregarComMotivo` em falha de rede precisa ir de fato à rede;
 * - `setAll` (sessão mudou dentro da requisição) apaga a memória;
 * - `getUser(jwt)` com token explícito não passa por aqui.
 *
 * `WeakMap`: a entrada morre com a requisição, sem limpeza manual.
 */
type ClienteDeServidor = Awaited<ReturnType<typeof clienteDeServidor>>;
type RespostaDoGetUser = Awaited<ReturnType<ClienteDeServidor["auth"]["getUser"]>>;
const getUserDaRequisicao = new WeakMap<object, Promise<RespostaDoGetUser>>();

function lembrarGetUserDaRequisicao(cliente: ClienteDeServidor, requisicao: object): ClienteDeServidor {
  const original = cliente.auth.getUser.bind(cliente.auth);
  const memorizado = (jwt?: string): Promise<RespostaDoGetUser> => {
    if (jwt !== undefined) return original(jwt);
    const emVoo = getUserDaRequisicao.get(requisicao);
    if (emVoo) return emVoo;
    const pergunta: Promise<RespostaDoGetUser> = original().then(
      (resposta) => {
        if (resposta.error && getUserDaRequisicao.get(requisicao) === pergunta) {
          getUserDaRequisicao.delete(requisicao);
        }
        return resposta;
      },
      (erro: unknown) => {
        if (getUserDaRequisicao.get(requisicao) === pergunta) getUserDaRequisicao.delete(requisicao);
        throw erro;
      },
    );
    getUserDaRequisicao.set(requisicao, pergunta);
    return pergunta;
  };
  cliente.auth.getUser = memorizado as ClienteDeServidor["auth"]["getUser"];
  return cliente;
}

export async function createClient() {
  const cliente = await clienteDeServidor("strict");
  return lembrarGetUserDaRequisicao(cliente, await cookies());
}

/**
 * Cliente para INICIAR a entrada com Google (OAuth) — de propósito com
 * `sameSite: "lax"`, e só por causa do cookie do VERIFICADOR de PKCE.
 *
 * ─── Por que o jar do verificador não pode ser Strict ───────────────────────
 *
 * Com `flowType: "pkce"` (que `createServerClient` força — createServerClient.js:33),
 * `signInWithOAuth` sorteia um verificador e o grava no jar de cookies DESTE
 * cliente, com estas mesmas opções. No `createClient` de sempre elas incluem
 * `sameSite: "strict"`.
 *
 * A volta do Google é navegação de outro site até o fim: o navegador sai de
 * `accounts.google.com`, o GoTrue responde 302 e o `redirect_to` cai aqui. O
 * navegador NÃO manda cookie `SameSite=Strict` numa navegação cross-site, então
 * o verificador não chega ao `/auth/callback` e a troca do `code` por sessão
 * falha com `PKCE code verifier not found in storage` — o defeito medido na
 * issue #1388. Com `Lax`, o cookie viaja nessa navegação (GET de topo) e a
 * troca fecha.
 *
 * ─── O que fica frouxo, e o que continua Strict ─────────────────────────────
 *
 * Este cliente existe para UMA chamada: `signInWithOAuth`. Depois dela o
 * verificador é segredo de uso único — morre consumido na troca, no mesmo
 * request em que é lido. Quem TROCA o `code` por sessão é `/auth/callback` com
 * o `createClient` de sempre: é ele que grava os cookies de SESSÃO, e esses
 * seguem `Strict`, como todo o resto do produto.
 *
 * (O default do próprio `@supabase/ssr` é `lax` — constants.js:6. Quem endureceu
 * para `strict` foi este arquivo; a entrada com Google é a exceção necessária,
 * não uma mudança de postura.)
 */
export async function createClientDeEntradaComGoogle() {
  return clienteDeServidor("lax");
}
