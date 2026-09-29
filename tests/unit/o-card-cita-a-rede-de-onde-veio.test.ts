/**
 * O card do funil dizia "Novo contato pelo WhatsApp" para um Direct de Instagram.
 *
 * ─── O DEFEITO, MEDIDO EM PRODUÇÃO EM 2026-09-25 ───────────────────────────
 *
 * Um Direct entrou no CRM da Delicatto às 23:09, virou conversa com
 * `conversations.channel = 'instagram'` e `instagram_entrada = 'direct'` — e
 * abriu um card chamado **"Novo contato pelo WhatsApp"**.
 *
 * A causa não foi um rótulo errado em algum lugar: foi um DEFAULT. O campo
 * `origem` de `garantirLeadDaConversa` era opcional, `aplicarEfeitosPosEntrada`
 * nunca o informava, e TODO canal caía em `ORIGEM_PADRAO`, que dizia
 * "WhatsApp" — verdade na época em que WhatsApp era o único canal, e mentira
 * desde que o Instagram entrou.
 *
 * Nada falhou quando o Instagram chegou: typecheck, testes e log ficaram
 * verdes, porque um default silencioso é indistinguível de uma escolha.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE, SEPARADO ─────────────────────────────────
 *
 * `pos-entrada-efeitos-do-canal.test.ts` mede ORDEM dos efeitos e opt-out.
 * Provei que ele não media rótulo: quebrei `origemDaRede` para devolver sempre
 * "WhatsApp" — o defeito original, exato — e os 40 casos dele passaram verdes.
 * Um teste que não reprova o defeito que motivou a mudança não está guardando
 * a mudança.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntradaDeMensagem } from "@/lib/channels/pos-entrada";
import { CHANNEL_BRAND_LABEL, type ChannelBrand } from "@/lib/channels/presentation";

const garantirLeadDaConversa = vi.fn(async () => ({ criado: true, leadId: "lead-1" }) as never);

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/leads/nascimento-do-lead", () => ({
  garantirLeadDaConversa: (...a: unknown[]) => garantirLeadDaConversa(...(a as [])),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/dev/kick-local-pipeline", () => ({
  acelerarPipelineDeEventos: vi.fn(async () => {}),
  kickLocalPipeline: vi.fn(async () => {}),
}));

/** Dublê mínimo: o que interessa aqui é o ARGUMENTO do nascimento do lead. */
const admin = {
  from() {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "update", "eq", "is", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: { id: "msg-1" }, count: 1, error: null });
    return q;
  },
  async rpc() {
    return { error: null };
  },
} as never;

const ENTRADA: EntradaDeMensagem = {
  organizationId: "org-1",
  contactId: "contato-1",
  conversationId: "conversa-1",
  messageId: "msg-1",
  channelSessionId: "sessao-1",
  texto: "oi, quanto custa?",
  nomeDoContato: "Cliente",
  requestId: "req-1",
  origem: "canal_de_teste",
  rede: "whatsapp",
};

async function rodar(rede: ChannelBrand) {
  const { aplicarEfeitosPosEntrada } = await import("@/lib/channels/pos-entrada");
  await aplicarEfeitosPosEntrada(admin, { ...ENTRADA, rede });
}

/** A origem com que o lead nasceu, como o nascimento a recebeu. */
function origemDoNascimento() {
  const chamada = garantirLeadDaConversa.mock.calls[0] as unknown as [
    unknown,
    { origem?: { rotulo?: string; source?: string; motivo?: string } },
  ];
  return chamada?.[1]?.origem;
}

beforeEach(() => {
  garantirLeadDaConversa.mockClear();
  garantirLeadDaConversa.mockResolvedValue({ criado: true, leadId: "lead-1" } as never);
});

describe("o card nasce com o nome da rede por onde a pessoa escreveu", () => {
  it("Instagram vira 'Instagram' — este é o defeito que foi visto em produção", async () => {
    await rodar("instagram");

    const origem = origemDoNascimento();
    expect(origem, "o nascimento do lead precisa RECEBER a origem, não adivinhá-la").toBeDefined();
    expect(origem!.rotulo).toBe("Instagram");
    expect(origem!.rotulo, "era isto que o card dizia em produção").not.toBe("WhatsApp");
    expect(origem!.source).toBe("instagram");
  });

  it("WhatsApp continua 'WhatsApp' — a correção não podia mexer no canal que já funcionava", async () => {
    await rodar("whatsapp");
    expect(origemDoNascimento()!.rotulo).toBe("WhatsApp");
  });

  it("Messenger também é nomeado, e não herda o canal mais comum", async () => {
    await rodar("messenger");
    expect(origemDoNascimento()!.rotulo).toBe("Messenger");
  });

  it("rede desconhecida vira 'Canal', e NÃO o canal mais comum", async () => {
    // Esta é a recusa honesta, e é o coração do conserto: chutar o mais comum é
    // exatamente como "WhatsApp" acabou num card de Instagram. Um provider que
    // ninguém mapeou tem de aparecer como não-mapeado.
    await rodar("unknown");

    const rotulo = origemDoNascimento()!.rotulo;
    expect(rotulo).toBe("Canal");
    expect(rotulo, "chutar o mais comum é o defeito, não a saída").not.toBe("WhatsApp");
  });

  it("o motivo da timeline cita a rede, não o transporte", async () => {
    // A linha da timeline explica ao operador por que o card apareceu. Citar o
    // transporte ali vazaria nome de intermediário para a tela — o que a
    // doutrina de canal proíbe e o `lint:channels` cobra.
    await rodar("instagram");

    const motivo = origemDoNascimento()!.motivo!;
    expect(motivo).toContain("Instagram");
    for (const transporte of ["waha", "zernio", "verdash", "meta_cloud", "graph.facebook.com"]) {
      expect(motivo.toLowerCase(), `o motivo não pode nomear o transporte ${transporte}`).not.toContain(
        transporte,
      );
    }
  });
});

describe("uma lista só para o nome da rede", () => {
  it("o rótulo do card sai do MESMO vocabulário do ícone do Inbox", async () => {
    // O card do funil e o ícone do Inbox descrevem a MESMA conversa. Foi a
    // segunda lista que os deixou discordar, e é a lista única que impede a
    // discordância de voltar — o mesmo remédio que a tela de Funis precisou
    // para a coluna `fontes`.
    for (const rede of ["whatsapp", "instagram", "messenger", "unknown"] as ChannelBrand[]) {
      garantirLeadDaConversa.mockClear();
      await rodar(rede);
      expect(origemDoNascimento()!.rotulo, `rede ${rede}`).toBe(CHANNEL_BRAND_LABEL[rede]);
    }
  });
});
