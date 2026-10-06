/**
 * AS SUGESTÕES NA TELA DE TAGS (9038) — estado por escopo, a etiqueta que só
 * existe como sugestão, e o clique de cada estado.
 *
 * O defeito que estes testes trancam é o "salvei e não aconteceu nada": a
 * etiqueta acrescentada como sugestão de CONTATO não aparece na leitura do
 * upstream (`fn_vocabulario_de_tags` não conhece `canonical_contact_tags`), e
 * sem a união o operador acrescentaria a palavra e não a veria na tela.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { InventarioDeTags, LinhaDeVocabulario } from "@/lib/schemas/tags";
import {
  AcrescentarEtiqueta,
  BotoesDeSugestao,
  estadoNoEscopo,
  unirComSugestoes,
} from "./_sugestoes";

const criarTag = vi.fn(async () => ({ ok: true as const, registros: 0 }));
const arquivarTag = vi.fn(async () => ({ ok: true as const, registros: 0 }));
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/app/actions/settings/curarTags", () => ({
  criarTag: (...a: unknown[]) => criarTag(...(a as [])),
  arquivarTag: (...a: unknown[]) => arquivarTag(...(a as [])),
}));

const INVENTARIO: InventarioDeTags = {
  conversa: { canonicas: ["urgente", "vip"], arquivadas: ["troca"], em_uso: [] },
  contato: { canonicas: ["inadimplente"], arquivadas: [], em_uso: [] },
  cliente_pela_agenda: false,
};

function linha(tag: string, uso = 1): LinhaDeVocabulario {
  return {
    tag,
    uso_em_contatos: uso,
    uso_em_leads: 0,
    uso_em_conversas: 0,
    em_regras: 0,
    cor: null,
    descricao: null,
    no_vocabulario: true,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("o estado de cada escopo", () => {
  it("sugerida, arquivada e fora, sem diferenciar maiúsculas", () => {
    expect(estadoNoEscopo(INVENTARIO, "conversa", "VIP")).toBe("sugerida");
    expect(estadoNoEscopo(INVENTARIO, "conversa", " troca ")).toBe("arquivada");
    expect(estadoNoEscopo(INVENTARIO, "contato", "vip")).toBe("fora");
  });
});

describe("a lista da tela", () => {
  it("a sugestão sem uso entra na lista, com zero de uso, uma vez só", () => {
    const linhas = unirComSugestoes([linha("VIP", 4)], INVENTARIO);
    const tags = linhas.map((l) => l.tag);
    // `inadimplente` só existe como sugestão de CONTATO: é o caso que a leitura
    // do upstream não devolve.
    expect(tags).toContain("inadimplente");
    expect(tags).toContain("troca");
    // `vip` já veio do vocabulário como `VIP`: não duplica.
    expect(tags.filter((t) => t.toLowerCase() === "vip")).toEqual(["VIP"]);
    const inadimplente = linhas.find((l) => l.tag === "inadimplente");
    expect(inadimplente?.uso_em_contatos).toBe(0);
  });

  it("sem inventário (leitura falhou), a lista é a do vocabulário, intacta", () => {
    const linhas = [linha("a"), linha("b")];
    expect(unirComSugestoes(linhas, null)).toBe(linhas);
  });
});

describe("o clique de cada estado", () => {
  it("sugerida arquiva, arquivada desarquiva, fora promove", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BotoesDeSugestao tag="vip" inventario={INVENTARIO} idioma="pt-BR" />);

    // vip: sugerida em conversas, fora em contatos.
    await user.click(screen.getByRole("button", { name: /^Conversas\./ }));
    expect(arquivarTag).toHaveBeenCalledWith("conversa", "vip", true);

    await user.click(screen.getByRole("button", { name: /^Contatos\./ }));
    expect(criarTag).toHaveBeenCalledWith("contato", "vip");

    rerender(<BotoesDeSugestao tag="troca" inventario={INVENTARIO} idioma="pt-BR" />);
    await user.click(screen.getByRole("button", { name: /^Conversas\./ }));
    expect(arquivarTag).toHaveBeenCalledWith("conversa", "troca", false);
  });

  it("o estado sugerida é anunciado como pressionado", () => {
    render(<BotoesDeSugestao tag="vip" inventario={INVENTARIO} idioma="pt-BR" />);
    expect(screen.getByRole("button", { name: /^Conversas\./ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Contatos\./ })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("acrescentar", () => {
  it("cria nos escopos marcados, e o botão só libera com nome e escopo", async () => {
    const user = userEvent.setup();
    render(<AcrescentarEtiqueta idioma="pt-BR" />);
    const botao = screen.getByRole("button", { name: /Acrescentar/ });
    expect(botao).toBeDisabled();

    await user.type(screen.getByLabelText("Acrescentar etiqueta"), "orçamento");
    await user.click(screen.getByLabelText("Sugerir em contatos"));
    await user.click(botao);

    expect(criarTag).toHaveBeenCalledWith("conversa", "orçamento");
    expect(criarTag).toHaveBeenCalledWith("contato", "orçamento");
  });

  it("sem escopo marcado, não cria", async () => {
    const user = userEvent.setup();
    render(<AcrescentarEtiqueta idioma="pt-BR" />);
    await user.type(screen.getByLabelText("Acrescentar etiqueta"), "x");
    await user.click(screen.getByLabelText("Sugerir em conversas"));
    expect(screen.getByRole("button", { name: /Acrescentar/ })).toBeDisabled();
  });
});
