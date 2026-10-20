/**
 * AÇÕES EM MASSA NA TELA DE TAGS — seleção por linha, "selecionar todas" e a
 * barra com Excluir, Juntar e Cor (pedido do Peterson, 20/10/2026).
 *
 * Mede o caminho do CLIQUE e o corpo que sai para
 * `POST /api/v1/tags/vocabulario/lote`, inclusive o corte em blocos de 50
 * (`LOTE_MAXIMO_DE_ETIQUETAS`) e a parada na primeira recusa. A rota tem o
 * próprio teste (`tags-vocabulario-lote-rota.test.ts`).
 *
 *     npx vitest run tests/unit/tags-acoes-em-lote.test.tsx
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InventarioDeTags, LinhaDeVocabulario } from "@/lib/schemas/tags";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PainelDeTags } from "@/app/app/settings/tags/_painel";
import { aplicarEmBlocos } from "@/app/app/settings/tags/_lote";
import { selectDaEscolha } from "@/tests/unit/helpers/controles-do-ds";

const linha = (tag: string, extra: Partial<LinhaDeVocabulario> = {}): LinhaDeVocabulario => ({
  tag,
  uso_em_contatos: 0,
  uso_em_leads: 0,
  uso_em_conversas: 0,
  em_regras: 0,
  cor: null,
  descricao: null,
  no_vocabulario: true,
  ...extra,
});

const A = linha("ddd-11", { uso_em_contatos: 332, no_vocabulario: false });
const B = linha("ddd-21", { uso_em_contatos: 10, uso_em_leads: 2 });
const C = linha("vip", { uso_em_conversas: 4, em_regras: 1 });

function montar(tags: LinhaDeVocabulario[] = [A, B, C], sugestoes: InventarioDeTags | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PainelDeTags tags={tags} idioma="pt-BR" sugestoes={sugestoes} />
    </QueryClientProvider>,
  );
}

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
const corpos = () =>
  fetchMock().mock.calls.map(([url, init]) => ({ url, corpo: JSON.parse((init as { body: string }).body) }));

function responderLote(dados: Record<string, number> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { tags } = JSON.parse(init.body) as { tags: string[] };
      return new Response(
        JSON.stringify({ data: { concluidas: tags.length, contatos: 0, leads: 0, conversas: 0, regras: 0, ...dados } }),
        { status: 200 },
      );
    }),
  );
}

const marcar = (tag: string) => fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar ${tag}` }));
const barra = () => document.querySelector("[data-lote-de-etiquetas]") as HTMLElement | null;

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  responderLote();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("seleção", () => {
  it("a barra só aparece com alguma etiqueta marcada, e diz quantas", () => {
    montar();
    expect(barra()).toBeNull();
    marcar("ddd-11");
    marcar("vip");
    expect(barra()?.textContent).toContain("2 etiqueta(s) selecionada(s)");
  });

  it("⭐ 'selecionar todas' marca todas, fica parcial com uma desmarcada, e desmarca tudo", () => {
    montar();
    const todas = screen.getByRole("checkbox", { name: "Selecionar todas as etiquetas" }) as HTMLInputElement;
    fireEvent.click(todas);
    expect(barra()?.getAttribute("data-lote-de-etiquetas")).toBe("3");
    expect(todas.checked).toBe(true);

    marcar("ddd-21");
    expect(todas.checked).toBe(false);
    expect(todas.indeterminate).toBe(true);

    fireEvent.click(todas); // parcial → marca o resto
    expect(barra()?.getAttribute("data-lote-de-etiquetas")).toBe("3");
    fireEvent.click(todas); // todas → nenhuma
    expect(barra()).toBeNull();
  });

  it("'Limpar seleção' esvazia a barra", () => {
    montar();
    marcar("vip");
    fireEvent.click(within(barra()!).getByRole("button", { name: "Limpar seleção" }));
    expect(barra()).toBeNull();
  });

  it("a etiqueta `cliente` reservada pela agenda não tem caixa", () => {
    const inventario = {
      conversa: { canonicas: [], arquivadas: [] },
      contato: { canonicas: [], arquivadas: [] },
      cliente_pela_agenda: true,
    } as unknown as InventarioDeTags;
    montar([A, linha("cliente", { uso_em_contatos: 5 })], inventario);
    expect(screen.queryByRole("checkbox", { name: "Selecionar cliente" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar todas as etiquetas" }));
    expect(barra()?.getAttribute("data-lote-de-etiquetas")).toBe("1");
  });
});

describe("Excluir em lote", () => {
  it("⭐ confirma com as somas na frente e manda as marcadas para a rota do lote", async () => {
    responderLote({ contatos: 342, leads: 2 });
    montar();
    marcar("ddd-11");
    marcar("ddd-21");
    fireEvent.click(within(barra()!).getByRole("button", { name: "Excluir" }));

    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.textContent).toContain("Excluir 2 etiqueta(s)?");
    expect(dialogo.textContent).toContain("Somadas, elas estão em 342 contato(s), 2 lead(s) e 0 conversa(s).");
    expect(dialogo.textContent).not.toContain("regra(s) de agente");
    expect(fetchMock()).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Excluir 2" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Etiquetas excluídas: 2. Removidas de 344 registro(s)."),
    );
    expect(corpos()).toEqual([
      { url: "/api/v1/tags/vocabulario/lote", corpo: { acao: "excluir", tags: ["ddd-11", "ddd-21"] } },
    ]);
    expect(barra()).toBeNull();
  });

  it("avisa as regras de agente que continuam escrevendo as etiquetas", () => {
    montar();
    marcar("vip");
    fireEvent.click(within(barra()!).getByRole("button", { name: "Excluir" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Atenção: 1 regra(s) de agente");
  });

  it("⭐ mais de 50 selecionadas vão em blocos de 50, em sequência", async () => {
    const muitas = Array.from({ length: 120 }, (_, i) => `t${String(i).padStart(3, "0")}`);
    const resultado = await aplicarEmBlocos("excluir", muitas, {});
    expect(resultado.ok).toBe(true);
    expect(corpos().map((c) => c.corpo.tags.length)).toEqual([50, 50, 20]);
    expect(resultado.total.concluidas).toBe(120);
  });

  it("para no primeiro bloco recusado e conta o que já foi aplicado", async () => {
    let chamada = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        chamada += 1;
        if (chamada === 1)
          return new Response(JSON.stringify({ data: { concluidas: 50 } }), { status: 200 });
        return new Response(
          JSON.stringify({ error: { code: "forbidden", details: { concluidas: 7, tag: "t057" } } }),
          { status: 403 },
        );
      }),
    );
    const muitas = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const resultado = await aplicarEmBlocos("excluir", muitas, {});
    expect(resultado.ok).toBe(false);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    if (!resultado.ok) expect(resultado.recusa).toEqual({ codigo: "forbidden", concluidas: 57 });
  });
});

describe("Juntar e Cor em lote", () => {
  it("⭐ juntar manda as marcadas para o destino escolhido, sem o destino como origem", async () => {
    montar();
    marcar("ddd-11");
    marcar("ddd-21");
    marcar("vip");
    fireEvent.click(within(barra()!).getByRole("button", { name: "Juntar" }));
    const dialogo = screen.getByRole("dialog");
    const destino = within(dialogo).getByLabelText("Etiqueta de destino");
    fireEvent.change(destino.tagName === "BUTTON" ? selectDaEscolha(destino) : destino, {
      target: { value: "vip" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 etiqueta(s) juntada(s) em vip."));
    expect(corpos()[0]).toEqual({
      url: "/api/v1/tags/vocabulario/lote",
      corpo: { acao: "juntar", tags: ["ddd-11", "ddd-21"], destino: "vip" },
    });
  });

  it("juntar sem destino não deixa confirmar", () => {
    montar();
    marcar("ddd-11");
    fireEvent.click(within(barra()!).getByRole("button", { name: "Juntar" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("⭐ cor manda o tom escolhido para todas as marcadas", async () => {
    montar();
    marcar("ddd-11");
    marcar("vip");
    fireEvent.click(within(barra()!).getByRole("button", { name: "Cor" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Âmbar" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Cor atualizada em 2 etiqueta(s)."));
    expect(corpos()[0]?.corpo).toEqual({ acao: "definir_cor", tags: ["ddd-11", "vip"], cor: "#ffb224" });
  });
});
