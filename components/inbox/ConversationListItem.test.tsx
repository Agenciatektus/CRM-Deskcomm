/**
 * A etiqueta "Grupo" na lista de conversas.
 *
 * `conversations.is_group` já chega no `SELECT_COLS` do handler (schema
 * original) — este teste prende só a LEITURA na tela: quem abre o inbox
 * precisa distinguir uma conversa de grupo de uma individual sem abrir cada
 * uma. Props mínimas copiadas de `ConversationList.tsx`, via
 * `__fixtures__/conversa.ts`.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "./ConversationListItem";
import { conversaDeExemplo } from "./__fixtures__/conversa";

describe("ConversationListItem — etiqueta de grupo", () => {
  it("conversa de grupo tem a etiqueta Grupo", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, is_group: true }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.getByText("Grupo")).toBeInTheDocument();
  });

  it("conversa individual não tem", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, is_group: false }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.queryByText("Grupo")).toBeNull();
  });
});

/**
 * Visual v2, fase 3.1: a linha diz de relance o que pede atenção. Não lida é
 * nome em negrito, hora no accent e contador; o par de CONTROLE (lida) prende
 * que o destaque não vira o padrão de toda linha, que é como ele deixaria de
 * dizer alguma coisa.
 */
describe("ConversationListItem — não lida", () => {
  it("não lida: contador com o número, nome em negrito e hora no accent", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, unread_count_for_assignee: 3 }}
        {...conversaDeExemplo.props}
      />,
    );
    const linha = screen.getByRole("button");
    expect(linha).toHaveAttribute("data-nao-lida", "true");
    expect(screen.getByLabelText("3 mensagens não lidas")).toHaveTextContent("3");
    expect(screen.getByText("Maria")).toHaveClass("font-bold");
    expect(linha.querySelector(".tabular-nums.text-accent")).not.toBeNull();
  });

  it("CONTROLE: lida não tem contador nem destaque", () => {
    render(<ConversationListItem conversation={conversaDeExemplo.conversation} {...conversaDeExemplo.props} />);
    const linha = screen.getByRole("button");
    expect(linha).not.toHaveAttribute("data-nao-lida");
    expect(screen.queryByLabelText(/mensagens não lidas/)).toBeNull();
    expect(screen.getByText("Maria")).not.toHaveClass("font-bold");
  });
});

describe("ConversationListItem — seleção e dono", () => {
  it("selecionada: fundo accent-soft, marcador à esquerda e aria-current", () => {
    render(
      <ConversationListItem
        conversation={conversaDeExemplo.conversation}
        {...conversaDeExemplo.props}
        isSelected
      />,
    );
    const linha = screen.getByRole("button");
    expect(linha).toHaveAttribute("aria-current", "true");
    expect(linha).toHaveClass("bg-accent-soft");
    expect(linha.querySelector("span.bg-accent[aria-hidden]")).not.toBeNull();
  });

  it("o dono que é a própria pessoa aparece como Você; outro, pelo nome", () => {
    const comDono = {
      ...conversaDeExemplo.conversation,
      assigned_to_user_id: "u-1",
      assigned_to_user_name: "Ana Souza",
    };
    const { unmount } = render(
      <ConversationListItem conversation={comDono} {...conversaDeExemplo.props} mostrarAtendente meuUserId="u-1" />,
    );
    expect(screen.getByText("Você")).toBeInTheDocument();
    unmount();
    render(
      <ConversationListItem conversation={comDono} {...conversaDeExemplo.props} mostrarAtendente meuUserId="u-2" />,
    );
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.queryByText("Você")).toBeNull();
  });

  it("sem dono e sem automático no ar: Sem dono", () => {
    render(
      <ConversationListItem
        conversation={conversaDeExemplo.conversation}
        {...conversaDeExemplo.props}
        mostrarAtendente
        automaticoDaOrg={false}
      />,
    );
    expect(screen.getByText("Sem dono")).toBeInTheDocument();
  });

  it("CONTROLE: quando o dono não discrimina, a pílula não aparece", () => {
    render(<ConversationListItem conversation={conversaDeExemplo.conversation} {...conversaDeExemplo.props} />);
    expect(screen.queryByText("Sem dono")).toBeNull();
  });
});
