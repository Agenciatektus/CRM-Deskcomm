/**
 * Onde a pessoa está: a resposta que a barra de duas colunas (qual grupo abrir)
 * e a trilha do cabeçalho ("Grupo › Página") leem do mesmo lugar.
 *
 * Os casos são os que um casamento ingênuo por prefixo erra: destinos que se
 * aninham sob o href de OUTRO grupo, e rotas que não são destino fixo.
 */
import { describe, expect, it } from "vitest";

import { destinoDaRota, grupoDaRota, rotaCasa } from "@/lib/navigation/rota-atual";

describe("rotaCasa", () => {
  it("casa o próprio href e o que está abaixo dele", () => {
    expect(rotaCasa("/app/ai/cases", "/app/ai/cases")).toBe(true);
    expect(rotaCasa("/app/ai/cases/123", "/app/ai/cases")).toBe(true);
  });

  it("prefixo solto não conta", () => {
    // `/app/ai/casesx` não é uma tela de Casos.
    expect(rotaCasa("/app/ai/casesx", "/app/ai/cases")).toBe(false);
  });
});

describe("destinoDaRota", () => {
  it("o href mais longo vence", () => {
    // Aviso no WhatsApp mora abaixo de Casos; casar o primeiro acenderia os dois.
    expect(destinoDaRota("/app/ai/cases/avisos")?.label).toBe("Aviso no WhatsApp");
    expect(destinoDaRota("/app/ai/cases/abc")?.label).toBe("Casos");
  });

  it("Evolução da IA é de Análise, embora comece com o hub de IA", () => {
    const d = destinoDaRota("/app/ai/evolution");
    expect(d?.label).toBe("Evolução da IA");
    expect(d?.group).toBe("analise");
  });

  it("Etapas do funil é do CRM, embora more abaixo de Configurações", () => {
    expect(destinoDaRota("/app/settings/tenant/pipelines")?.group).toBe("crm");
  });

  it("rota sem destino devolve null", () => {
    expect(destinoDaRota("/app/onboarding")).toBeNull();
    // O quadro de um funil não é destino fixo (o id é linha do banco).
    expect(destinoDaRota("/app/pipelines/cb884866-edad-415e-a99f-0cb461e2933a")).toBeNull();
  });
});

describe("grupoDaRota", () => {
  it("o grupo do destino mais longo, não o do hub que o contém", () => {
    expect(grupoDaRota("/app/ai/evolution")).toBe("analise");
    expect(grupoDaRota("/app/ai/agents")).toBe("ia");
  });

  it("o hub sozinho também diz o grupo", () => {
    expect(grupoDaRota("/app/crm")).toBe("crm");
    expect(grupoDaRota("/app/ai")).toBe("ia");
    expect(grupoDaRota("/app/settings")).toBe("organizacao");
  });

  it("o quadro de um funil é do CRM", () => {
    expect(grupoDaRota("/app/pipelines/cb884866-edad-415e-a99f-0cb461e2933a")).toBe("crm");
  });

  it("rota fora do registro não tem grupo", () => {
    expect(grupoDaRota("/app/onboarding")).toBeNull();
    expect(grupoDaRota("/admin")).toBeNull();
  });
});
