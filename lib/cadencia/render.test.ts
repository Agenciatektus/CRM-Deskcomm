import { describe, expect, it } from "vitest";

import {
  escolherVariante,
  primeiroNome,
  renderizarMensagemDaCadencia,
  resolverSpintax,
  variaveisCitadas,
} from "./render";

const valores = { primeiro_nome: "Maria", nome: "Maria Souza", empresa: "Ótica Lux", etapa: "Lista fria" };

describe("determinismo — o preview é o que sai", () => {
  it("mesma semente, mesmo texto, sempre", () => {
    const entrada = {
      variantes: ["Oi {{primeiro_nome}}! {Tudo bem|Como vai}?", "Olá {{primeiro_nome}}, {bom dia|boa tarde}"],
      semente: "enr-1:node-1",
      valores,
    };
    const a = renderizarMensagemDaCadencia(entrada);
    const b = renderizarMensagemDaCadencia(entrada);
    expect(a).toEqual(b);
  });

  it("sementes diferentes espalham pelas variantes (não caem todas na primeira)", () => {
    const usados = new Set<number>();
    for (let i = 0; i < 200; i += 1) usados.add(escolherVariante(`enr-${i}:n1`, 3));
    expect(usados).toEqual(new Set([0, 1, 2]));
  });

  it("uma variante só: índice 0", () => {
    expect(escolherVariante("qualquer", 1)).toBe(0);
  });
});

describe("spintax", () => {
  it("escolhe uma das alternativas e mantém o resto", () => {
    const t = resolverSpintax("Oi, {tudo bem|como vai}?", () => 0.99);
    expect(t).toBe("Oi, como vai?");
  });

  it("aninhado até o teto", () => {
    expect(resolverSpintax("{a|{b|{c|d}}}", () => 0.99)).toBe("d");
  });

  it("aninhamento acima do teto é recusado", () => {
    expect(resolverSpintax("{a|{b|{c|{d|e}}}}", () => 0)).toBeNull();
  });

  it("chave sem fechar e fechamento sem abrir são inválidos", () => {
    expect(resolverSpintax("Oi {tudo bem", () => 0)).toBeNull();
    expect(resolverSpintax("Oi tudo} bem", () => 0)).toBeNull();
  });

  it("variáveis {{x}} atravessam o spintax intactas", () => {
    expect(resolverSpintax("{Oi|Olá} {{primeiro_nome}}", () => 0)).toBe("Oi {{primeiro_nome}}");
  });

  it("barra fora de grupo é texto", () => {
    expect(resolverSpintax("24/7 | sempre", () => 0)).toBe("24/7 | sempre");
  });
});

describe("variáveis", () => {
  it("troca pelo valor do lead", () => {
    const r = renderizarMensagemDaCadencia({
      variantes: ["Oi {{primeiro_nome}}, vi a {{empresa}}."],
      semente: "s",
      valores,
    });
    expect(r).toEqual({ ok: true, texto: "Oi Maria, vi a Ótica Lux.", varianteIndex: 0 });
  });

  it("sem valor e sem fallback: FALHA ALTO, nunca 'Oi , tudo bem'", () => {
    const r = renderizarMensagemDaCadencia({
      variantes: ["Oi {{primeiro_nome}}, tudo bem?"],
      semente: "s",
      valores: {},
    });
    expect(r).toMatchObject({ ok: false, motivo: "variavel_sem_valor", faltando: ["primeiro_nome"] });
  });

  it("fallback cobre o vazio", () => {
    const r = renderizarMensagemDaCadencia({
      variantes: ["Oi {{primeiro_nome|tudo bem}}?"],
      semente: "s",
      valores: { primeiro_nome: "   " },
    });
    expect(r).toMatchObject({ ok: true, texto: "Oi tudo bem?" });
  });

  it("variável fora do contrato é recusada (typo não sai como texto vazio)", () => {
    const r = renderizarMensagemDaCadencia({ variantes: ["Oi {{nme}}"], semente: "s", valores });
    expect(r).toMatchObject({ ok: false, motivo: "variavel_desconhecida", faltando: ["nme"] });
  });

  it("valor do lead com cara de template NÃO é reinterpretado", () => {
    // Nome cadastrado como "{A|B} {{empresa}}": dado de cliente não vira comando.
    const r = renderizarMensagemDaCadencia({
      variantes: ["Oi {{nome}}"],
      semente: "s",
      valores: { nome: "{A|B} {{empresa}}", empresa: "X" },
    });
    expect(r).toMatchObject({ ok: true, texto: "Oi {A|B} {{empresa}}" });
  });

  it("lista as variáveis citadas", () => {
    expect(variaveisCitadas("{{nome}} e {{ empresa |x}} e {{nome}}")).toEqual(["nome", "empresa"]);
  });
});

describe("primeiro nome", () => {
  it("capitaliza a primeira palavra", () => {
    expect(primeiroNome("  mARIA souza")).toBe("Maria");
  });
  it("nome que não é nome de gente vira null (e cai no fallback)", () => {
    expect(primeiroNome("123 Loja")).toBeNull();
    expect(primeiroNome("")).toBeNull();
    expect(primeiroNome(null)).toBeNull();
  });
});
