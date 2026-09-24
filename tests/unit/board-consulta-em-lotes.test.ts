import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  IDS_POR_CONSULTA,
  buscarTodasAsPaginas,
  consultarEmLotes,
  lotesDeIds,
} from "@/lib/supabase/lotes";

/**
 * O QUADRO DE UM CLIENTE GRANDE NÃO ABRIA, E A TELA DIZIA "Bad Request".
 *
 * ─── O defeito, medido em 24/09/2026 ────────────────────────────────────────
 *
 * A rota do board carrega os leads e depois consulta contatos, conversas,
 * estados e scores passando TODOS os ids de uma vez num `.in(...)`. Isso vira
 * query string, e cada UUID custa 37 bytes com a vírgula.
 *
 * Contra o gateway do próprio CRM, com uuids reais:
 *
 *    178 ids →  6.585 b → 200   (funil do Dr. Paulo: abria)
 *    600 ids → 22.199 b → 200
 *    700 ids → 25.899 b → 400 "Bad Request"
 *   1097 ids → 40.588 b → 400 "Bad Request"   (Prospecção Lojistas: não abria)
 *
 * O 400 subia pela rota como mensagem de erro e a tela imprimia literalmente
 * "Não consegui carregar este funil: Bad Request" — uma frase que não diz nem
 * que o problema é tamanho, nem que ele cresce com a base do cliente. Por isso
 * o defeito parecia aleatório: dependia de quantos leads o cliente tinha.
 */

function respostaOk<T>(linhas: T[]) {
  return Promise.resolve({ data: linhas, error: null });
}

const uuids = (n: number) =>
  Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("lotesDeIds", () => {
  it("não deixa nenhum lote passar do tamanho que o gateway aceita", () => {
    const lotes = lotesDeIds(uuids(1097));
    expect(lotes.every((l) => l.length <= IDS_POR_CONSULTA)).toBe(true);
    // E o tamanho tem de caber com folga: 150 uuids são ~5,6 KB, contra os
    // ~24 KB medidos como limite. Um lote calibrado no limite quebra de novo
    // quando a URL ganha mais um filtro.
    expect(IDS_POR_CONSULTA * 37).toBeLessThan(24_000 / 3);
  });

  it("não perde nem duplica id nenhum", () => {
    const todos = uuids(1097);
    const juntos = lotesDeIds(todos).flat();
    expect(juntos).toEqual(todos);
    expect(new Set(juntos).size).toBe(1097);
  });

  it("lista vazia não gera requisição nenhuma", () => {
    expect(lotesDeIds([])).toEqual([]);
  });
});

describe("consultarEmLotes", () => {
  it("quebra os 1097 do funil da Lior em requisições que cabem", async () => {
    const tamanhos: number[] = [];
    const { data, error } = await consultarEmLotes(uuids(1097), (lote) => {
      tamanhos.push(lote.length);
      return respostaOk(lote.map((id) => ({ id })));
    });

    expect(error).toBeNull();
    // O ponto inteiro: nenhuma requisição carrega os 1097.
    expect(Math.max(...tamanhos)).toBeLessThanOrEqual(IDS_POR_CONSULTA);
    expect(tamanhos.length).toBe(Math.ceil(1097 / IDS_POR_CONSULTA));
    // E o resultado é o mesmo que a consulta única daria.
    expect(data).toHaveLength(1097);
  });

  it("erro em um lote interrompe e não devolve meia página", async () => {
    // Devolver o que deu certo junto com o erro produziria um quadro que parece
    // completo e não está — cards faltando sem ninguém avisar.
    const consulta = vi
      .fn()
      .mockImplementationOnce(() => respostaOk([{ id: "a" }]))
      .mockImplementationOnce(() =>
        Promise.resolve({ data: null, error: { message: "Bad Request" } }),
      )
      .mockImplementation(() => respostaOk([{ id: "c" }]));

    const { data, error } = await consultarEmLotes(uuids(500), consulta);

    expect(error).toBe("Bad Request");
    expect(data).toEqual([]);
    // Parou no erro: não seguiu disparando as requisições seguintes.
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("consulta em série, não em paralelo", async () => {
    // Oito requisições simultâneas por quadro multiplicam a chance de esbarrar
    // em limite de conexão do PostgREST, e o ganho de latência não paga o risco
    // numa tela que já demora a carregar.
    let emVoo = 0;
    let maxEmVoo = 0;
    await consultarEmLotes(uuids(600), async (lote) => {
      emVoo++;
      maxEmVoo = Math.max(maxEmVoo, emVoo);
      await new Promise((r) => setTimeout(r, 1));
      emVoo--;
      return { data: lote.map((id) => ({ id })), error: null };
    });
    expect(maxEmVoo).toBe(1);
  });
});

describe("a rota do quadro não pode ter `.in()` cru", () => {
  /**
   * Tira comentário antes de casar.
   *
   * Sem isto a cerca reprova código CORRETO: basta alguém documentar o defeito
   * com o exemplo real ao lado —
   *   `// ANTES: .in("contact_id", contactIds)` — e a suíte quebra. Num arquivo
   * que explica tudo em prosa, isso é questão de tempo, e cerca que reprova o
   * inocente é cerca que alguém apaga.
   */
  function semComentarios(fonte: string): string {
    return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  /**
   * `,?` porque o prettier deste repo usa `trailingComma: "all"`: um `.in(`
   * que passe de 100 colunas vira multi-linha com vírgula final, e sem isto a
   * cerca leria `"lote,"` e reprovaria o certo.
   */
  const CHAMADA_IN = /\.in\(\s*("[^"]+"|'[^']+')\s*,\s*([^)]+?)\s*,?\s*\)/g;

  function argumentosCrus(fonte: string) {
    return [...semComentarios(fonte).matchAll(CHAMADA_IN)]
      .map((m) => (m[2] ?? "").trim().replace(/,$/, ""))
      .filter((arg) => arg !== "lote");
  }

  it("todo `.in(` do board usa um lote", () => {
    // Os DOIS defeitos desta correção caíram na integração, não no helper:
    // primeiro converti quatro consultas e esqueci o `withScores` (que passa
    // ids de LEAD, não de contato); depois converti a consulta e esqueci a
    // linha de erro ao lado, e o build quebrou. Teste de unidade do helper não
    // pega nenhum dos dois — esta cerca pega o primeiro, o compilador o segundo.
    const rota = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");
    expect(argumentosCrus(rota)).toEqual([]);
  });

  it("controle positivo: a cerca enxerga as chamadas do arquivo", () => {
    // Cerca que não casa nada passa sempre. Sem este caso, apagar a regex por
    // engano deixaria o teste verde e inútil.
    const rota = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");
    const todas = [...semComentarios(rota).matchAll(CHAMADA_IN)];
    expect(todas.length).toBeGreaterThanOrEqual(8);
  });

  it("não reprova `.in()` citado em comentário", () => {
    const comExemploNaProsa = `
      // ANTES (o defeito): mandava tudo de uma vez —
      //   .in("contact_id", contactIds)
      /* e em bloco também: .in("id", leadIds) */
      await supabase.from("x").in("id", lote);
    `;
    expect(argumentosCrus(comExemploNaProsa)).toEqual([]);
  });

  it("não reprova `.in(` quebrado em várias linhas pelo prettier", () => {
    const multiLinha = `
      await supabase.from("x").in(
        "contact_id",
        lote,
      );
    `;
    expect(argumentosCrus(multiLinha)).toEqual([]);
  });

  it("continua reprovando o `.in()` cru de verdade", () => {
    expect(argumentosCrus(`await supabase.from("x").in("contact_id", contactIds);`)).toEqual([
      "contactIds",
    ]);
  });
});

describe("buscarTodasAsPaginas", () => {
  /**
   * O PostgREST CORTA no `db-max-rows` e não avisa. Medido no gateway do CRM
   * pedindo os leads do funil da Lior sem `Range` nenhum:
   *
   *   content-range: 0-999/1098  →  1.000 linhas no corpo, 98 sumiram
   *
   * Um quadro com 1.000 dos 1.098 cards abre normal e parece completo. É pior
   * que o 400 que o resto deste arquivo conserta, porque não dá erro nenhum.
   */
  function servidorQueCortaEm(total: number, teto = 1000) {
    const linhas = Array.from({ length: total }, (_, i) => ({ id: `lead-${i}` }));
    return async (de: number, ate: number) => ({
      data: linhas.slice(de, Math.min(ate + 1, de + teto)),
      error: null,
    });
  }

  it("traz os 1.098 do funil da Lior, e não os 1.000 do teto", async () => {
    const { data, error, truncado } = await buscarTodasAsPaginas(servidorQueCortaEm(1098));
    expect(error).toBeNull();
    expect(truncado).toBe(false);
    expect(data).toHaveLength(1098);
    // E sem repetir: página que se sobrepõe entregaria o mesmo lead duas vezes.
    expect(new Set(data.map((l) => l.id)).size).toBe(1098);
  });

  it("página EXATAMENTE cheia não é confundida com o fim", async () => {
    // O caso que uma implementação ingênua erra: 2.000 linhas em páginas de
    // 1.000 dá uma segunda página cheia, e parar ali perderia o resto.
    const { data } = await buscarTodasAsPaginas(servidorQueCortaEm(2000));
    expect(data).toHaveLength(2000);
  });

  it("base pequena resolve numa página só", async () => {
    const paginas: number[] = [];
    await buscarTodasAsPaginas(async (de, ate) => {
      paginas.push(de);
      return { data: Array.from({ length: 178 }, (_, i) => ({ id: `l${i}` })), error: null };
    });
    expect(paginas).toEqual([0]);
  });

  it("erro numa página interrompe e não devolve meia lista", async () => {
    const { data, error } = await buscarTodasAsPaginas(async (de) =>
      de === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` })), error: null }
        : { data: null, error: { message: "Bad Request" } },
    );
    expect(error).toBe("Bad Request");
    expect(data).toEqual([]);
  });

  it("servidor que ignora o Range não vira laço infinito — e DIZ que truncou", async () => {
    // Sem teto, um servidor que devolvesse sempre a mesma página cheia
    // prenderia a rota para sempre. Com teto, o risco vira "lista incompleta",
    // e aí ela precisa se declarar incompleta em vez de parecer inteira.
    const { data, truncado } = await buscarTodasAsPaginas(async () => ({
      data: Array.from({ length: 1000 }, (_, i) => ({ id: `x${i}` })),
      error: null,
    }));
    expect(truncado).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });
});
