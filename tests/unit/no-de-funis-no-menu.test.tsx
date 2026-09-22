/**
 * O nó "Pipeline" do menu — o único item da barra que abre em vez de navegar.
 *
 * ─── POR QUE ELE PRECISA DE TESTE PRÓPRIO ───────────────────────────────────
 *
 * Os outros itens do sidebar são destinos FIXOS: `navegacao-registry.test.ts`
 * prende a lista inteira, e esquecer um ali é vermelho na hora. Este não está
 * naquela lista — ele nasce de `crm_pipelines`, muda por organização, e some
 * quando não há funil. Nada do que já existia o alcança.
 *
 * E ele carrega um erro que já foi cometido: em 17/09 o pedido "o pipeline no
 * menu" virou um link para `/app/settings/tenant/pipelines`, que é onde se
 * CONFIGURA o funil. O pedido era `/app/pipelines/<id>`, onde se TRABALHA. As
 * duas telas falam de funil e só o verbo as separa — por isso o primeiro caso
 * abaixo prende o destino, não o rótulo.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Partial<AuthUser>; activeOrg: Partial<ActiveOrg> | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};

/** O caminho atual, trocável por teste: o nó abre sozinho dentro de um funil. */
let caminho = "/app/inbox";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => caminho,
}));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({
  toggleSidebar: vi.fn(),
}));
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: () => null,
}));

const FUNIS = [
  { id: "cb884866-edad-415e-a99f-0cb461e2933a", name: "Clientes" },
  { id: "3f584ca3-0000-4000-8000-000000000000", name: "Pedidos" },
];

function comoPapel(role: ActiveOrg["role"]) {
  authRef.user = { is_platform_admin: false };
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

afterEach(() => {
  caminho = "/app/inbox";
  cleanup();
});

describe('o nó "Pipeline" no menu', () => {
  it("leva ao QUADRO do funil, não à tela que o configura", async () => {
    // O erro de 17/09, preso: `/app/settings/tenant/pipelines` desenha colunas e
    // motivos de perda; `/app/pipelines/<id>` é onde os clientes estão.
    comoPapel("admin");
    render(<Sidebar collapsed={false} funis={FUNIS} />);

    await userEvent.click(screen.getByRole("button", { name: /Pipeline/ }));

    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute(
      "href",
      "/app/pipelines/cb884866-edad-415e-a99f-0cb461e2933a",
    );
  });

  it("começa fechado, e abre no clique", async () => {
    // Fechado por padrão porque a densidade desta barra é medida: ela já rola em
    // 900px, e dois funis abertos são duas linhas a mais em toda tela.
    comoPapel("admin");
    render(<Sidebar collapsed={false} funis={FUNIS} />);

    expect(screen.queryByRole("link", { name: "Clientes" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Pipeline/ }));
    expect(screen.getByRole("link", { name: "Clientes" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Pedidos" })).toBeVisible();
  });

  it("já vem aberto quando se está DENTRO de um funil", () => {
    // Entrar num quadro pelo ⌘K não pode fechar o ramo que contém a tela aberta:
    // o menu estaria dizendo que você está noutro lugar.
    caminho = "/app/pipelines/cb884866-edad-415e-a99f-0cb461e2933a";
    comoPapel("agent");
    render(<Sidebar collapsed={false} funis={FUNIS} />);

    expect(screen.getByRole("link", { name: "Clientes" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Pipeline/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("some quando a organização não tem funil", () => {
    // Expansor que abre vazio promete conteúdo e entrega buraco. Quem ainda não
    // tem funil chega por "Funis", que é a tela que ensina a criar o primeiro.
    comoPapel("admin");
    render(<Sidebar collapsed={false} funis={[]} />);

    expect(screen.queryByRole("button", { name: /Pipeline/ })).toBeNull();
    // E a porta que ensina continua lá.
    expect(screen.getByRole("link", { name: "Funis" })).toHaveAttribute("href", "/app/kanban");
  });

  it("aparece para quem NÃO é manager", () => {
    // A rota que lista funis exige `manager`, e foi por isso que a leitura ficou
    // no servidor. Se um dia alguém a mover para um hook do cliente, este caso
    // fica vermelho — que é exatamente o aviso que se quer.
    caminho = "/app/pipelines/cb884866-edad-415e-a99f-0cb461e2933a";
    comoPapel("agent");
    render(<Sidebar collapsed={false} funis={FUNIS} />);

    expect(screen.getByRole("link", { name: "Clientes" })).toBeVisible();
  });

  it("não aparece na barra recolhida", async () => {
    // Sem texto, um chevron sozinho não diz o que abre — e o ícone do funil já
    // está em "Funis", logo acima. Dois ícones iguais em sequência viram ruído.
    comoPapel("admin");
    render(<Sidebar collapsed={true} funis={FUNIS} />);

    expect(screen.queryByRole("button", { name: /Pipeline/ })).toBeNull();
  });

  it("o nome do funil NÃO passa pelo tradutor", () => {
    // Ele vem do banco e é escrito pelo cliente. Um funil chamado "Clientes"
    // traduzido para outro idioma viraria palavra da interface, e o operador
    // deixaria de reconhecer o que ele mesmo nomeou.
    const id = "3f584ca3-0000-4000-8000-000000000000";
    caminho = `/app/pipelines/${id}`;
    comoPapel("admin");
    // "Contatos" é palavra que o dicionário conhece e que o menu já usa: se o nome
    // do funil passasse por `t()`, sairia traduzido junto com ela.
    render(<Sidebar collapsed={false} funis={[{ id, name: "Contatos" }]} />);

    // Busca pelo HREF, e não pelo nome: o menu tem um "Contatos" de verdade logo
    // acima, e procurar por texto acharia os dois. O que se prende aqui é que o
    // link DO FUNIL carrega o nome exatamente como o cliente o escreveu.
    const doFunil = document.querySelector(`a[href="/app/pipelines/${id}"]`);
    expect(doFunil).not.toBeNull();
    expect(doFunil?.textContent).toBe("Contatos");
  });
});
