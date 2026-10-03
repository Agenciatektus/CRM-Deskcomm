import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fundirEnriquecimentos } from "@/lib/crm/fundir-enriquecimentos";

/**
 * O QUADRO DEMORAVA MAIS QUE A PACIÊNCIA DO CLIENTE, E ELE DIZIA
 * "A requisição não respondeu em 10000ms".
 *
 * ─── O defeito, medido em 24/09/2026 ────────────────────────────────────────
 *
 * A rota fazia 43 requisições EM SÉRIE para montar o funil "Prospecção
 * Lojistas" da Lior (1.098 leads): a paginação dos leads, mais oito lotes para
 * cada uma das famílias de enriquecimento. Contra o gateway de produção, de
 * dentro da própria VPS e com `service_role`:
 *
 *   43 requisições → 4.212 ms e 4.501 ms (duas rodadas), nenhuma acima de 1 s
 *
 * Sob RLS custa mais: só a política de `contacts` são 563 ms de banco, e a de
 * `crm_leads` 434 ms — e a rota paga isso oito vezes por família, não uma. O
 * cliente desiste em 10 s (`lib/api/client.ts`, DEFAULT_TIMEOUT_MS), então a
 * folga era fina demais para absorver qualquer soluço.
 *
 * ─── O que estava encadeando ────────────────────────────────────────────────
 *
 * Nada de dado. Os quatro enriquecimentos leem `id` e `contact_id`, que já
 * estão no lead antes de qualquer um rodar. A fila existia porque cada função
 * recebia a saída da anterior — encadeamento do `map` funcional, não do grafo
 * de dependências.
 *
 * Os LOTES dentro de cada família continuam em série de propósito; essa decisão
 * está medida e explicada no cabeçalho de `lib/supabase/lotes.ts` e não muda
 * aqui. O que passou a ser paralelo foram as FAMÍLIAS.
 */

type LeadFalso = {
  id: string;
  contact_id: string | null;
  position_in_stage: number;
  [k: string]: unknown;
};

function base(n: number): LeadFalso[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `lead-${i}`,
    contact_id: `contato-${i}`,
    position_in_stage: i,
  }));
}

/** Imita o que cada `with*` faz: devolve `base.map(...)` acrescentando campos. */
function enriquece(
  leads: LeadFalso[],
  campo: string,
  valor: (l: LeadFalso) => unknown,
  aplicaEm: (l: LeadFalso) => boolean = () => true,
): LeadFalso[] {
  return leads.map((l) => (aplicaEm(l) ? { ...l, [campo]: valor(l) } : l));
}

describe("as famílias de enriquecimento rodam em paralelo e a fusão é equivalente à cadeia", () => {
  it("funde os quatro enriquecimentos com o mesmo resultado que a cadeia produzia", () => {
    const quadro = base(50);

    // A cadeia de antes: cada um recebe a saída do anterior.
    const cadeia = enriquece(
      enriquece(
        enriquece(
          enriquece(quadro, "next_action", (l) => `acao-${l.id}`),
          "score",
          (l) => ({ prob: Number(l.position_in_stage) / 100 }),
        ),
        "conversa",
        (l) => ({ ultima: `msg-${l.id}` }),
      ),
      "contact_tags",
      () => ["quente"],
    );

    // O paralelo: os quatro partem do MESMO base, e a fusão junta.
    const fundido = fundirEnriquecimentos(quadro as never, [
      enriquece(quadro, "next_action", (l) => `acao-${l.id}`) as never,
      enriquece(quadro, "score", (l) => ({ prob: Number(l.position_in_stage) / 100 })) as never,
      enriquece(quadro, "conversa", (l) => ({ ultima: `msg-${l.id}` })) as never,
      enriquece(quadro, "contact_tags", () => ["quente"]) as never,
    ]);

    expect(fundido).toEqual(cadeia);
  });

  it("enriquecimento que só toca ALGUNS leads não apaga o que os outros puseram", () => {
    // Este é o caso que uma fusão ingênua erra: quando um `with*` devolve o
    // próprio objeto do base para os leads que não têm dado (é o que todas as
    // quatro fazem hoje), um merge que sobrescreve cegamente joga fora o que a
    // irmã já tinha acrescentado naquele índice.
    const quadro = base(6);
    const soPares = (l: LeadFalso) => Number(l.position_in_stage) % 2 === 0;
    const soImpares = (l: LeadFalso) => Number(l.position_in_stage) % 2 === 1;

    const fundido = fundirEnriquecimentos(quadro as never, [
      enriquece(quadro, "score", () => ({ prob: 0.9 }), soPares) as never,
      enriquece(quadro, "conversa", () => ({ ultima: "oi" }), soImpares) as never,
    ]) as unknown as LeadFalso[];

    const par = fundido[0]!;
    const impar = fundido[1]!;
    expect(par.score).toEqual({ prob: 0.9 });
    expect(par.conversa).toBeUndefined();
    expect(impar.conversa).toEqual({ ultima: "oi" });
    expect(impar.score).toBeUndefined();
    // e o base sobrevive inteiro nos dois
    expect(par.contact_id).toBe("contato-0");
    expect(impar.contact_id).toBe("contato-1");
  });

  it("um lead que ganha campos de TODAS as famílias sai com todas", () => {
    const quadro = base(3);
    const fundido = fundirEnriquecimentos(quadro as never, [
      enriquece(quadro, "next_action", () => "ligar") as never,
      enriquece(quadro, "score", () => ({ prob: 0.5 })) as never,
      enriquece(quadro, "conversa", () => ({ ultima: "oi" })) as never,
      enriquece(quadro, "contact_tags", () => ["vip"]) as never,
    ]) as unknown as LeadFalso[];

    for (const l of fundido) {
      expect(l.next_action).toBe("ligar");
      expect(l.score).toEqual({ prob: 0.5 });
      expect(l.conversa).toEqual({ ultima: "oi" });
      expect(l.contact_tags).toEqual(["vip"]);
    }
  });

  it("nenhum enriquecimento pode reescrever campo do base — a fusão preserva o original", () => {
    const quadro = base(3);
    const fundido = fundirEnriquecimentos(quadro as never, [
      enriquece(quadro, "score", () => ({ prob: 1 })) as never,
    ]) as unknown as LeadFalso[];

    fundido.forEach((l, i) => {
      const original = quadro[i]!;
      expect(l.id).toBe(original.id);
      expect(l.contact_id).toBe(original.contact_id);
      expect(l.position_in_stage).toBe(original.position_in_stage);
    });
  });

  it("CONTROLE: enriquecimento fora de ordem PARA ALTO, não monta card com dado do vizinho", () => {
    // Sem esta guarda, a fusão por índice seria um gerador silencioso de cards
    // trocados: o card do lead A exibindo a conversa do lead B. É o pior defeito
    // possível num CRM multi-cliente, e não daria erro nenhum.
    const quadro = base(4);
    const fora = [...enriquece(quadro, "score", () => ({ prob: 1 }))].reverse();

    expect(() => fundirEnriquecimentos(quadro as never, [fora as never])).toThrow(
      /fora de ordem/,
    );
  });

  it("CONTROLE: a guarda dispara mesmo quando só UM par de índices está trocado", () => {
    const quadro = base(10);
    const quase = enriquece(quadro, "score", () => ({ prob: 1 }));
    const t = quase[7]!;
    quase[7] = quase[8]!;
    quase[8] = t;

    expect(() => fundirEnriquecimentos(quadro as never, [quase as never])).toThrow(
      /posição 7/,
    );
  });

  it("quadro vazio não quebra", () => {
    expect(fundirEnriquecimentos([], [[], [], [], []])).toEqual([]);
  });
});

describe("a rota não pode voltar a encadear as famílias", () => {
  const fonte = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");

  /**
   * Cerca sobre o código-fonte. O motivo de ser assim, e não um teste de
   * comportamento: o encadeamento de volta NÃO produz resultado errado — produz
   * o mesmo quadro, só que lento. Nenhuma asserção sobre a saída pegaria a
   * regressão, e quem reintroduzisse a fila veria tudo verde.
   */
  it("a cerca enxerga o trecho que deve vigiar — se não achar, é cerca cega", () => {
    expect(fonte).toContain("const quadroBase");
    expect(fonte.indexOf("const quadroBase")).toBeGreaterThan(0);
  });

  const FAMILIAS = [
    "withNextActions",
    "withScores",
    "withConversas",
    "withMarcadoresDoContato",
  ] as const;

  /**
   * Recorta os argumentos de cada chamada sem tentar casar parênteses com
   * regex — a primeira versão disto usou `\\(([^;]*?)\\)` e parou no `)` de
   * `(pipeline as Pipeline).organization_id`, reprovando código correto. Pegar
   * o texto até a PRÓXIMA família é grosseiro e suficiente: o que interessa é
   * de onde cada uma tira a lista de leads.
   */
  function argumentosDe(bloco: string, familia: string): string | null {
    const inicio = bloco.indexOf(`${familia}(`);
    if (inicio === -1) return null;
    const depois = bloco.slice(inicio + familia.length);
    const proxima = FAMILIAS.map((f) => depois.indexOf(`${f}(`))
      .filter((i) => i > 0)
      .sort((a, b) => a - b)[0];
    return depois.slice(0, proxima ?? depois.length);
  }

  it("as quatro famílias saem num Promise.all sobre o mesmo quadro base", () => {
    const trecho = fonte.slice(fonte.indexOf("const quadroBase"));
    expect(trecho).toMatch(/await Promise\.all\(\[/);

    for (const familia of FAMILIAS) {
      const args = argumentosDe(trecho, familia);
      expect(args, `${familia} nao foi chamada na rota`).not.toBeNull();
      expect(args!, `${familia} nao recebe o quadro base`).toContain("quadroBase");
    }
  });

  it("CONTROLE: a cerca reprova de fato um codigo que voltou a encadear", () => {
    const encadeadoDeNovo = [
      "  const quadroBase = leadsWithOwner.leads;",
      "  const comAcao = await withNextActions(supabase, org, quadroBase, null);",
      "  const comScore = await withScores(supabase, org, comAcao.leads);",
      "  const comConversa = await withConversas(supabase, org, comScore.leads);",
      "  const comMarcadores = await withMarcadoresDoContato(supabase, org, comConversa.leads);",
    ].join("\n");

    const trecho = encadeadoDeNovo.slice(encadeadoDeNovo.indexOf("const quadroBase"));
    expect(trecho).not.toMatch(/await Promise\.all\(\[/);

    // três das quatro passam a beber da irmã anterior — a cerca tem de ver isso
    for (const familia of ["withScores", "withConversas", "withMarcadoresDoContato"]) {
      const args = argumentosDe(trecho, familia);
      expect(args, `${familia} deveria aparecer no exemplo encadeado`).not.toBeNull();
      expect(args!, `a cerca deixou passar ${familia} encadeada`).not.toContain(
        "quadroBase",
      );
    }
  });
});
