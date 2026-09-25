/**
 * A tela de Funis lia MENOS colunas do que usava — duas vezes.
 *
 * ─── O DEFEITO, MEDIDO EM `master@bea90f8dc` ───────────────────────────────
 *
 * `app/app/kanban/page.tsx` montava o proprio `.select(...)` com uma lista
 * LITERAL de colunas, separada da que a rota usa. As duas divergiram: `fontes`
 * estava na da rota e faltava na da pagina.
 *
 * O componente faz `funil.fontes ?? ["whatsapp"]` — o `??` existe para o banco
 * que ainda nao aplicou a migration. Com a coluna ausente da CONSULTA, ele
 * virava outra coisa: um default que apagava o valor real. A caixa "Direct do
 * Instagram" aparecia desmarcada com `{whatsapp,instagram_direct}` gravado no
 * banco, e voltava sozinha no primeiro refresh depois do clique.
 *
 * Nada disso levanta erro. O PATCH responde 200, o banco tem o valor certo, e
 * a tela mente com um default legitimo.
 *
 * ─── POR QUE ESTE TESTE LE O FONTE ─────────────────────────────────────────
 *
 * O acoplamento e entre uma STRING de colunas e um TIPO. O compilador nao ve
 * um dentro do outro: `.select("a, b")` devolve `any` o bastante para o cast
 * da pagina passar, e foi exatamente isso que deixou a divergencia viver.
 * Testar comportamento tambem nao pega — um Server Component com Supabase real
 * e caro de montar, e o defeito so aparece com dado no banco.
 *
 * Ler o fonte e o que sobra, e e barato. A cerca vale para a PROXIMA coluna:
 * quem acrescentar campo ao tipo sem por na lista ve vermelho aqui.
 *
 * O comentario que este teste substitui contava que `is_client_pipeline` tinha
 * sido acrescentada pelo MESMO motivo. Duas vezes e desenho, nao descuido.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COLUNAS_DO_FUNIL } from "@/app/api/v1/pipelines/_funis";

const RAIZ = process.cwd();
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const COLUNAS = COLUNAS_DO_FUNIL.split(",").map((c) => c.trim());

describe("a consulta traz tudo que a tela usa", () => {
  it("toda propriedade de `FunilDaLista` esta na lista de colunas", () => {
    const fonte = ler("app/app/kanban/_client.tsx");
    const bloco = fonte.match(/export interface FunilDaLista \{([^}]*)\}/);
    expect(bloco, "nao achei `FunilDaLista` — o tipo mudou de forma").toBeTruthy();

    // `[a-z_][a-z0-9_]*` e nao `[a-z_]+`: a primeira versao pulava EM SILENCIO
    // todo nome com digito, e o controle negativo mostrou que uma propriedade
    // `fontes_v2` ausente da lista passava VERDE. Uma cerca que anuncia "toda
    // propriedade" e cobre um subconjunto e o mesmo vicio que este PR conserta.
    //
    // camelCase fica de fora de proposito: coluna de Postgres nesta base e
    // snake_case, e campo DERIVADO (calculado na tela, sem coluna por tras) nao
    // deve ser exigido na lista do SELECT. Se um dia existir coluna camelCase,
    // e este comentario que avisa que a regex precisa crescer.
    const propriedades = [...bloco![1]!.matchAll(/^\s*([a-z_][a-z0-9_]*)\??:/gm)].map((m) => m[1]!);
    expect(propriedades.length, "esperava o tipo com varios campos").toBeGreaterThanOrEqual(6);

    for (const p of propriedades) {
      expect(COLUNAS, `a tela usa \`${p}\` e a consulta nao pede essa coluna`).toContain(p);
    }
  });

  it("`fontes` esta na lista — foi a que faltava", () => {
    // Caso explicito, com nome, para quem for ler a falha daqui a seis meses.
    expect(COLUNAS).toContain("fontes");
  });

  it("a pagina usa a lista COMPARTILHADA, nao uma copia literal", () => {
    // A raiz do defeito nao foi esquecer uma coluna: foi existirem DUAS listas
    // para a mesma tela. Enquanto houver uma so, esquecer fica impossivel.
    const pagina = ler("app/app/kanban/page.tsx");

    expect(pagina, "a pagina precisa importar a lista da rota").toContain("COLUNAS_DO_FUNIL");
    expect(pagina).toContain(".select(COLUNAS_DO_FUNIL)");

    // Nenhum `.select("...")` com string literal sobrando.
    //
    // Isto tambem casaria um `.select("id", { count: "exact", head: true })`
    // legitimo. Hoje a pagina tem um `.select` so, entao nao ha falso positivo
    // — e se alguem acrescentar uma contagem aqui, prefiro que pare e leia esta
    // mensagem a afrouxar a regra que impede as duas listas de voltarem.
    const literais = [...pagina.matchAll(/\.select\(\s*["'`]/g)];
    expect(
      literais.length,
      "voltou um `.select` com lista literal — e assim que as duas listas divergem de novo",
    ).toBe(0);
  });

  it("a rota tambem usa a lista compartilhada", () => {
    const rota = ler("app/api/v1/pipelines/_funis.ts");
    expect(rota).toContain(".select(COLUNAS_DO_FUNIL)");
  });
});
