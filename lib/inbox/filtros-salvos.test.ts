import { describe, expect, it } from "vitest";

import {
  chaveDoFiltroLembrado,
  criarFiltroSalvoSchema,
  filtrosSalvosSchema,
  haFiltroAtivo,
  lerFiltroLembrado,
  normalizarFiltros,
} from "./filtros-salvos";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("schema dos filtros salvos", () => {
  it("aceita uma combinação válida", () => {
    const f = { onlyUnread: true, tag: ["vip"], tagMode: "ou", atendimento: { funil: UUID, periodo: "7d" } };
    expect(filtrosSalvosSchema.safeParse(f).success).toBe(true);
  });

  it("recusa chave desconhecida, tipo errado e valor fora da lista", () => {
    expect(filtrosSalvosSchema.safeParse({ qualquer: 1 }).success).toBe(false);
    expect(filtrosSalvosSchema.safeParse({ onlyUnread: "sim" }).success).toBe(false);
    expect(filtrosSalvosSchema.safeParse({ canal: "telegram" }).success).toBe(false);
    expect(filtrosSalvosSchema.safeParse({ atendimento: { funil: "x" } }).success).toBe(false);
    expect(filtrosSalvosSchema.safeParse({ atendimento: { extra: 1 } }).success).toBe(false);
  });

  it("o nome tem de ter de 1 a 40 caracteres depois do trim", () => {
    const filtros = { onlyUnread: true };
    expect(criarFiltroSalvoSchema.safeParse({ nome: "   ", filtros }).success).toBe(false);
    expect(criarFiltroSalvoSchema.safeParse({ nome: "a".repeat(41), filtros }).success).toBe(false);
    expect(criarFiltroSalvoSchema.safeParse({ nome: "a".repeat(40), filtros }).success).toBe(true);
    expect(criarFiltroSalvoSchema.parse({ nome: "  Hoje ", filtros }).nome).toBe("Hoje");
  });
});

describe("normalizarFiltros", () => {
  it("descarta o que está desligado e etapa sem funil", () => {
    expect(
      normalizarFiltros({ onlyUnread: false, tag: [], atendimento: { etapas: [UUID] } }),
    ).toEqual({});
    expect(haFiltroAtivo({ onlyGroups: true })).toBe(true);
    expect(haFiltroAtivo({})).toBe(false);
  });

  it("etiqueta string vira lista", () => {
    expect(normalizarFiltros({ tag: "vip" })).toEqual({ tag: ["vip"] });
  });
});

describe("filtro lembrado", () => {
  it("lê um valor válido", () => {
    expect(lerFiltroLembrado(JSON.stringify({ onlyUnread: true }))).toEqual({ onlyUnread: true });
  });

  it.each([null, "", "{", "[]", "null", '"x"', '{"onlyUnread":"sim"}', '{"foo":1}', "{}"])(
    "ignora %s",
    (valor) => {
      expect(lerFiltroLembrado(valor)).toBeNull();
    },
  );

  it("a chave é por usuário e não aceita caractere estranho", () => {
    expect(chaveDoFiltroLembrado(UUID, "org-1")).toBe(`inbox_filtro:${UUID}:org-1`);
    expect(chaveDoFiltroLembrado("a/../b", "o/1")).toBe("inbox_filtro:ab:o1");
  });
});
