/**
 * Abrir o menu da organização (o quadrado com a sigla no trilho) NÃO pode travar a
 * rolagem da página. O menu modal do Radix põe `data-scroll-locked` no <body> e
 * corta a rolagem; com a página rolada, a barra lateral e o topo (sticky) saíam do
 * lugar e a rolagem ficava presa depois (bug relatado pelo Peterson, 20/10).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      organizations: [
        { organization_id: "a", organization_name: "Studio Mariana Castro" },
        { organization_id: "b", organization_name: "Outra" },
      ],
      is_platform_admin: false,
      support: null,
    },
    activeOrg: { orgId: "a", name: "Studio Mariana Castro" },
  }),
}));
vi.mock("./OrganizationTransitionProvider", () => ({
  useOrganizationTransitionOpcional: () => ({ begin: vi.fn(), cancel: vi.fn() }),
}));
vi.mock("@/app/actions/shell/setActiveOrg", () => ({ setActiveOrg: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { TenantSwitcher } from "./TenantSwitcher";

describe("menu da organização no trilho", () => {
  it("abre sem travar a rolagem do <body>", async () => {
    render(<TenantSwitcher variante="trilho" />);
    const gatilho = screen.getByTestId("tenant-switcher");
    await userEvent.click(gatilho);
    expect(await screen.findByRole("menuitem", { name: /Outra/ })).toBeInTheDocument();
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});
