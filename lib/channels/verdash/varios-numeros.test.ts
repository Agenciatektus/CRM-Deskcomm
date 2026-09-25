/**
 * Uma organização com MAIS DE UM número conectado pela plataforma de origem.
 *
 * O defeito (25/09/2026, organização de uma loja com dois WhatsApp): a conexão
 * escolhia "o canal desta organização" ANTES de saber de qual número era o token, e
 * atualizava aquele. O segundo número trocava token, telefone e segredo do primeiro;
 * o primeiro seguia entregando no mesmo endereço com o segredo velho, e toda entrega
 * dele era recusada — 55 em vinte minutos, conversas de cliente sumindo do inbox.
 *
 * Estes casos fixam as três peças do conserto:
 *   1. qual canal existente é o número que chegou (ou nenhum → canal novo);
 *   2. quais webhooks da instância são desta instalação e saem antes do novo;
 *   3. com dois canais, a leitura "do canal" não quebra (antes: `maybeSingle` → erro).
 */
import { describe, expect, it } from "vitest";

import {
  escolherSessaoDoNumero,
  findVerdashSession,
  listVerdashSessions,
  numeroEmOutraOrganizacao,
  webhooksDestaInstalacao,
  type VerdashSession,
} from "./conectar";

function sessao(extra: Partial<VerdashSession>): VerdashSession {
  return {
    id: "s",
    instanceName: "inst",
    vinculoId: null,
    phoneNumber: null,
    displayName: null,
    status: "WORKING",
    webhookPathToken: "tok",
    hasToken: true,
    archivedAt: null,
    ...extra,
  };
}

const A = sessao({ id: "a", instanceName: "inst-a", phoneNumber: "+5513900000001", webhookPathToken: "tok-a" });
const B = sessao({ id: "b", instanceName: "inst-b", phoneNumber: "+5513900000002", webhookPathToken: "tok-b" });

describe("escolherSessaoDoNumero — qual canal é este número", () => {
  it("número NOVO numa organização que já tem outro vira canal novo (o defeito)", () => {
    expect(escolherSessaoDoNumero([A], { instanceName: "inst-b", phoneNumber: "+5513900000002" })).toBeNull();
  });

  it("o mesmo número, reconectado, é o canal que já existe", () => {
    expect(escolherSessaoDoNumero([A, B], { instanceName: "inst-b", phoneNumber: null })?.id).toBe("b");
  });

  it("instância recriada lá fora com outro nome, mesmo telefone: é o mesmo canal", () => {
    expect(
      escolherSessaoDoNumero([A, B], { instanceName: "inst-a-nova", phoneNumber: "+5513900000001" })?.id,
    ).toBe("a");
  });

  it("a instância manda sobre o telefone", () => {
    // Telefone de A, instância de B: quem responde pela linha é a instância.
    expect(
      escolherSessaoDoNumero([A, B], { instanceName: "inst-b", phoneNumber: "+5513900000001" })?.id,
    ).toBe("b");
  });

  it("sem telefone e sem instância conhecida, nada casa", () => {
    expect(escolherSessaoDoNumero([A, B], { instanceName: "outra", phoneNumber: null })).toBeNull();
  });
});

describe("webhooksDestaInstalacao — o que sai antes de registrar o novo", () => {
  const nova = "https://crm.exemplo.com/api/v1/webhooks/channel/tok-novo";

  it("leva o webhook de canal desta instalação com OUTRO token de caminho (o que ficava para trás)", () => {
    const ids = webhooksDestaInstalacao(
      [
        { id: "1", url: "https://crm.exemplo.com/api/v1/webhooks/channel/tok-velho" },
        { id: "2", url: nova },
      ],
      nova,
    );
    expect(ids).toEqual(["1", "2"]);
  });

  it("deixa o da plataforma de origem e o de qualquer outro sistema", () => {
    const ids = webhooksDestaInstalacao(
      [
        { id: "plataforma", url: "https://api.plataforma.com/functions/v1/webhook" },
        { id: "outro-caminho", url: "https://crm.exemplo.com/api/v1/webhooks/outra-coisa" },
        { id: "outra-porta", url: "https://crm.exemplo.com:8443/api/v1/webhooks/channel/x" },
      ],
      nova,
    );
    expect(ids).toEqual([]);
  });

  it("não cai em host parecido nem em userinfo (comparação por origem, não por prefixo)", () => {
    const ids = webhooksDestaInstalacao(
      [
        { id: "sufixo", url: "https://crm.exemplo.com.evil.com/api/v1/webhooks/channel/x" },
        { id: "userinfo", url: "https://crm.exemplo.com@evil.com/api/v1/webhooks/channel/x" },
        { id: "userinfo-mesmo-host", url: "https://u:p@crm.exemplo.com/api/v1/webhooks/channel/x" },
      ],
      nova,
    );
    expect(ids).toEqual([]);
  });

  it("entrada torta não derruba: sem id, sem url, url inválida", () => {
    expect(
      webhooksDestaInstalacao([{ url: nova }, { id: "x" }, { id: "y", url: "não é url" }], nova),
    ).toEqual([]);
    expect(webhooksDestaInstalacao([{ id: "1", url: nova }], "não é url")).toEqual([]);
  });
});

describe("numeroEmOutraOrganizacao", () => {
  it("reconhece a recusa do índice de instância", () => {
    expect(
      numeroEmOutraOrganizacao(
        'duplicate key value violates unique constraint "channel_sessions_verdash_instance_unique"',
      ),
    ).toBe(true);
  });

  it("outros erros não são confundidos com ele", () => {
    expect(numeroEmOutraOrganizacao("timeout")).toBe(false);
    expect(numeroEmOutraOrganizacao(null)).toBe(false);
  });
});

/** Banco falso que devolve linhas para `select … order(…)`. */
function adminComLinhas(linhas: Record<string, unknown>[]) {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => Promise.resolve({ data: linhas, error: null }),
  };
  return { from: () => q };
}

describe("leitura com dois canais na organização", () => {
  const linhas = [
    { id: "a", verdash_instance_name: "inst-a", phone_number: "+1", archived_at: "2026-09-25T00:00:00Z" },
    { id: "b", verdash_instance_name: "inst-b", phone_number: "+2", archived_at: null },
  ];

  it("lista todos", async () => {
    const s = await listVerdashSessions(adminComLinhas(linhas) as never, "org");
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("'o canal' é o primeiro ATIVO, e não erro (antes: maybeSingle com duas linhas)", async () => {
    const s = await findVerdashSession(adminComLinhas(linhas) as never, "org");
    expect(s?.id).toBe("b");
  });

  it("sem nenhum, nulo", async () => {
    expect(await findVerdashSession(adminComLinhas([]) as never, "org")).toBeNull();
  });
});
