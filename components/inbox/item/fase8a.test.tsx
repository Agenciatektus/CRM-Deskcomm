/**
 * Visual v2, fase 8a: o que a linha da lista passa a ler do banco (migration
 * 9047), pedido na MESMA consulta da lista.
 *
 *   - L14: "Você:" / "IA:" antes da prévia (`autor_da_ultima_mensagem`);
 *   - L20: "Tarefa atrasada" em qualquer conversa aberta, "Sem próximo passo"
 *     só na conversa de quem está logado (`passo_da_conversa`), e a etiqueta
 *     saindo quando há pílula de tarefa (L21).
 *
 * Cada caso tem o seu CONTROLE: sem o campo (cache antigo, evento do realtime)
 * a linha não inventa prefixo nem pílula.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "../ConversationListItem";
import { conversaDeExemplo } from "../__fixtures__/conversa";

const EU = "user-eu";
const base = conversaDeExemplo.conversation;

function linha(extra: Partial<typeof base>, meuUserId: string | null = EU) {
  return render(
    <ConversationListItem conversation={{ ...base, ...extra }} {...conversaDeExemplo.props} meuUserId={meuUserId} />,
  );
}

describe("L14: quem escreveu a última mensagem", () => {
  it("equipe vira 'Você:' e IA vira 'IA:'", () => {
    const { unmount } = linha({ autor_da_ultima_mensagem: "equipe" });
    expect(screen.getByText("Você:")).toBeInTheDocument();
    unmount();
    linha({ autor_da_ultima_mensagem: "ia" });
    expect(screen.getByText("IA:")).toBeInTheDocument();
  });

  it("CONTROLE: mensagem do cliente, ou campo ausente, fica sem prefixo", () => {
    const { unmount } = linha({ autor_da_ultima_mensagem: "cliente" });
    expect(screen.queryByText("Você:")).toBeNull();
    expect(screen.queryByText("IA:")).toBeNull();
    unmount();
    linha({});
    expect(screen.queryByText("Você:")).toBeNull();
  });

  it("CONTROLE: sem prévia não há prefixo solto antes de 'Sem mensagens'", () => {
    linha({ autor_da_ultima_mensagem: "equipe", last_message_preview: null });
    expect(screen.queryByText("Você:")).toBeNull();
    expect(screen.getByText("Sem mensagens")).toBeInTheDocument();
  });
});

describe("L20: a pílula de tarefa", () => {
  const minha = { status: "claimed", assigned_to_user_id: EU, assignee_kind: "user" } as const;

  it("tarefa atrasada aparece em qualquer conversa aberta, e a etiqueta sai", () => {
    linha({
      passo_da_conversa: "atrasada",
      contacts: { ...base.contacts!, tags: ["vip"] },
    });
    expect(screen.getByTestId("item-passo")).toHaveTextContent("Tarefa atrasada");
    expect(screen.queryByText("vip")).toBeNull();
  });

  it("sem próximo passo só na conversa de quem está logado", () => {
    const { unmount } = linha({ ...minha, passo_da_conversa: "sem_passo" });
    expect(screen.getByTestId("item-passo")).toHaveTextContent("Sem próximo passo");
    unmount();
    // CONTROLE: a mesma conversa, de outra pessoa, não acusa nada.
    linha({ ...minha, passo_da_conversa: "sem_passo" }, "outra-pessoa");
    expect(screen.queryByTestId("item-passo")).toBeNull();
  });

  it("CONTROLE: em dia, ou sem o campo, não há pílula e a etiqueta continua", () => {
    const { unmount } = linha({ passo_da_conversa: "em_dia", contacts: { ...base.contacts!, tags: ["vip"] } });
    expect(screen.queryByTestId("item-passo")).toBeNull();
    expect(screen.getByText("vip")).toBeInTheDocument();
    unmount();
    linha({});
    expect(screen.queryByTestId("item-passo")).toBeNull();
  });
});
