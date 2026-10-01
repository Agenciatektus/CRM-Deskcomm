/**
 * O JOB `medir` DO upstream-sync NÃO TOCA EM CACHE.
 *
 * Ele roda `pnpm install` e `pnpm test:unit` com código do UPSTREAM. Se o cache
 * (~/.npm, store do pnpm) fosse salvo no post step, ficaria no escopo de `dev`
 * um cache tocado por código alheio, e todo PR para `dev` (inclusive no
 * executor próprio) o restauraria. Parecer do @Davi_DevSecOps na PR #54.
 *
 * O conserto tem duas pontas, e este teste vigia as duas:
 *   1. o `medir` chama `./.github/actions/preparar-node` com `cache: 'false'` e
 *      não usa action de cache nem `setup-node` direto;
 *   2. dentro da action, TODO passo que mexe em cache obedece a esse input.
 * E uma terceira, para não mudar os outros workflows: só o `medir` desliga.
 *
 * Sem parser YAML nas dependências (workflows-tem-permissions.test.ts): recorte
 * por indentação.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), ".github/workflows");
const ACTION = join(process.cwd(), ".github/actions/preparar-node/action.yml");

function semComentario(texto: string): string[] {
  return texto.split("\n").filter((l) => !l.trimStart().startsWith("#"));
}

/** Linhas do job `nome` (dois espaços de indentação dentro de `jobs:`). */
function blocoDoJob(linhas: string[], nome: string): string[] {
  const i = linhas.findIndex((l) => l === `  ${nome}:`);
  if (i < 0) return [];
  let fim = i + 1;
  while (fim < linhas.length && !/^ {2}\S/.test(linhas[fim]!) && !/^\S/.test(linhas[fim]!)) fim++;
  return linhas.slice(i, fim);
}

/** Cada passo (`- ...` a seis espaços) como bloco de texto. */
function passos(bloco: string[]): string[] {
  const out: string[] = [];
  for (const l of bloco) {
    if (/^ {6}- /.test(l)) out.push(l);
    else if (out.length && /^ {8,}\S/.test(l)) out[out.length - 1] += `\n${l}`;
  }
  return out;
}

const medir = blocoDoJob(semComentario(readFileSync(join(DIR, "upstream-sync.yml"), "utf8")), "medir");
const passosDoMedir = passos(medir);

describe("upstream-sync: o job `medir` não restaura nem salva cache", () => {
  it("o instrumento está vivo: acha o job e os passos dele", () => {
    expect(medir.length, "job `medir` em upstream-sync.yml").toBeGreaterThan(10);
    expect(passosDoMedir.length).toBeGreaterThanOrEqual(5);
  });

  it("todo uso da action preparada no `medir` desliga o cache", () => {
    const usos = passosDoMedir.filter((p) => /uses:\s*\.\/\.github\/actions\/preparar-node\s*$/m.test(p));
    expect(usos.length, "o `medir` instala deps pela action preparada").toBeGreaterThan(0);
    for (const p of usos) {
      expect(p, "preparar-node no `medir` sem `cache: 'false'` salva cache tocado pelo upstream").toMatch(
        /^\s+with:\s*\n\s+cache:\s*['"]false['"]\s*$/m,
      );
    }
  });

  it("o `medir` não usa action de cache nem setup-node por fora", () => {
    const proibidos = passosDoMedir.filter((p) => /uses:\s*actions\/(cache|setup-node)\b/.test(p));
    expect(proibidos).toEqual([]);
  });
});

describe("preparar-node: o input `cache` governa TODO passo que mexe em cache", () => {
  const linhas = semComentario(readFileSync(ACTION, "utf8"));
  const ps = passos(linhas.map((l) => `  ${l}`)); // passos da action vivem a 4; normaliza para 6

  it("o input existe e o padrão mantém o cache ligado (os outros workflows não mudam)", () => {
    const texto = linhas.join("\n");
    expect(texto).toMatch(/^inputs:\s*\n\s+cache:[\s\S]*?default:\s*['"]true['"]/m);
  });

  it("o passo de actions/cache só roda com o input ligado", () => {
    const caches = ps.filter((p) => /uses:\s*actions\/cache\b/.test(p));
    expect(caches.length, "controle positivo: a action TEM passo de cache").toBeGreaterThan(0);
    for (const p of caches) expect(p).toMatch(/^\s+if:\s*inputs\.cache == 'true'\s*$/m);
  });

  it("o setup-node só liga o cache do pnpm com o input ligado", () => {
    const nodes = ps.filter((p) => /uses:\s*actions\/setup-node\b/.test(p));
    expect(nodes.length).toBeGreaterThan(0);
    for (const p of nodes) {
      const cache = p.match(/^\s+cache:\s*(.*)$/m)?.[1]?.trim();
      expect(cache, "setup-node com cache incondicional").toBe("${{ inputs.cache == 'true' && 'pnpm' || '' }}");
    }
  });

  it("nenhum outro workflow desliga o cache (comportamento dos outros intacto)", () => {
    const desligam: string[] = [];
    for (const arquivo of readdirSync(DIR).filter((a) => /\.ya?ml$/.test(a))) {
      if (arquivo === "upstream-sync.yml") continue;
      const ls = semComentario(readFileSync(join(DIR, arquivo), "utf8"));
      for (const p of passos(ls)) {
        if (/preparar-node/.test(p) && /^\s+cache:/m.test(p)) desligam.push(arquivo);
      }
    }
    expect(desligam).toEqual([]);
  });
});
