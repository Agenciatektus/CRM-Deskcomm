/**
 * TODO EXPORT DE UM MÓDULO "use server" É UM ENDPOINT HTTP PÚBLICO.
 *
 * ## O que se paga por esquecer isso
 *
 * O Next.js atribui um Action ID a CADA export de um módulo `"use server"` e
 * expõe o caminho. Quem o importa não restringe quem o chama: um export usado
 * só por um Server Component continua invocável por qualquer pessoa
 * autenticada — de qualquer organização — com um POST e o header `Next-Action`.
 *
 * Isso já custou duas vezes na casa:
 *
 *  - `registrarAcesso` no Instituto HUGO (LRN-20260822-009): recebia o
 *    identificador por parâmetro e escrevia com service_role, sem validar nada.
 *    A LRN fecha com a ação pendente "auditar os outros produtos na próxima
 *    passada" — que é esta.
 *  - `dadosDoPasso` neste repo (`app/actions/onboarding/montarQuadro.ts`),
 *    achado em 2026-09-17 pela auditoria @Cassio_SecRev: mesma classe exata.
 *    Recebia `orgId` do chamador, criava client service-role e devolvia o funil
 *    de QUALQUER organização cujo uuid o atacante soubesse. Pior que ler: a
 *    chamada decifrava a credencial de IA da vítima e gastava o saldo dela.
 *
 * As duas passaram por revisão humana. É por isso que este arquivo existe: a
 * propriedade é simples de enunciar, invisível na leitura de um diff, e a
 * pessoa que escrever a Action nº 61 não vai lembrar do incidente nº 2.
 *
 * ## Por que aqui e não em tests/invariants
 *
 * Isto é varredura de CÓDIGO, não de banco. Em `tests/invariants` precisaria de
 * um Postgres efêmero — logo de Docker, logo de virtualização — e um gate que
 * só roda em máquina privilegiada é um gate que não roda. Aqui ele entra no
 * `pnpm gov:verify`, que é o portão que todo mundo atravessa.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");
const PASTAS = ["app", "lib", "components"];

/**
 * O que conta como portão. `auth.getUser()` entra na lista porque é um portão
 * de verdade — vai ao GoTrue validar o JWT do cookie, não lê um valor que o
 * chamador mandou. `resolveActiveOrg` e `loadAuthUser` também derivam tudo da
 * sessão.
 *
 * O que NÃO pode entrar aqui: qualquer coisa que valide um parâmetro. Validar
 * o `orgId` que o chamador mandou responde "este uuid existe?", nunca "esta
 * pessoa pode?".
 */
const PORTOES = [
  "requireOnboardingCtx",
  "requirePlatformAdmin",
  "requireAuth",
  "requireRole",
  "ensureAdmin",
  "ensureTenantForUser",
  "loadAuthUser",
  "resolveActiveOrg",
  "auth.getUser(",
] as const;

/**
 * Exports que legitimamente não têm portão. Cada entrada carrega o MOTIVO, e o
 * motivo é o ponto: acrescentar uma linha aqui deve ser um ato deliberado que
 * alguém assina, não um atalho para deixar a suíte verde.
 */
const SEM_PORTAO_COM_MOTIVO: Record<string, string> = {
  // As ações de autenticação não podem exigir sessão: são elas que a criam.
  "app/actions/auth/signInWithPassword.ts::signInWithPassword": "cria a sessão",
  "app/actions/auth/signUp.ts::signUp": "cria a conta",
  "app/actions/auth/signOut.ts::signOut": "encerra a sessão; sem sessão é no-op",
  "app/actions/auth/requestPasswordReset.ts::requestPasswordReset": "fluxo de recuperação, por e-mail",
  "app/actions/auth/updatePassword.ts::updatePassword": "roda sob o token de recuperação",
  "app/actions/auth/enrollMfa.ts::enrollMfa": "passo do enrolamento, sob token do Auth",
  "app/actions/auth/confirmMfaEnroll.ts::confirmMfaEnroll": "passo do enrolamento, sob token do Auth",
  "app/actions/auth/verifyMfa.ts::verifyMfa": "é o próprio desafio; exigir aal2 aqui seria circular",
  "app/actions/auth/useRecoveryCode.ts::useRecoveryCode": "caminho de recuperação de MFA",
  "app/actions/team/acceptInvite.ts::acceptInviteAction": "a autorização é o token do convite",

  // Não tocam dado de nenhuma organização.
  "app/actions/shell/toggleSidebar.ts::toggleSidebar": "grava uma preferência de UI num cookie",
  "app/app/ai/credentials/_actions.ts::refreshCredentialsView": "só revalidatePath, não lê nada",
  "app/actions/settings/updateNotificationPrefs.ts::updateNotificationPrefs":
    "stub: valida o schema e devolve feature_not_yet_available, sem tocar banco",
};

/**
 * Nomes de parâmetro que denunciam tenant vindo de fora. Mesmo com portão, um
 * export que RECEBE a org convida quem for mexer depois a usar o parâmetro em
 * vez do contexto — foi exatamente assim que `dadosDoPasso` nasceu correta na
 * cabeça de quem a escreveu e errada no protocolo HTTP.
 */
const PARAMETRO_DE_TENANT = /\b(org_?id|organization_?id|tenant_?id)\s*[:,)]/i;

/**
 * A exceção honesta: Actions cuja razão de existir é receber a organização —
 * o usuário ESCOLHENDO em qual trabalhar. Aqui o parâmetro não é um atalho, é
 * o pedido.
 *
 * A dispensa só vale com a contrapartida: a Action tem de PROVAR o direito
 * àquele parâmetro, com consulta fresca de membership, e não apenas validar o
 * formato. É a diferença entre "este uuid existe" e "esta pessoa pode" — a
 * mesma que separa `setActiveOrg` do que `dadosDoPasso` era.
 */
const TENANT_POR_PARAMETRO_COM_MOTIVO: Record<string, string> = {
  "app/actions/shell/setActiveOrg.ts::setActiveOrg":
    "é o trocador de organização: o orgId É o pedido do usuário. Confere membership " +
    "fresco em user_organizations (user_id + revoked_at null + accepted_at + org ativa) " +
    "antes de gravar o cookie.",
};

interface Acao {
  arquivo: string;
  nome: string;
  assinatura: string;
  corpo: string;
}

function listarFontes(dir: string, acc: string[]): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entradas) {
    if (e === "node_modules" || e === ".next") continue;
    const abs = path.join(dir, e);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) listarFontes(abs, acc);
    else if (/\.tsx?$/.test(e)) acc.push(abs);
  }
  return acc;
}

function coletarAcoes(): Acao[] {
  const arquivos: string[] = [];
  for (const p of PASTAS) listarFontes(path.join(RAIZ, p), arquivos);

  const acoes: Acao[] = [];
  for (const abs of arquivos) {
    let fonte: string;
    try {
      fonte = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    // A diretiva vale para o MÓDULO, e só quando é a primeira instrução dele.
    if (!/^\s*["']use server["']/.test(fonte)) continue;

    const rel = path.relative(RAIZ, abs).split(path.sep).join("/");
    const re = /^export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte)) !== null) {
      // Destructuring com guarda em vez de `m[1]!`: sob
      // `noUncheckedIndexedAccess` os grupos são `string | undefined`, e a
      // asserção calaria o compilador sem dizer o que se assume. Se um dia o
      // regex perder um grupo, aqui a ação é pulada em silêncio — e o primeiro
      // teste do arquivo, que exige mais de 30 ações encontradas, é quem
      // reprova.
      const [inteiro, nome, assinatura] = m;
      if (nome === undefined || assinatura === undefined) continue;
      const resto = fonte.slice(m.index + inteiro.length);
      const prox = /^export\s/m.exec(resto);
      acoes.push({
        arquivo: rel,
        nome,
        assinatura,
        corpo: prox ? resto.slice(0, prox.index) : resto,
      });
    }
  }
  return acoes;
}

describe("toda Server Action valida a sessão", () => {
  const acoes = coletarAcoes();

  it("a varredura encontra as Server Actions (senão ela não mede nada)", () => {
    // Guarda contra o modo de falha mais traiçoeiro deste arquivo: um regex que
    // para de casar devolve zero ações e o teste fica verde medindo o vazio.
    expect(acoes.length).toBeGreaterThan(30);
  });

  it("nenhum export chega ao dado sem atravessar um portão de sessão", () => {
    const violacoes = acoes
      .filter((a) => !PORTOES.some((p) => a.corpo.includes(p)))
      .filter((a) => !(`${a.arquivo}::${a.nome}` in SEM_PORTAO_COM_MOTIVO))
      .map((a) => `${a.arquivo} -> ${a.nome}()`);

    expect(
      violacoes,
      violacoes.length === 0
        ? ""
        : [
            "Server Action sem portão de sessão.",
            "",
            "Todo export de módulo 'use server' é chamável por HTTP por qualquer",
            "pessoa autenticada, de qualquer organização. Duas saídas:",
            "",
            "  1. Chamar um dos portões no primeiro comando e derivar a org DELE",
            "     (requireOnboardingCtx, ensureAdmin, requirePlatformAdmin, ...); ou",
            "  2. Se a função nunca precisou ser Action — só um Server Component a",
            "     usa — tirá-la do módulo 'use server' e marcar o arquivo com",
            "     import 'server-only'.",
            "",
            "Se ela genuinamente não pode ter portão, acrescente em",
            "SEM_PORTAO_COM_MOTIVO com o motivo escrito.",
          ].join("\n"),
    ).toEqual([]);
  });

  it("nenhum export recebe a organização por parâmetro", () => {
    const suspeitas = acoes
      .filter((a) => PARAMETRO_DE_TENANT.test(a.assinatura))
      .filter((a) => !(`${a.arquivo}::${a.nome}` in TENANT_POR_PARAMETRO_COM_MOTIVO))
      .map((a) => `${a.arquivo} -> ${a.nome}(${a.assinatura.trim()})`);

    expect(
      suspeitas,
      suspeitas.length === 0
        ? ""
        : [
            "Server Action recebendo tenant por parâmetro.",
            "",
            "O portão prova quem é a pessoa; o parâmetro deixa o chamador escolher",
            "de quem é o dado. Tendo os dois, o próximo a mexer usa o parâmetro.",
            "A org tem de sair do portão — e o parâmetro, do código.",
          ].join("\n"),
    ).toEqual([]);
  });

  it("a lista de dispensas não apodrece", () => {
    // Entrada morta é pior que entrada errada: ela descreve um arquivo que não
    // existe mais e passa a autorizar, no futuro, um export novo de mesmo nome.
    const reais = new Set(acoes.map((a) => `${a.arquivo}::${a.nome}`));
    const mortas = [
      ...Object.keys(SEM_PORTAO_COM_MOTIVO),
      ...Object.keys(TENANT_POR_PARAMETRO_COM_MOTIVO),
    ].filter((k) => !reais.has(k));
    expect(mortas, `dispensas que não correspondem a nenhuma Action existente:\n${mortas.join("\n")}`).toEqual([]);
  });
});
