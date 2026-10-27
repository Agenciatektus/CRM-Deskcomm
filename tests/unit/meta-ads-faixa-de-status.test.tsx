import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PainelDeStatusMeta } from "@/app/app/settings/meta-ads/_painel-de-status";
import { FormularioDeMetaAds } from "@/app/app/settings/meta-ads/_form";
import { DIAS_DE_AVISO_DE_VENCIMENTO } from "@/lib/plataformas-de-anuncio/meta/oauth/validade";

const base = {
  nome: "Ana Souza",
  via: "oauth" as const,
  empresas: [
    { id: "1", name: "Loja Um" },
    { id: "2", name: "Loja Dois" },
  ],
  totalDeContas: 36,
  expiraEm: "25/11/2026",
  diasParaVencer: 40,
  precisaReconectar: false,
  oauthDisponivel: true,
  ocupado: false,
  onDesconectar: () => {},
  idioma: "pt-BR" as const,
};

describe("faixa de status da Meta", () => {
  it("conectada: nome, selo, números e ações, sem aviso", () => {
    const h = renderToStaticMarkup(<PainelDeStatusMeta {...base} />);
    expect(h).toContain("Conectado como Ana Souza");
    expect(h).toContain("Conectada");
    expect(h).toContain(">36<");
    expect(h).toContain("25/11/2026");
    expect(h).toContain("Reconectar com Meta");
    expect(h).toContain("Desconectar");
    expect(h).not.toContain("meta-aviso-de-vencimento");
    expect(h).not.toContain("meta-precisa-reconectar");
    expect(h).not.toContain("Loja Um");
  });

  it("vencendo usa a constante de aviso", () => {
    const h = renderToStaticMarkup(
      <PainelDeStatusMeta {...base} diasParaVencer={DIAS_DE_AVISO_DE_VENCIMENTO - 1} />,
    );
    expect(h).toContain("Vence em breve");
    expect(h).toContain("meta-aviso-de-vencimento");
    const fora = renderToStaticMarkup(
      <PainelDeStatusMeta {...base} diasParaVencer={DIAS_DE_AVISO_DE_VENCIMENTO} />,
    );
    expect(fora).not.toContain("meta-aviso-de-vencimento");
  });

  it("vencida e precisa reconectar", () => {
    const v = renderToStaticMarkup(<PainelDeStatusMeta {...base} diasParaVencer={0} />);
    expect(v).toContain("Vencida");
    expect(v).toContain("Token venceu em");
    const r = renderToStaticMarkup(<PainelDeStatusMeta {...base} precisaReconectar />);
    expect(r).toContain("Precisa reconectar");
    expect(r).toContain("meta-precisa-reconectar");
    expect(r).not.toContain("meta-aviso-de-vencimento");
  });

  it("Ver expande a lista de empresas, recolhida por padrão", () => {
    render(<PainelDeStatusMeta {...base} />);
    const ver = screen.getByRole("button", { name: "Ver" });
    expect(ver.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Loja Um")).toBeNull();
    fireEvent.click(ver);
    expect(screen.getByRole("button", { name: "Ocultar" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Loja Um")).toBeTruthy();
  });
});

describe("tela de Meta Ads sem os blocos antigos", () => {
  const html = (extra = {}) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <FormularioDeMetaAds
          conectada
          contaPadrao={null}
          contasPermitidas={null}
          podeAmpliar
          via="oauth"
          expiraEm="25/11/2026"
          diasParaVencer={40}
          oauthDisponivel
          oauthFalta={[]}
          idioma="pt-BR"
          metaUserName="Ana"
          metaBusinesses={[{ id: "1", name: "Loja" }]}
          {...extra}
        />
      </QueryClientProvider>,
    );

  it("conectada via login: faixa e seletor, sem cartão Conectar nem campo de token", () => {
    const h = html();
    expect(h).toContain("meta-conectar");
    expect(h).toContain("Contas de anúncio deste cliente");
    expect(h).not.toContain("Escolher contas");
    expect(h).not.toContain("Token de acesso");
    expect(h).toContain("Colar outro token");
  });

  it("token colado: mantém o campo e o aviso da permissão", () => {
    const h = html({ via: "manual", metaUserName: null, metaBusinesses: [] });
    expect(h).toContain("Token de acesso");
    expect(h).toContain("Precisa da permissão ads_read.");
    expect(h).toContain("meta-substitui-manual");
  });

  it("não conectada com login Meta: só o botão Conectar", () => {
    const h = html({ conectada: false, via: null, expiraEm: null, diasParaVencer: null });
    expect(h).toContain("Conectar com Meta");
    expect(h).not.toContain("Token de acesso");
  });
});

describe("conectada por token colado sem login Meta na instalação", () => {
  it("a faixa explica o que falta e não oferece Conectar", () => {
    const h = renderToStaticMarkup(
      <PainelDeStatusMeta {...base} via="manual" nome={null} oauthDisponivel={false} oauthFalta={["META_APP_ID"]} />,
    );
    expect(h).toContain("meta-nao-configurado");
    expect(h).toContain("META_APP_ID");
    expect(h).not.toContain("Conectar com Meta");
  });
});
