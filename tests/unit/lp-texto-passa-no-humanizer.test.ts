import { describe, expect, it } from "vitest";

import * as C from "../../site/lib/conteudo";
import { llmsCompleto, llmsResumo } from "../../site/lib/llms";

/**
 * O TEXTO DA LP PASSA NO HUMANIZER, E A RESPOSTA DO FAQ É CITÁVEL.
 *
 * A copy mora num arquivo só (`site/lib/conteudo.ts`) e alimenta a página, o JSON-LD e o
 * `llms.txt`. Este teste lê esse arquivo, então cerca os três de uma vez:
 *
 *  - os tiques de texto de IA que a regra do humanizer proíbe (travessão, ponto médio,
 *    "não é X, é Y", conectivo de relatório);
 *  - número de resultado que ninguém consegue verificar (a página não afirma percentual,
 *    multiplicador nem "X vezes");
 *  - o tamanho das respostas do FAQ: curtas demais não respondem, longas demais não são
 *    citadas por motor de resposta. A faixa de 30 a 75 palavras cobre o "bloco de resposta".
 *
 * NÃO prova que o texto é bom. Prova que ele não regride para os vícios que já combinamos
 * evitar. A leitura de qualidade continua sendo do `/humanizer` e de quem revisa.
 */

function folhas(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(folhas);
  if (valor && typeof valor === "object") return Object.values(valor).flatMap(folhas);
  return [];
}

// Todo export de texto da LP. A estatística da RD Station (com % e fonte dita) fica de fora das
// checagens de número, e tem teste próprio.
const TEXTOS = [
  C.HERO,
  C.VIDEO,
  C.FAIXA_ROTULO,
  C.FAIXA_APOIO,
  C.FAIXA_PAUSAR,
  C.FAIXA_CANAIS,
  C.FAIXA_INTEGRACOES,
  C.PROBLEMAS_TITULO,
  C.PROBLEMAS_INTRO,
  C.PROBLEMAS,
  C.PROBLEMAS_FECHO,
  C.CONTA,
  C.CALCULADORA,
  C.MECANISMO,
  C.ETAPAS,
  C.PROVA,
  C.RADAR,
  C.AGENTE,
  C.CANAIS,
  C.NICHOS,
  C.IMPLANTACAO,
  C.OFERTA,
  C.GARANTIA,
  C.PARA_QUEM,
  C.OBJECOES,
  C.FAQ,
  C.GOOGLE,
  C.CTA_FINAL,
  C.CTA,
  C.NAV,
  C.META_DESCRICAO,
  C.SITE.descricao,
].flatMap(folhas);

const TEXTOS_COM_RD = [...TEXTOS, C.ESTATISTICA_RD];

const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

describe("texto da LP", () => {
  it("varreu texto de verdade (guarda de vacuidade)", () => {
    expect(TEXTOS.length).toBeGreaterThan(60);
    expect(TEXTOS.join(" ").length).toBeGreaterThan(4000);
  });

  it.each([
    ["travessão", /[—–]/],
    ["ponto médio como separador", /·/],
    [
      "'não é X, é Y' e variantes",
      /\bn[ãa]o [ée] (?:apenas |s[óo] |somente )?[^.;:]{1,60}, (?:[ée]|mas)\b/i,
    ],
    [
      "'não apenas ... mas também'",
      /\bn[ãa]o (?:apenas|s[óo]|somente)\b[^.]{0,80}\bmas tamb[ée]m\b/i,
    ],
    [
      "conectivo de relatório",
      /\b(além disso|vale ressaltar|vale destacar|em suma|portanto,|dessa forma,)\b/i,
    ],
    [
      "buzzword",
      /\b(potencialize|alavanque|revolucion|disruptiv|de ponta|inovador|holístic|sinergia|turbine|escale seu)\w*/i,
    ],
  ])("sem %s", (_nome, padrao) => {
    expect(TEXTOS_COM_RD.filter((t) => padrao.test(t))).toEqual([]);
  });

  it("não afirma número de resultado (percentual, multiplicador, 'X vezes')", () => {
    // "3x sem juros" e "100% da implantação" são condição de pagamento e de garantia, não resultado.
    const semCondicao = (t: string) => t.replace(/\b3x sem juros/g, "").replace(/100% da implantação/g, "").replace(/15% de desconto/g, "");
    const suspeitos = TEXTOS.map(semCondicao).filter(
      (t) => /\d+\s?%/.test(t) || /\b\d+(?:[.,]\d+)?\s?(?:x|vezes)\b/i.test(t) || /\bROI\b/.test(t),
    );
    expect(suspeitos).toEqual([]);
  });

  it("a única estatística externa é a da RD Station, com a fonte dita na frase", () => {
    expect(C.ESTATISTICA_RD).toMatch(/RD Station/);
  });

  it("nenhum texto carrega marcador de pendência (A CONFIRMAR, LACUNA)", () => {
    expect(TEXTOS_COM_RD.filter((t) => /A CONFIRMAR|LACUNA/i.test(t))).toEqual([]);
  });

  it("a garantia promete devolução e deixa o número de vendas de fora", () => {
    expect(typeof C.GARANTIA_CONFIRMADA).toBe("boolean");
    expect(C.GARANTIA.limite).toMatch(/número de vendas/);
  });

  it("o CTA aponta para um número de WhatsApp com DDI e DDD e abre uma mensagem", () => {
    expect(C.SITE.whatsapp).toMatch(/^55\d{10,11}$/);
    for (const alvo of [C.CTA.comprar, C.CTA.duvida]) {
      const link = "href" in alvo ? alvo.href : C.linkWhatsapp(alvo.mensagem);
      expect(link.startsWith(`https://wa.me/${C.SITE.whatsapp}?text=`)).toBe(true);
      expect(decodeURIComponent(link.split("text=")[1] ?? "")).toBe(alvo.mensagem);
    }
    expect(C.CTA.comprar.mensagem).toBe("Oi, quero assinar o Verdash CRM.");
  });

  it("cada resposta do FAQ é um bloco citável: de 30 a 75 palavras, e a primeira frase já responde", () => {
    const fora = C.FAQ.filter((f) => palavras(f.r) < 30 || palavras(f.r) > 75).map(
      (f) => `${f.p} (${palavras(f.r)} palavras)`,
    );
    expect(fora).toEqual([]);
    // Sem rodeio de abertura: a resposta não repete a pergunta nem começa por "Sim," vazio.
    expect(C.FAQ.filter((f) => /^(sim|não),?\s*$/i.test(f.r.split(".")[0] ?? ""))).toEqual([]);
  });

  it("o texto exigido pela verificação do Google está inteiro (nome, o que faz, Agenda, Ads)", () => {
    const g = `${C.GOOGLE.texto}`;
    expect(g).toMatch(/Google Agenda/);
    expect(g).toMatch(/Google Ads/);
    // O trecho termina em "descrito na" e o rodapé completa com o link da Política de Privacidade.
    expect(g).toMatch(/descrito na$/);
    expect(C.HERO.texto).toMatch(/Verdash CRM/);
  });

  it("o llms.txt e o llms-full.txt nascem do mesmo conteúdo da página", () => {
    const resumo = llmsResumo();
    const completo = llmsCompleto();
    for (const f of C.FAQ) {
      expect(resumo).toContain(f.p);
      expect(completo).toContain(f.r);
    }
    expect(completo).toContain(C.HERO.texto);
    expect(completo.length).toBeGreaterThan(resumo.length);
  });
});
