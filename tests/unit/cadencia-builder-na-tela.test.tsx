import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O BUILDER DA CADÊNCIA NA TELA.
 *
 *   1. adicionar passo cria o tipo certo, com id que não colide;
 *   2. subir/descer reordena (é o que muda a ordem da régua no grafo);
 *   3. etapa de PERDA não é oferecida em "mover para" — a publicação a recusa;
 *   4. inserir variável põe o marcador no texto (com fallback no primeiro nome,
 *      o jeito de a régua não travar em cadastro sem nome).
 */
const traduzir = Object.assign((texto: string) => texto, { t: (texto: string) => texto });
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => traduzir }));

import { ListaDePassos } from "@/components/cadencia/ListaDePassos";
import { PassoMensagem } from "@/components/cadencia/PassoMensagem";
import type { PassoDaCadencia } from "@/lib/cadencia/timeline";

const etapas = [
  { id: "e-ativa", name: "Tentativa 2", is_lost: false },
  { id: "e-perdida", name: "Perdido", is_lost: true },
];

describe("lista de passos", () => {
  it("adicionar mensagem e espera cria os tipos certos com ids distintos", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ListaDePassos passos={[]} onChange={onChange} etapas={etapas} />);
    fireEvent.click(screen.getByRole("button", { name: /Mensagem/ }));
    const comMensagem = onChange.mock.calls.at(-1)![0] as PassoDaCadencia[];
    expect(comMensagem).toEqual([{ id: "passo-1", tipo: "mensagem", variantes: [""] }]);

    rerender(<ListaDePassos passos={comMensagem} onChange={onChange} etapas={etapas} />);
    fireEvent.click(screen.getByRole("button", { name: /Espera/ }));
    const comEspera = onChange.mock.calls.at(-1)![0] as PassoDaCadencia[];
    expect(comEspera.map((p) => [p.id, p.tipo])).toEqual([
      ["passo-1", "mensagem"],
      ["passo-2", "espera"],
    ]);
  });

  it("descer o 1º passo troca a ordem", () => {
    const onChange = vi.fn();
    const passos: PassoDaCadencia[] = [
      { id: "a", tipo: "mensagem", variantes: ["oi"] },
      { id: "b", tipo: "espera", duracaoMs: 3_600_000 },
    ];
    render(<ListaDePassos passos={passos} onChange={onChange} etapas={etapas} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Descer passo" })[0]!);
    expect((onChange.mock.calls.at(-1)![0] as PassoDaCadencia[]).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("mover para: etapa de perda não aparece como opção", () => {
    render(
      <ListaDePassos passos={[{ id: "m", tipo: "mover_etapa", stageId: "e-ativa" }]} onChange={vi.fn()} etapas={etapas} />,
    );
    const opcoes = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toContain("Tentativa 2");
    expect(opcoes).not.toContain("Perdido");
  });

  it("novo passo 'mover de etapa' já nasce numa etapa válida (nunca a de perda)", () => {
    const onChange = vi.fn();
    render(<ListaDePassos passos={[]} onChange={onChange} etapas={[etapas[1]!, etapas[0]!]} />);
    fireEvent.click(screen.getByRole("button", { name: /Mover de etapa/ }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual([{ id: "passo-1", tipo: "mover_etapa", stageId: "e-ativa" }]);
  });
});

describe("passo de mensagem", () => {
  it("inserir {{primeiro_nome}} já vem com fallback", () => {
    const onChange = vi.fn();
    render(<PassoMensagem variantes={["Oi "]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "{{primeiro_nome}}" }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual(["Oi {{primeiro_nome|tudo bem}}"]);
  });

  it("adicionar variação cria uma nova, vazia, sem mexer na primeira", () => {
    const onChange = vi.fn();
    render(<PassoMensagem variantes={["Oi"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Variação/ }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual(["Oi", ""]);
  });
});
