/**
 * M2.4: a ficha do lead em tela cheia no celular e o "Criar lead" do menu da conversa
 * quando o contato não tem negócio.
 */
import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/inbox/CRMSidePanel", () => ({ CRMSidePanel: () => <section aria-label="painel do lead" /> }));
vi.mock("@/components/voice/DialButton", () => ({ DialButton: () => null, usePodeLigar: () => false }));
const comandos = vi.hoisted(() => ({ pedir: vi.fn() }));
vi.mock("@/lib/ui/comandos-da-tela", () => ({ pedir: comandos.pedir }));

import { FichaDoLeadNoCelular } from "@/components/mobile/telas/FichaDoLead";

const CONVERSA = {
  id: "c-1",
  is_group: false,
  contacts: { id: "k-1", display_name: "Maria Souza", phone_number: "+55 11 90000-0001" },
} as never;

describe("ficha do lead em tela cheia", () => {
  it("topo, ações rápidas e o painel do lead; voltar fecha", () => {
    const aoMudar = vi.fn();
    render(<FichaDoLeadNoCelular aberta aoMudar={aoMudar} conversation={CONVERSA} />);
    expect(screen.getByRole("dialog", { name: "Ficha de Maria Souza" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maria Souza" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "painel do lead" })).toBeInTheDocument();
    // Sem voz pareada, o Ligar não entra nas ações rápidas.
    expect(screen.queryByRole("button", { name: "Ligar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tarefa/ }));
    expect(comandos.pedir).toHaveBeenCalledWith("painel-proximo-passo");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(aoMudar).toHaveBeenCalledWith(false);
  });

  it("botões e abas da ficha com 44px no celular", () => {
    expect(readFileSync("components/mobile/telas/FichaDoLead.tsx", "utf8")).toContain("[&_[role=tab]]:min-h-11 [&_button]:min-h-11");
  });

  it("a Inbox usa a ficha em tela cheia só no celular (tablet: a gaveta)", () => {
    const fonte = readFileSync("components/inbox/InboxLayout.tsx", "utf8");
    expect(fonte).toMatch(/celular \? \(\s*<FichaDoLeadNoCelular/);
  });
});

describe("Criar lead no menu da conversa sem negócio", () => {
  it("o submenu oferece Criar lead a quem pode criar, e o diálogo usa o funil padrão com o contato", () => {
    const sub = readFileSync("components/inbox/menu/SubmenuDoFunil.tsx", "utf8");
    expect(sub).toMatch(/onDialogo\(\{ tipo: "criar-lead" \}\)/);
    // O submenu só existe para quem escreve (a régua de POST /leads).
    expect(readFileSync("components/inbox/menu/ConteudoDoMenu.tsx", "utf8")).toMatch(/regras\.funil && c\?\.id/);
    const dialogos = readFileSync("components/inbox/menu/DialogosDoMenu.tsx", "utf8");
    expect(dialogos).toMatch(/useDefaultPipeline\(true\)/);
    expect(dialogos).toMatch(/contactId=\{contactId\}/);
  });
});
