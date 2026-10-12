/**
 * M2.2: a folha de filtros do celular e os dois filtros novos da contagem (9049).
 *
 * Um filtro de Inbox atravessa schema, rota, query e contagem; falhar em qualquer
 * um é silencioso (ver `inbox-filtra-por-origem-do-instagram.test.ts`). Aqui:
 * - o TIPO de canal só aceita a lista fixa, e a lista o aplica em `conversations.channel`;
 * - a contagem recebe o tipo e o "só grupos" (o número da folha bate com a lista),
 *   e recusa tipo fora da lista;
 * - a folha mostra as seções do protótipo e "Ver N conversas" com o N da aba.
 */
import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { contagemCanalTipo, contagemGrupos } from "@/app/api/v1/conversations/counts/route";
import { listConversationsQuerySchema } from "@/lib/schemas/messaging";
import { TIPOS_DE_CANAL } from "@/lib/inbox/tipo-de-canal";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { FolhaDeFiltros } from "@/components/mobile/telas/FolhaDeFiltros";
import { tiposDeCanalDisponiveis } from "@/components/mobile/telas/Conversas";

describe("tipo de canal: lista fixa, do schema à contagem", () => {
  it("o schema aceita só os tipos do CHECK de conversations.channel", () => {
    for (const canal of TIPOS_DE_CANAL) expect(listConversationsQuerySchema.safeParse({ canal }).success, canal).toBe(true);
    expect(listConversationsQuerySchema.safeParse({ canal: "telegram" }).success).toBe(false);
    expect(listConversationsQuerySchema.safeParse({ canal: "whatsapp' or 1=1" }).success).toBe(false);
  });

  it("a rota da lista lê o parâmetro e o handler o aplica na coluna da conversa", () => {
    expect(readFileSync("app/api/v1/conversations/route.ts", "utf8")).toMatch(/canal: url\.searchParams\.get\("canal"\)/);
    expect(readFileSync("app/api/v1/conversations/_handler.ts", "utf8")).toMatch(/query\.eq\("channel", q\.canal\)/);
  });

  it("a contagem lê o tipo (inválido vira 422) e o só grupos", () => {
    expect(contagemCanalTipo(new URLSearchParams("canal=instagram"))).toBe("instagram");
    expect(contagemCanalTipo(new URLSearchParams(""))).toBeNull();
    expect(contagemCanalTipo(new URLSearchParams("canal=telegram"))).toBeUndefined();
    // Os três estados da lista (P2 do Cassio na #179): só grupos, sem grupos, todas.
    expect(contagemGrupos(new URLSearchParams("is_group=true"))).toBe(true);
    expect(contagemGrupos(new URLSearchParams("is_group=false"))).toBe(false);
    expect(contagemGrupos(new URLSearchParams(""))).toBeNull();
    const rota = readFileSync("app/api/v1/conversations/counts/route.ts", "utf8");
    expect(rota).toMatch(/p_canal_tipo: canalTipo/);
    expect(rota).toMatch(/p_grupos: contagemGrupos\(sp\)/);
  });

  it("a migration 9049 aplica os dois na função, que segue INVOKER e sem anon", () => {
    const mig = readFileSync("supabase/migrations/20261012120000_9049_contagem_da_folha_de_filtros.sql", "utf8");
    expect(mig).toMatch(/\(p_canal_tipo is null or c\.channel = p_canal_tipo\)/);
    expect(mig).toMatch(/\(p_grupos is null or coalesce\(c\.is_group, false\) = p_grupos\)/);
    expect(mig).toMatch(/security invoker/);
    expect(mig).toMatch(/revoke execute on function public\.fn_contagens_da_caixa\([^)]*text, boolean\) from public, anon;/);
    expect(mig).toMatch(/drop function if exists public\.fn_contagens_da_caixa\(uuid, text\[\], text\[\], uuid, text, boolean, text\[\], text, boolean\);/);
    // O baseline traz o mesmo corpo (o bloco da 9029, antes da VARREDURA anon).
    const base = readFileSync("supabase/baseline.sql", "utf8");
    expect(base).toContain("(p_canal_tipo is null or c.channel = p_canal_tipo)");
    expect(base.indexOf("(p_canal_tipo is null or c.channel = p_canal_tipo)")).toBeLessThan(
      base.indexOf("---- VARREDURA anon: função nova nasce exposta"),
    );
  });

  it("só oferece Instagram e Facebook conectados", () => {
    expect(tiposDeCanalDisponiveis(["waha"])).toEqual(["whatsapp"]);
    expect(tiposDeCanalDisponiveis(["waha", "instagram", "zernio_social"])).toEqual(["whatsapp", "instagram", "facebook"]);
  });
});

describe("folha de filtros do celular", () => {
  const VALOR = { tab: "all" as const, search: "", onlyUnread: false };
  const ABAS = [
    { value: "unassigned" as const, label: "Fila", count: 2 },
    { value: "mine" as const, label: "Minhas", count: 1 },
    { value: "all" as const, label: "Todas", count: 9 },
  ];
  const montar = (onChange = vi.fn(), aoMudar = vi.fn()) => {
    render(
      <FolhaDeFiltros
        aberta
        aoMudar={aoMudar}
        value={VALOR}
        onChange={onChange}
        abas={ABAS}
        tiposDeCanal={["whatsapp", "instagram"]}
        maisFiltros={null}
        aoLimpar={vi.fn()}
      />,
    );
    return { onChange, aoMudar };
  };

  it("as seções do protótipo e Ver N com o número da aba", () => {
    montar();
    expect(screen.getByRole("switch", { name: /Só não lidas/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("group", { name: "Canal" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Quem atende" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver 9 conversas" })).toBeInTheDocument();
  });

  it("os filtros valem na hora: canal, quem atende e só não lidas", () => {
    const { onChange, aoMudar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Instagram" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALOR, canal: "instagram" });
    fireEvent.click(screen.getByRole("button", { name: "Você" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALOR, tab: "mine" });
    fireEvent.click(screen.getByRole("switch", { name: /Só não lidas/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALOR, onlyUnread: true });
    fireEvent.click(screen.getByRole("button", { name: "Ver 9 conversas" }));
    expect(aoMudar).toHaveBeenCalledWith(false);
  });

  it("Quem atende só oferece as visões que o papel tem (sem Com a IA aqui)", () => {
    montar();
    const nomes = [...screen.getByRole("group", { name: "Quem atende" }).querySelectorAll("button")].map((b) => b.textContent);
    expect(nomes).toEqual(["Todos", "Você", "Sem dono"]);
  });
});
