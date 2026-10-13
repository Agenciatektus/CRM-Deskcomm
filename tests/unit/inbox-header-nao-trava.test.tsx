import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConversationHeader } from "@/components/inbox/ConversationHeader";

/**
 * CATRACA: o header do inbox não pode voltar a travar a largura da tela.
 *
 * ## O defeito, medido
 *
 * A barra de ações deste header era `shrink-0`. Como ela não encolhia nem
 * quebrava, o `min-content` do header inteiro era **707px** — e a coluna do
 * meio do inbox é `1fr`, que é `minmax(auto, 1fr)` e não encolhe abaixo do
 * conteúdo. Resultado: o painel de CRM ficava **311px fora da viewport em
 * 1280px**. Em uma resolução de trabalho comum, o atendente não via contexto
 * nenhum do cliente.
 *
 * ## Por que este teste é o que é (e o que ele NÃO é)
 *
 * Este teste olha CLASSE, não pixel — e isso é uma limitação declarada, não um
 * descuido: `min-content`, quebra de flex e resolução de grid são cálculo de
 * layout, e o jsdom não tem engine de layout. Medir largura aqui devolveria
 * zero em tudo e passaria feliz: verde por ausência de motor.
 *
 * A medição de verdade é `tests/sonda-inbox-cabe-na-tela.ts`, que roda num
 * browser e afere as 5 larguras. Esta catraca existe porque aquela sonda não
 * roda no CI, e a regressão específica — alguém devolver `shrink-0` à barra de
 * ações "para os botões não quebrarem" — é textual e barata de pegar.
 *
 * Se um dia o CI ganhar um passo de browser, este arquivo pode morrer em favor
 * da sonda. Enquanto isso, ele é a única coisa entre a regressão e a main.
 */

vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  // O header passou a importar `useArchiveConversation` do MESMO módulo (issue
  // #923). Um dublê fechado que não acompanha a nova exportação não falha com
  // "faltou mock": falha com "useArchiveConversation is not a function", que
  // não fala nada do que este arquivo vigia.
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// O nome do módulo importa: a primeira versão deste arquivo mockava
// "useResumeAi", que NÃO EXISTE — o real é `useResumeAiAttendance`. O teste
// passou assim mesmo (o hook verdadeiro rodou sob o provider), ou seja, o mock
// não mockava nada e ninguém era avisado. Mock de caminho inexistente é ruído
// que parece cobertura.
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
// O header monta o discador (`DialButton`), que exige o `VoiceCallProvider` do
// shell autenticado. Aqui só a largura importa: o discador fica fora da conta.
vi.mock("@/components/voice/DialButton", () => ({ DialButton: () => null }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  useAuth: () => ({ user: { id: "u-1" }, activeOrg: { orgId: "org-1", role: "manager" } }),
}));

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: "ct-1",
  status: "open",
  assigned_to_user_id: null,
  assignee_kind: "ai",
  snooze_until: null,
  tags: [],
  contacts: { id: "ct-1", display_name: "Fulana", name: null, phone_number: "5511999" },
} as unknown as React.ComponentProps<typeof ConversationHeader>["conversation"];

function renderHeader(conv = conversation) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConversationHeader conversation={conv} />
    </QueryClientProvider>,
  );
}

// A barra é achada pelo testid, não por índice: o visual v2 (fase 3.2) tirou o
// selo do automático da coluna das ações e o levou para a faixa de status.
function barraDeAcoes() {
  const barra = screen.getByTestId("acoes-da-conversa");
  expect(barra, "a barra de ações não renderizou").toBeTruthy();
  return barra;
}

describe("header do inbox — não trava a largura da tela", () => {
  it("a barra de ações NÃO é shrink-0 — era isso que impunha o piso de 707px", () => {
    renderHeader();
    // Guarda de vacuidade: sem header renderizado, todas as asserções abaixo
    // passariam por não haver o que verificar.
    expect(screen.getByTestId("cabecalho-da-conversa"), "o header não renderizou").toBeTruthy();
    for (const el of [barraDeAcoes()]) {
      expect(
        el.className.split(/\s+/),
        "`shrink-0` de volta na barra de ações: o header volta a travar em 707px e o painel de CRM sai da tela em 1280px",
      ).not.toContain("shrink-0");
      expect(el.className).toContain("min-w-0");
    }
  });

  it("o header pode reorganizar em vez de esconder ação", () => {
    renderHeader();
    const header = screen.getByTestId("cabecalho-da-conversa");
    const acoes = barraDeAcoes();
    // As duas pontas: o container quebra E a barra quebra internamente. Só uma
    // das duas não basta — sem a de dentro, a barra desce inteira e continua
    // pedindo a largura toda.
    expect(header.className).toContain("flex-wrap");
    expect(acoes.className).toContain("flex-wrap");
    expect(acoes.className).toContain("min-w-0");
  });

  it("as ações do fluxo de atendimento continuam À VISTA no header", () => {
    renderHeader();
    // O visual v2 criou o menu "Mais", mas só para o que é leitura ou exceção
    // (buscar, pausar, arquivar, ver contato). Se alguém "resolver" o aperto
    // levando Assumir, Transferir ou Fechar para dentro dele, este caso reprova:
    // esconder ação de quem atende é pior que uma segunda linha.
    const barra = barraDeAcoes();
    for (const rotulo of ["Assumir", "Transferir conversa", "Lembrar depois", "Fechar conversa"]) {
      const botao = screen.getByRole("button", { name: rotulo });
      expect(barra.contains(botao), `a ação "${rotulo}" sumiu da barra`).toBe(true);
    }
  });

  it("com o selo do automático, nenhuma ação some e o selo não divide linha com nome nem ações (#1625)", () => {
    // O defeito do #1625: o selo morava na linha do nome, alargava a identidade
    // e jogava a barra inteira para baixo. O conserto recusado escondia ações
    // num menu "Mais ações"; o aceito tira o selo das duas linhas.
    renderHeader({
      ...conversation,
      assigned_to_user_id: "u-1",
      assigned_to_user_name: "Eu",
      assignee_kind: "user",
      bot_silenced_until: new Date(Date.now() + 10 * 60_000).toISOString(),
    } as typeof conversation);

    const selo = screen.getByTestId("badge-atendimento-humano");
    expect(selo.textContent).toBe("Automático volta em instantes");

    const barra = barraDeAcoes();
    expect(barra.contains(selo), "o selo voltou para a linha das ações").toBe(false);
    const linhaDoNome = screen.getByRole("heading", { name: "Fulana" }).parentElement as HTMLElement;
    expect(linhaDoNome.contains(selo), "o selo voltou para a linha do nome").toBe(false);

    for (const rotulo of ["Liberar", "Devolver à IA", "Transferir conversa", "Lembrar depois", "Fechar conversa"]) {
      const botao = screen.getByRole("button", { name: rotulo });
      expect(barra.contains(botao), `a ação "${rotulo}" saiu da barra`).toBe(true);
    }
    // Arquivar foi para o "Mais" (visual v2): continua a um clique, dentro da barra.
    const mais = screen.getByRole("button", { name: "Mais ações" });
    expect(barra.contains(mais), "o menu Mais saiu da barra").toBe(true);
  });

  it('"Ver contato" existe no DOM e só se cala onde há outra porta', async () => {
    renderHeader();
    // Mora no menu "Mais" desde o visual v2, e continua NO markup: some por CSS a
    // partir de `xl`, a largura em que o painel lateral entra na tela com um "Ver
    // contato" próprio. Remover do DOM tiraria a ação de quem usa 1024px, onde o
    // painel não existe e esta é a única porta para o contato.
    await userEvent.setup().click(screen.getByRole("button", { name: "Mais ações" }));
    const link = (await screen.findByText("Ver contato")).closest("a, button") as HTMLElement;
    expect(link, "o link para o contato sumiu do markup").toBeTruthy();
    const classes = `${link.className} ${link.parentElement?.className ?? ""}`;
    expect(
      classes,
      "sem `xl:hidden`, a duplicata volta e o header ganha uma segunda linha em 1280px",
    ).toContain("xl:hidden");
  });
});
