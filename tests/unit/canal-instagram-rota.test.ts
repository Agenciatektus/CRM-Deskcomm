// ─── A rota que conecta o Instagram ────────────────────────────────────────
//
// O que se cobra aqui não é "a rota respondeu 200". São três coisas que, se
// saírem erradas, produzem uma conexão que PARECE boa:
//
// 1. A sessão é gravada como INSTAGRAM. O vínculo é por instância e o mesmo
//    código de pareamento serve aos dois canais — então gravar pelo caminho do
//    WhatsApp funcionaria, responderia 200, e só apareceria depois, quando
//    `capabilitiesOf()` prometesse janela e mídia que o Instagram não tem.
//
// 2. O webhook aponta para o endereço configurado desta instalação, e a rota
//    RECUSA quando não há um. A versão do canal hospedado documenta o vetor:
//    esta URL é persistida e vira entrega recorrente, então aceitar um endereço
//    vindo da requisição faria a plataforma passar a entregar as mensagens
//    daquela conta — com o segredo do webhook junto — para onde o chamador
//    mandasse.
//
// 3. Nada é gravado quando a troca do código falha. Gravar antes e descobrir
//    depois é o que faz o operador achar que conectou.
//
// A rota é importada DENTRO de cada chamada, depois dos `vi.mock` — importá-la
// no topo carregaria os módulos reais antes dos dublês.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { findInstagramSession, saveInstagramSession, trocarCodigoHospedado } from "@/lib/channels/connect";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: vi.fn(async () => false) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_admin: unknown, valor: string) => `cifrado:${valor}`),
}));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: (texto: string) => texto }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.test" } }));
vi.mock("@/lib/channels/connect", () => ({
  INSTAGRAM_CHANNEL_LABEL: "Instagram",
  HOSTED_CHANNEL_LABEL: "NomeDaPlataforma",
  findInstagramSession: vi.fn(async () => null),
  // A rota decide a conta DEPOIS da troca, entre as que a organização já tem.
  listInstagramSessions: vi.fn(async () => []),
  escolherSessaoHospedada: vi.fn(() => null),
  saveInstagramSession: vi.fn(async () => ({ error: null })),
  trocarCodigoHospedado: vi.fn(),
}));

const ORG = "11111111-1111-4111-8111-111111111111";

function comoAdmin() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: ORG, name: "Clinica Exemplo" },
  } as never);
}

function trocaBoa() {
  vi.mocked(trocarCodigoHospedado).mockResolvedValue({
    ok: true,
    vinculoId: "v1",
    instanceName: "inst-1",
    token: "token-de-maquina",
    phoneNumber: null,
    displayName: "@clinica",
    connected: true,
    recebimentoLigado: true,
    recebimentoAviso: null,
  } as never);
}

async function conectar(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/channels/instagram/route");
  return POST(
    new NextRequest("http://localhost/api/v1/channels/instagram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findInstagramSession).mockResolvedValue(null);
  vi.mocked(saveInstagramSession).mockResolvedValue({ error: null });
});

describe("conectar o Instagram", () => {
  it("grava a sessão pelo caminho do INSTAGRAM, sem número de telefone", async () => {
    comoAdmin();
    trocaBoa();

    const res = await conectar({ codigo: "XK4P9T2MQW" });
    expect(res.status).toBe(200);

    // A chamada existe, e é a de Instagram — não a do canal hospedado.
    expect(saveInstagramSession).toHaveBeenCalledTimes(1);
    const gravado = vi.mocked(saveInstagramSession).mock.calls[0]![1];

    // Instagram não tem número. Gravar um herdado do outro canal faria a tela
    // exibir um telefone que ninguém pode discar.
    expect(gravado.phoneNumber).toBeNull();
    expect(gravado.organizationId).toBe(ORG);
    expect(gravado.instanceName).toBe("inst-1");
    expect(gravado.vinculoId).toBe("v1");
    // A credencial de máquina é gravada CIFRADA, nunca em claro.
    expect(gravado.tokenEncrypted).toBe("cifrado:token-de-maquina");
    expect(gravado.webhookSecretEncrypted).toMatch(/^cifrado:/);
  });

  it("o segredo que viaja é o mesmo que fica gravado, e não volta na resposta", async () => {
    comoAdmin();
    trocaBoa();

    const res = await conectar({ codigo: "XK4P9T2MQW" });
    const enviado = vi.mocked(trocarCodigoHospedado).mock.calls[0]![0];
    const gravado = vi.mocked(saveInstagramSession).mock.calls[0]![1];

    // Se estes dois divergirem, a plataforma assina com um segredo e o CRM
    // confere contra outro: toda entrega vira 401 e o canal "conectado" não
    // recebe nada.
    expect(gravado.webhookSecretEncrypted).toBe(`cifrado:${enviado.segredo}`);

    const corpo = JSON.stringify(await res.json());
    expect(corpo).not.toContain(enviado.segredo);
    expect(corpo).not.toContain("token-de-maquina");
  });

  it("o webhook aponta para o endereço desta instalação", async () => {
    comoAdmin();
    trocaBoa();

    await conectar({ codigo: "XK4P9T2MQW" });
    const enviado = vi.mocked(trocarCodigoHospedado).mock.calls[0]![0];
    expect(enviado.webhookUrl).toMatch(
      /^https:\/\/crm\.exemplo\.test\/api\/v1\/webhooks\/channel\/[a-f0-9]{32}$/,
    );
  });

  it("código recusado não grava nada", async () => {
    comoAdmin();
    vi.mocked(trocarCodigoHospedado).mockResolvedValue({
      ok: false,
      reason: "código inválido ou expirado",
    } as never);

    const res = await conectar({ codigo: "XK4P9T2MQW" });
    expect(res.status).toBe(422);
    expect(saveInstagramSession).not.toHaveBeenCalled();
  });

  it("recusa o pedido sem código, e o corpo estranho não passa", async () => {
    comoAdmin();
    trocaBoa();

    expect((await conectar({})).status).toBe(422);
    // `.strict()`: campo desconhecido é sinal de chamador confuso, e aceitar
    // em silêncio esconderia o engano.
    expect((await conectar({ codigo: "XK4P9T2MQW", token: "abc" })).status).toBe(422);
    expect(trocarCodigoHospedado).not.toHaveBeenCalled();
  });

  it("o estado diz a REDE e a PLATAFORMA separadamente", async () => {
    // Os dois vinham do mesmo campo, e a tela montava "Na Instagram, abra
    // Integrações › Conectar ao CRM" — mandando o operador procurar o código
    // dentro do próprio Instagram. A rede é o que ele conecta; a plataforma é
    // quem emite o código.
    comoAdmin();
    vi.mocked(findInstagramSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/channels/instagram/route");
    const corpo = (await (await GET()).json()) as { data: Record<string, unknown> };

    expect(corpo.data.label, "a rede que se conecta").toBe("Instagram");
    expect(corpo.data.plataforma, "onde o código é gerado").toBe("NomeDaPlataforma");
    expect(corpo.data.plataforma).not.toBe(corpo.data.label);
  });

  it("quem não é dono da conta não conecta canal", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);

    const res = await conectar({ codigo: "XK4P9T2MQW" });
    expect(res.status).toBe(403);
    expect(trocarCodigoHospedado).not.toHaveBeenCalled();
  });
});
