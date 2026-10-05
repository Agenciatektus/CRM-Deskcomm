import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AMOSTRAGEM_DE_REPLAY, TAXA_DE_TRACES_PADRAO, taxaDeTraces } from "@/lib/sentry/amostragem";

/**
 * Item 15 da auditoria de desempenho: o que o navegador paga por observabilidade
 * e validação.
 */

describe("amostragem do Sentry", () => {
  it("replay: nenhuma sessão por amostra, toda sessão com erro", () => {
    expect(AMOSTRAGEM_DE_REPLAY).toEqual({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1 });
  });

  it("traces: 10% por padrão, ajustável por env, sempre 0 na comunidade", () => {
    expect(TAXA_DE_TRACES_PADRAO).toBe(0.1);
    expect(taxaDeTraces(undefined, false)).toBe(0.1);
    expect(taxaDeTraces("", false)).toBe(0.1);
    expect(taxaDeTraces("0.25", false)).toBe(0.25);
    expect(taxaDeTraces("0", false)).toBe(0);
    expect(taxaDeTraces("1", false)).toBe(1);
    expect(taxaDeTraces("0.5", true)).toBe(0);
  });

  it("valor fora de 0..1 ou ilegível cai no padrão (\"10\" não vira 100%)", () => {
    for (const v of ["10", "-1", "abc", "1.5"]) expect(taxaDeTraces(v, false)).toBe(0.1);
  });

  it("os três inits usam a política, sem taxa fixa", () => {
    const ler = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    const cliente = ler("instrumentation-client.ts");
    expect(cliente).toContain("...AMOSTRAGEM_DE_REPLAY");
    expect(cliente).toContain("SENTRY_TRACES_SAMPLE_RATE");
    expect(cliente).not.toMatch(/replaysSessionSampleRate:/);
    for (const f of ["instrumentation-client.ts", "sentry.server.config.ts", "sentry.edge.config.ts"]) {
      expect(ler(f), f).toMatch(/tracesSampleRate:\s*taxaDeTraces\(/);
    }
  });
});

describe("zod sem os ~50 idiomas no bundle", () => {
  /**
   * `patches/zod@4.6.5.patch` troca o índice de idiomas por `essenciais.js`. O
   * Turbopack não descarta o namespace `z.locales`, então todo idioma do zod ia
   * para o JS inicial de todas as telas (medido no chunk compartilhado do login
   * e da inbox). Se o patch deixar de ser aplicado (bump do zod sem refazer o
   * patch), este teste acusa.
   */
  it("só en, es e pt existem em z.locales", () => {
    expect(Object.keys(z.locales).sort()).toEqual(["en", "es", "pt"]);
  });

  it("pt continua disponível e produz mensagem em português", () => {
    const pt = z.locales.pt();
    expect(typeof pt.localeError).toBe("function");
    const r = z.string().safeParse(1, { error: pt.localeError });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/inválid|esperado/i);
  });
});
