// ─── A ingestão do Instagram ───────────────────────────────────────────────
//
// O que se cobra aqui são as três decisões de produto que, se saírem erradas,
// não levantam erro nenhum — elas apenas produzem o comportamento errado em
// silêncio:
//
// 1. FONTE NÃO ATIVADA NÃO ENTRA. Não é filtro de tela: um filtro deixaria a
//    conversa existir, o cliente pagando armazenamento, o agente de IA vendo
//    tudo e o contador de não lidas subindo por algo que ninguém vai ler. Aqui
//    a porta fica fechada — nem contato, nem conversa, nem mensagem, nem lead.
//
// 2. COMENTÁRIO APARECE E NÃO VIRA LEAD. Quem comenta num post não pediu
//    atendimento; virar card encheria o Kanban de ruído. Mas precisa aparecer,
//    porque o que não aparece não é respondido. A diferença entre os dois é uma
//    única chamada.
//
// 3. O FUNIL VEM DA FONTE, não do `is_default`. Se o lead do Instagram nascesse
//    no funil padrão, a configuração de fontes viraria enfeite.
//
// ─── SOBRE O DUBLÊ ─────────────────────────────────────────────────────────
//
// Ele captura as escritas na fronteira do banco em vez de simular o Postgres.
// O que interessa não é o que o dublê devolve — é o que a ingestão TENTOU
// gravar, e em que ordem. Um dublê que "funciona" e não registra nada deixaria
// todas as asserções passarem por vacuidade.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { funilQueAceita } from "@/lib/leads/fontes-do-funil";
import { aplicarEfeitosPosEntrada } from "@/lib/channels/pos-entrada";
import { marcarConversaComMensagem } from "@/lib/channels/marcar-conversa";

vi.mock("@/lib/leads/fontes-do-funil", async (real) => ({
  ...(await real<typeof import("@/lib/leads/fontes-do-funil")>()),
  funilQueAceita: vi.fn(),
}));
vi.mock("@/lib/channels/pos-entrada", () => ({ aplicarEfeitosPosEntrada: vi.fn(async () => {}) }));
vi.mock("@/lib/channels/marcar-conversa", () => ({
  marcarConversaComMensagem: vi.fn(async () => {}),
}));

const ORG = "aaaaaaaa-0000-4000-8000-00000000cd01";
const SESSAO = "bbbbbbbb-0000-4000-8000-0000000000b1";
const FUNIL_DA_FONTE = "cccccccc-0000-4000-8000-0000000000c1";

interface Escrita {
  tabela: string;
  op: "insert" | "update";
  payload: Record<string, unknown>;
}

/**
 * Dublê fluente do Supabase. Registra INSERT e UPDATE por tabela, devolve
 * `null` em toda leitura (contato novo) e responde à RPC da conversa.
 */
function fazerAdmin(opcoes: { contatoExistente?: string } = {}) {
  const escritas: Escrita[] = [];
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];

  const consulta = (tabela: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit", "contains"]) q[m] = () => q;
    q.maybeSingle = async () => ({
      data: opcoes.contatoExistente && tabela === "contacts"
        ? { id: opcoes.contatoExistente }
        : null,
      error: null,
    });
    return q;
  };

  const admin = {
    from: (tabela: string) => ({
      ...consulta(tabela),
      insert: (payload: Record<string, unknown>) => {
        escritas.push({ tabela, op: "insert", payload });
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: `${tabela}-novo` }, error: null }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        escritas.push({ tabela, op: "update", payload });
        const u: Record<string, unknown> = {};
        for (const m of ["eq", "is"]) u[m] = () => u;
        return u;
      },
    }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return { data: "conversa-1", error: null };
    },
  };

  return { escritas, rpcs, admin: admin as never };
}

function envelope(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    tipo: "direct",
    provider_message_id: "mid-1",
    ad_id: null,
    evento: {
      sender: { id: "igsid-da-pessoa" },
      recipient: { id: "igid-da-conta" },
      timestamp: Date.now(),
      message: { mid: "mid-1", text: "oi, quanto custa?" },
    },
    ...over,
  });
}

function envelopeDeComentario() {
  return JSON.stringify({
    tipo: "comentario",
    provider_message_id: "comment-1",
    ad_id: null,
    evento: {
      value: {
        id: "comment-1",
        text: "que lindo!",
        from: { id: "igsid-de-quem-comentou", username: "fulana" },
        media: { id: "post-1" },
      },
    },
  });
}

async function ingerir(rawBody: string, admin: unknown) {
  const { instagramInbound } = await import("@/lib/channels/instagram/ingest");
  return instagramInbound(admin as never, {
    session: { id: SESSAO, organization_id: ORG, provider: "instagram" },
    rawBody,
    headers: new Headers(),
    secret: "nao-usado-aqui",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(funilQueAceita).mockResolvedValue(FUNIL_DA_FONTE);
});

describe("a fonte governa a entrada", () => {
  it("fonte não ativada em nenhum funil NÃO grava absolutamente nada", async () => {
    vi.mocked(funilQueAceita).mockResolvedValue(null);
    const { escritas, rpcs, admin } = fazerAdmin();

    const r = await ingerir(envelope(), admin);

    // 200, porque a fila não deve reentregar um evento deliberadamente
    // descartado — reentregar para sempre algo que nunca será processado é o
    // estrago silencioso que a rota evita.
    expect(r.ok).toBe(true);
    expect((r as unknown as { body: { reason: string } }).body.reason).toBe(
      "fonte_nao_ativada:instagram_direct",
    );

    // A PORTA: nem contato, nem mensagem, nem conversa, nem lead.
    expect(escritas, "nada pode ser gravado quando a fonte não está ativada").toEqual([]);
    expect(rpcs, "nem a conversa pode nascer").toEqual([]);
    expect(aplicarEfeitosPosEntrada).not.toHaveBeenCalled();
  });

  it("erro ao consultar os funis ESTOURA — nunca vira 'ninguém aceita'", async () => {
    // A diferença importa: "não consegui perguntar" tratado como "não aceita"
    // descartaria a mensagem em definitivo por causa de um banco lento.
    vi.mocked(funilQueAceita).mockRejectedValue(new Error("fontes_do_funil_indisponivel: timeout"));
    const { admin } = fazerAdmin();

    await expect(ingerir(envelope(), admin)).rejects.toThrow("fontes_do_funil_indisponivel");
  });
});

describe("Direct vira lead, comentário não", () => {
  it("o Direct grava a conversa e dispara o nascimento do lead NO FUNIL DA FONTE", async () => {
    const { escritas, rpcs, admin } = fazerAdmin();

    const r = await ingerir(envelope(), admin);
    expect(r.ok).toBe(true);

    // A conversa nasce pela RPC do canal certo — e não pela do WhatsApp, que
    // gravaria `channel = 'whatsapp'` e faria o Inbox mentir sobre a origem.
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0]!.nome).toBe("fn_upsert_conversa_do_instagram");
    expect(rpcs[0]!.args.p_entrada).toBe("direct");

    // O contato é ancorado no IGSID.
    const contato = escritas.find((e) => e.tabela === "contacts" && e.op === "insert");
    expect(contato?.payload.instagram_igsid).toBe("igsid-da-pessoa");

    // E o lead nasce no funil que a FONTE escolheu.
    expect(aplicarEfeitosPosEntrada).toHaveBeenCalledTimes(1);
    const efeitos = vi.mocked(aplicarEfeitosPosEntrada).mock.calls[0]![1];
    expect(efeitos.pipelineId, "o funil tem de vir da fonte, não do is_default").toBe(
      FUNIL_DA_FONTE,
    );
  });

  it("o comentário APARECE no Inbox e NÃO vira lead", async () => {
    const { escritas, rpcs, admin } = fazerAdmin();

    const r = await ingerir(envelopeDeComentario(), admin);
    expect(r.ok).toBe(true);

    // Aparece: conversa criada e mensagem gravada — é isso que o torna
    // respondível, por pessoa ou por IA.
    expect(rpcs[0]!.args.p_entrada).toBe("comentario");
    expect(escritas.some((e) => e.tabela === "messages" && e.op === "insert")).toBe(true);
    expect(marcarConversaComMensagem).toHaveBeenCalledTimes(1);

    // E não vira card no Kanban.
    expect(
      aplicarEfeitosPosEntrada,
      "comentário não pede atendimento — virar lead encheria o funil de ruído",
    ).not.toHaveBeenCalled();
  });
});

describe("o que chega duas vezes não vira duas conversas", () => {
  it("recibo de leitura é ignorado com 200, sem gravar nada", async () => {
    const { escritas, admin } = fazerAdmin();
    const r = await ingerir(JSON.stringify({ tipo: "leitura", evento: {} }), admin);
    expect(r.ok).toBe(true);
    expect(escritas).toEqual([]);
  });

  it("corpo que não é JSON não derruba a rota", async () => {
    const { admin } = fazerAdmin();
    const r = await ingerir("isto não é json", admin);
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe("invalid_json");
  });

  it("a mensagem carrega POR ONDE ela entrou, além da conversa", async () => {
    const { escritas, admin } = fazerAdmin();
    await ingerir(envelopeDeComentario(), admin);

    const msg = escritas.find((e) => e.tabela === "messages" && e.op === "insert");
    const meta = msg?.payload.metadata as Record<string, unknown>;
    // A conversa diz como NASCEU; a mensagem diz a dela. Sem isto, um
    // comentário dentro de um fio que nasceu de Direct ficaria indistinguível.
    expect(meta.instagram_entrada).toBe("comentario");
    expect(meta.instagram_media_id).toBe("post-1");
    expect(msg?.payload.external_id).toBe("comment-1");
  });
});
