import { describe, expect, it } from "vitest";

import type { MarcaDeSaida } from "@/lib/branding/saida";

import { buildEmailDoAlertaMeta } from "./alerta-meta";

const MARCA = { nome: "Verdash", logoUrl: null, accent: "#000000", accentFg: "#ffffff", origens: { nome: "padrao", cor: "padrao" } } as MarcaDeSaida;

describe("e-mail do alerta da Meta", () => {
  it("eyebrow Meta Ads, assunto com 'no {marca}' e o botão de reconectar", () => {
    const e = buildEmailDoAlertaMeta({
      titulo: "O acesso à Meta vence em 3 dias",
      corpo: "Vá em Ajustes > Meta Ads.",
      marca: MARCA,
      botao: { rotulo: "Reconectar com Meta", href: "https://crm.exemplo.com/app/settings/meta" },
      rodape: "Você recebe este aviso porque administra esta empresa.",
    });
    expect(e.subject).toBe("O acesso à Meta vence em 3 dias no Verdash");
    expect(e.html).toContain(">Meta Ads<");
    expect(e.html).toContain('href="https://crm.exemplo.com/app/settings/meta"');
    expect(e.html).toContain("Reconectar com Meta");
    expect(e.subject + e.html + e.text).not.toMatch(/[—–·]/);
  });
});
