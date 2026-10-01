/**
 * Leitura estática de CHECK nomeado em SQL: a definição que sobrevive, como
 * conjunto de literais.
 *
 * Nasceu inline em `check-do-baseline-nao-diverge-da-cadeia.test.ts` e saiu
 * para cá quando um segundo gate (`vocabulario-do-fork-sobrevive-no-baseline`)
 * precisou da MESMA medição. Duas cópias de um parser divergem em silêncio: uma
 * aprende a notação nova do dump, a outra não, e o gate que ficou para trás
 * vira verde por não enxergar. Os controles do instrumento (as duas notações,
 * comentário com parêntese, drop sem add, a última vence) moram no teste de
 * origem e cobrem as duas pontas.
 */
/** A definição de uma constraint que sobreviveu a tudo o que veio depois dela. */
export interface Definicao {
  valores: Set<string>;
  origem: string;
}

/**
 * Tira comentário de SQL SEM cortar string literal.
 *
 * Não dá para usar um `replace(/--.*$/)` de linha aqui, e a diferença é
 * concreta: o bloco canônico do baseline explica cada valor com parágrafos de
 * `--` DENTRO da lista, e esses parágrafos têm parênteses ("(migration 0233,
 * chamada de voz)") e apóstrofos em português. Parêntese de comentário fecharia
 * a lista no lugar errado; apóstrofo de comentário viraria valor. E o inverso
 * também morde: `'--'` dentro de uma string é dado, não comentário.
 */
function semComentarios(sql: string): string {
  let saida = "";
  let i = 0;
  let emString = false;
  while (i < sql.length) {
    const c = sql[i]!;
    if (emString) {
      saida += c;
      // `''` é apóstrofo escapado, não fim de string. (Barra invertida não é
      // escape aqui: `standard_conforming_strings` é o padrão, e medido, não há
      // uma única sequência `\'` nos dois artefatos.)
      if (c === "'") {
        if (sql[i + 1] === "'") {
          saida += "'";
          i += 2;
          continue;
        }
        emString = false;
      }
      i++;
      continue;
    }
    if (c === "'") {
      emString = true;
      saida += c;
      i++;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    saida += c;
    i++;
  }
  return saida;
}

/**
 * Conteúdo do `check (…)` a partir do parêntese que o abre, contando níveis.
 *
 * Parar no primeiro `)` é o que os parsers irmãos fazem, e ali é seguro porque
 * eles só olham `in (…)`. Aqui não dá: o dump escreve `CHECK ((x = ANY (ARRAY[…])))`
 * e o apêndice tem coerências de várias cláusulas entre parênteses. Ler até o
 * primeiro fechamento devolveria uma lista truncada — divergência inventada.
 */
function corpoDoCheck(sql: string, indiceDoAbre: number): string | null {
  let nivel = 0;
  let emString = false;
  for (let i = indiceDoAbre; i < sql.length; i++) {
    const c = sql[i]!;
    if (emString) {
      if (c === "'") {
        if (sql[i + 1] === "'") {
          i++;
          continue;
        }
        emString = false;
      }
      continue;
    }
    if (c === "'") {
      emString = true;
      continue;
    }
    if (c === "(") nivel++;
    else if (c === ")") {
      nivel--;
      if (nivel === 0) return sql.slice(indiceDoAbre + 1, i);
    }
  }
  return null;
}

export function literaisDe(corpo: string): Set<string> {
  return new Set([...corpo.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]!.replace(/''/g, "'")));
}

/**
 * Casa as três escritas de uma constraint nomeada: `add constraint X check (…)`
 * do apêndice, `constraint X check (…)` de dentro de um `create table`, e
 * `CONSTRAINT "X" CHECK (…)` com aspas, que é como o `pg_dump` escreve.
 */
const DEFINE = /\bconstraint\s+"?([a-z0-9_]+)"?\s+check\s*\(/gi;
/**
 * O `%I` do `execute format('… drop constraint %I', …)` não casa aqui de
 * propósito: o nome é resolvido em tempo de execução e nenhuma leitura estática
 * sabe qual constraint cai. Derrubar uma que não foi derrubada é falso vermelho.
 */
const DERRUBA = /\bdrop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/gi;

/** Aplica um arquivo SQL sobre o estado acumulado, na ordem em que ele executa. */
export function aplicar(estado: Map<string, Definicao>, sqlBruto: string, origem: string): void {
  const sql = semComentarios(sqlBruto);
  const eventos: Array<{ pos: number; nome: string; valores: Set<string> | null }> = [];
  for (const m of sql.matchAll(DEFINE)) {
    const corpo = corpoDoCheck(sql, m.index + m[0].length - 1);
    // Parêntese desbalanceado não vira "constraint sem valores" — vira nada. A
    // diferença importa: uma lista vazia se compararia como vocabulário vazio e
    // passaria despercebida; a ausência some do conjunto medido e cai no piso do
    // controle de vivacidade abaixo.
    if (corpo === null) continue;
    eventos.push({ pos: m.index, nome: m[1]!.toLowerCase(), valores: literaisDe(corpo) });
  }
  for (const m of sql.matchAll(DERRUBA)) {
    eventos.push({ pos: m.index, nome: m[1]!.toLowerCase(), valores: null });
  }
  for (const e of eventos.sort((a, b) => a.pos - b.pos)) {
    if (e.valores === null) estado.delete(e.nome);
    else estado.set(e.nome, { valores: e.valores, origem });
  }
}
