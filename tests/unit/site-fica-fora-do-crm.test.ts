import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

  it("o código da LP não importa nada do CRM (lib, app, components, hooks, workers) nem por ../", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
          const fonte = readFileSync(p, "utf-8");
          // `@/` na LP aponta para a raiz de site/ (ver site/tsconfig.json) e não resolve
          // para o CRM; quem alcança o CRM é só um `../` que sobe para fora de site/.
          const sobe = /from\s+["'](\.\.\/)+(lib|app|components|hooks|workers)\b/.test(fonte);
          if (sobe) achados.push(p.replaceAll("\\", "/"));
        }
      }
    };
    varrer("site");
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
