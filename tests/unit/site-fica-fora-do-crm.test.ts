import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `site/` É A LP, E NÃO É O CRM.
 *
 * A LP mora neste repositório, mas é um app Next à parte, publicado à parte, que
 * divide o host `crm.verdash.com.br` com o CRM por roteamento do Traefik. O que
 * este arquivo cerca é o ISOLAMENTO, porque ele falha de um jeito mudo:
 *
 *  - `site/` fora do `.dockerignore` entra no `COPY . .` de três imagens, e o
 *    `next build` do CRM passa a typecheckar o `.ts` da LP (que não tem as
 *    dependências do CRM): a imagem quebra no próximo build, longe de quem mexeu;
 *  - `site/` dentro do `tsconfig`, do `eslint` ou do `vitest` da raiz faz o
 *    `pnpm typecheck`, o `pnpm lint` e o `pnpm test:unit` varrerem uma árvore
 *    com `node_modules` e `.next` próprios;
 *  - um PR só de `site/` que o script `pr-mexe-na-imagem.sh` mande construir gasta
 *    três builds Docker à toa; um que ele mande PULAR sem `site/` estar no
 *    `.dockerignore` deixaria passar imagem quebrada com o gate verde;
 *  - código da LP importando de `lib/`, `app/` ou `components/` do CRM acopla os
 *    dois deploys, que são independentes de propósito.
 *
 * O que NÃO prova: que o Traefik roteia só a raiz para a LP. Isso é a Fase 8 e se
 * mede de fora, com `curl`, em produção.
 */

const lerLinhas = (arquivo: string) =>
  readFileSync(arquivo, "utf-8")
    .split("\n")
    .map((l) => l.trim());

/**
 * Os especificadores de import/require/import() de um arquivo. Cobre as quatro
 * formas: `from "x"`, `import "x"`, `import("x")` e `require("x")`.
 */
const ESPECIFICADORES = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** O `spec`, importado por `arquivo`, cai FORA de `site/`? Só relativo conta: `@/` e pacote não saem. */
function saiDeSite(arquivo: string, spec: string): boolean {
  if (!spec.startsWith(".")) return false;
  const raizDaLp = resolve("site") + sep;
  const alvo = resolve(dirname(arquivo), spec) + sep;
  return !alvo.startsWith(raizDaLp);
}

describe("site/ fica fora do CRM", () => {
  it("existe, com package.json e lockfile próprios (o repositório não usa workspace)", () => {
    expect(existsSync("site/package.json")).toBe(true);
    expect(existsSync("site/pnpm-lock.yaml")).toBe(true);
    expect(existsSync("pnpm-workspace.yaml")).toBe(false);
  });

  it("está no .dockerignore: não entra no contexto de nenhuma das imagens do CRM", () => {
    expect(lerLinhas(".dockerignore")).toContain("site");
  });

  it("está fora do tsconfig do build, do typecheck, do eslint e do vitest da raiz", () => {
    expect(readFileSync("tsconfig.json", "utf-8")).toMatch(/"site\/\*\*"/);
    expect(readFileSync("tsconfig.typecheck.json", "utf-8")).toMatch(/"site\/\*\*"/);
    expect(readFileSync("eslint.config.mjs", "utf-8")).toMatch(/"site\/"/);
    expect(readFileSync("vitest.config.ts", "utf-8")).toMatch(/"site\/\*\*"/);
  });

  it("PR que só mexe em site/ pula os builds Docker do CRM", () => {
    const responde = (caminhos: string[]) =>
      execFileSync("bash", ["scripts/pr-mexe-na-imagem.sh"], {
        input: caminhos.join("\n") + "\n",
        encoding: "utf-8",
      }).trim();

    expect(
      responde(["site/app/page.tsx", "site/package.json", "site/public/_lp/fonts/x.woff2"]),
    ).toBe("nao");
    // CONTROLE: o script não virou um "nao" para tudo. Tocar o CRM junto constrói.
    expect(responde(["site/app/page.tsx", "lib/qualquer.ts"])).toBe("sim");
  });

  it("o resolvedor de imports acusa quem sai de site/ e deixa passar quem fica (controle)", () => {
    // Sai: sobe da LP para o CRM, pelas quatro formas de importar.
    expect(saiDeSite("site/app/page.tsx", "../../lib/x")).toBe(true);
    expect(saiDeSite("site/app/page.tsx", "../../../fora")).toBe(true);
    // Fica: `../app/y` a partir de site/components/ ainda é site/app/y.
    expect(saiDeSite("site/components/x.tsx", "../app/y")).toBe(false);
    expect(saiDeSite("site/app/page.tsx", "./globals.css")).toBe(false);
    // `@/` e pacote não saem (o alias da LP aponta para site/).
    expect(saiDeSite("site/app/page.tsx", "@/lib/x")).toBe(false);
    expect(saiDeSite("site/app/page.tsx", "react")).toBe(false);
    // As quatro formas de import são lidas.
    const amostra = [
      'import a from "./a";',
      'import "./b";',
      'const c = await import("./c");',
      'const d = require("./d");',
    ].join("\n");
    expect([...amostra.matchAll(ESPECIFICADORES)].map((m) => m[1])).toEqual([
      "./a",
      "./b",
      "./c",
      "./d",
    ]);
  });

  it("o código da LP não importa nada que fique fora de site/", () => {
    const achados: string[] = [];
    let lidos = 0;
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.(ts|tsx|mjs|mts|cts|js|jsx)$/.test(e.name)) {
          lidos += 1;
          const fonte = readFileSync(p, "utf-8");
          for (const m of fonte.matchAll(ESPECIFICADORES)) {
            if (saiDeSite(p, m[1] ?? "")) achados.push(`${p.replaceAll("\\", "/")} -> ${m[1]}`);
          }
        }
      }
    };
    varrer("site");
    // Guarda de vacuidade: varreu arquivos de verdade.
    expect(lidos).toBeGreaterThan(3);
    expect(achados).toEqual([]);
  });

  it("não carrega segredo: nenhum .env versionado dentro de site/", () => {
    const rastreados = execFileSync("git", ["ls-files", "site"], { encoding: "utf-8" })
      .split("\n")
      .filter(Boolean);
    expect(rastreados.length).toBeGreaterThan(5);
    expect(
      rastreados.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".example")),
    ).toEqual([]);
  });
});
