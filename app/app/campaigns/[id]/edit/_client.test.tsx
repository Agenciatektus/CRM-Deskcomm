// app/app/campaigns/[id]/edit/_client.test.tsx
/**
 * O AVISO DO TETO NA PRÉVIA DA EDIÇÃO (#2402, #2404).
 *
 * A mesma ponta da tela de criação, com a carga real por trás: o `truncado`
 * de `buscarCandidatos` só protege o operador se a edição — que é onde uma
 * campanha grande é conferida de novo — também mostrar o recibo.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditarCampanha } from "./_client";

const previa = vi.hoisted(() => ({
  isPending: false,
  mutate: vi.fn(),
  data: {
    total: 20_001,
    elegiveis: 500,
    excluidos: 0,
    motivos: {} as Record<string, number>,
    truncado: false,
    amostra: [] as Array<{ nome: string | null; motivo: string | null }>,
    legenda: {} as Record<string, string>,
  },
}));

const CAMPANHA: Record<string, unknown> = {
  id: "c1",
  name: "Reativação de clientes parados",
  status: "draft",
  channel_session_id: "",
  base_legal: "consent",
  lia_ref: null,
  audience_filter: { com_alguma_tag: ["vip"], limite: 100 },
  message_body: "Oi {{nome}}",
  pipeline_id: null,
  stage_id: null,
  agent_id: null,
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/campanhas/useCampanhas", () => ({
  useCampanha: () => ({ data: CAMPANHA, isLoading: false }),
  useEditarCampanha: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviaDaAudiencia: () => previa,
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  useChannelSessions: () => ({ data: [], isLoading: false }),
  channelLabel: (c: { display_name?: string | null }) => c.display_name ?? "Número sem nome",
}));
vi.mock("@/hooks/campanhas/useDestinoDaCampanha", () => ({
  useFunis: () => ({ data: [], isLoading: false }),
  useEtapas: () => ({ data: [], isLoading: false }),
  useAgentesPublicados: () => ({ data: [], isLoading: false }),
}));

const AVISO = /bateu o teto de 20\.000 negócios desta prévia/;

describe("prévia da edição de campanha: o aviso do teto de 20.000", () => {
  beforeEach(() => {
    previa.data.truncado = false;
    previa.isPending = false;
  });

  it("recorte truncado: a edição mostra o aviso", async () => {
    previa.data.truncado = true;
    render(<EditarCampanha id="c1" />);
    expect(await screen.findByText(AVISO)).toBeInTheDocument();
  });

  it("recorte inteiro: nenhum aviso", async () => {
    render(<EditarCampanha id="c1" />);
    expect(await screen.findByDisplayValue("Reativação de clientes parados")).toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });
});

describe("edição: hidratação dos critérios de compra", () => {
  it("filtro antigo, sem os campos novos, abre vazio sem quebrar", async () => {
    render(<EditarCampanha id="c1" />);
    const campos = await screen.findAllByLabelText("Gasto total mínimo (R$)");
    expect(campos[0]).toHaveValue("");
    expect(campos[1]).toHaveValue("");
  });

  it("filtro com excluir preenchido hidrata os campos", async () => {
    CAMPANHA.audience_filter = {
      com_alguma_tag: ["vip"],
      ultima_compra_ha_dias_min: 60,
      gasto_min_centavos: 15000,
      excluir: { ultima_compra_ha_dias_max: 30, compras_min: 2 },
      limite: 100,
    };
    render(<EditarCampanha id="c1" />);
    const min = await screen.findAllByLabelText("Última compra há pelo menos (dias)");
    expect(min[0]).toHaveValue(60);
    expect(screen.getAllByLabelText("Gasto total mínimo (R$)")[0]).toHaveValue("150,00");
    expect(screen.getAllByLabelText("Última compra há no máximo (dias)")[1]).toHaveValue(30);
    expect(screen.getAllByLabelText("Pelo menos N compras")[1]).toHaveValue(2);
  });
});
