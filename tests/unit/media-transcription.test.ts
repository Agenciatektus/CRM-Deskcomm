import { describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import {
  apiTranscriptionProvider,
  custoDaTranscricao,
  idiomasDaTranscricao,
  modeloDeTranscricaoEmVigor,
} from "@/lib/messaging/media/transcription";

function respostaOk() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ text: "ok" }), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

async function corpoEnviado(creds: Parameters<typeof apiTranscriptionProvider>[0]): Promise<FormData> {
  const fetchMock = respostaOk();
  await apiTranscriptionProvider(creds, fetchMock).transcribe(Buffer.from([1]), "audio/ogg");
  return fetchMock.mock.calls[0]![1].body as FormData;
}

describe("apiTranscriptionProvider", () => {
  it("POSTa multipart pro endpoint de transcrição e devolve o texto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "olá, quero comprar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = apiTranscriptionProvider({ apiKey: "sk-test" }, fetchMock);
    const text = await provider.transcribe(Buffer.from([1, 2, 3]), "audio/ogg; codecs=opus");
    expect(text).toBe("olá, quero comprar");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("propaga erro HTTP do provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const provider = apiTranscriptionProvider({ apiKey: "bad" }, fetchMock);
    await expect(provider.transcribe(Buffer.from([1]), "audio/ogg")).rejects.toThrow(/transcription_401/);
  });

  it("normaliza baseUrl em todos os formatos sem duplicar /v1 nem manter barra final", async () => {
    const cenarios = [
      { input: undefined, esperado: "https://api.openai.com/v1/audio/transcriptions" },
      { input: "https://api.openai.com", esperado: "https://api.openai.com/v1/audio/transcriptions" },
      { input: "https://api.openai.com/", esperado: "https://api.openai.com/v1/audio/transcriptions" },
      { input: "https://api.groq.com/openai/v1", esperado: "https://api.groq.com/openai/v1/audio/transcriptions" },
      { input: "https://api.groq.com/openai/v1/", esperado: "https://api.groq.com/openai/v1/audio/transcriptions" },
      { input: "http://10.0.0.1:8000/v1", esperado: "http://10.0.0.1:8000/v1/audio/transcriptions" },
      { input: "http://10.0.0.1:8000", esperado: "http://10.0.0.1:8000/v1/audio/transcriptions" },
    ];

    for (const c of cenarios) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "ok" }), { status: 200, headers: { "content-type": "application/json" } }),
      );
      const provider = apiTranscriptionProvider({ apiKey: "sk-test", baseUrl: c.input }, fetchMock);
      await provider.transcribe(Buffer.from([1]), "audio/ogg");
      expect(String(fetchMock.mock.calls[0]![0])).toBe(c.esperado);
    }
  });
});

// Medido numa loja em espanhol (26/09/2026): sem idioma declarado, `whisper-1`
// transformou um áudio sem fala em "Thanks for watching!" e um cancelamento em
// grego. O idioma tem de chegar ao serviço — e no campo que CADA modelo aceita.
describe("idioma da transcrição", () => {
  it("sem idioma configurado, o corpo não leva campo de idioma (comportamento de sempre)", async () => {
    const corpo = await corpoEnviado({ apiKey: "sk-test" });
    expect(corpo.get("model")).toBe("whisper-1");
    expect(corpo.has("language")).toBe(false);
    expect(corpo.has("languages[]")).toBe(false);
  });

  it("whisper-1 e os modelos anteriores recebem UM `language`", async () => {
    for (const model of ["whisper-1", "gpt-4o-transcribe", "whisper-large-v3"]) {
      const corpo = await corpoEnviado({ apiKey: "sk-test", model, languages: ["es", "gn"] });
      expect(corpo.getAll("language")).toEqual(["es"]);
      expect(corpo.has("languages[]")).toBe(false);
    }
  });

  it("gpt-transcribe e gpt-live-transcribe recebem a LISTA `languages[]`, nunca os dois campos", async () => {
    for (const model of ["gpt-transcribe", "gpt-live-transcribe"]) {
      const corpo = await corpoEnviado({ apiKey: "sk-test", model, languages: ["es", "gn"] });
      expect(corpo.get("model")).toBe(model);
      expect(corpo.getAll("languages[]")).toEqual(["es", "gn"]);
      expect(corpo.has("language")).toBe(false);
    }
  });

  it("TRANSCRIPTION_LANGUAGES é lido com tolerância: grafia errada fica de fora sem derrubar nada", () => {
    expect(idiomasDaTranscricao(" ES, pt ,x1,, gn")).toEqual(["es", "pt", "gn"]);
    expect(idiomasDaTranscricao("")).toEqual([]);
    expect(idiomasDaTranscricao(undefined)).toEqual([]);
  });

  it("o modelo em vigor é o do ambiente quando definido, senão whisper-1 — o mesmo para worker e tela", () => {
    const semServico = { apiKey: undefined, baseUrl: undefined };
    expect(modeloDeTranscricaoEmVigor({ ...semServico, model: undefined })).toBe("whisper-1");
    expect(modeloDeTranscricaoEmVigor({ ...semServico, model: "  " })).toBe("whisper-1");
    expect(modeloDeTranscricaoEmVigor({ ...semServico, model: "gpt-transcribe" })).toBe("gpt-transcribe");
  });

  it("modelo escrito para outro serviço (BASE_URL sem API_KEY) não vai para a OpenAI: vale whisper-1", () => {
    const groq = "https://api.groq.com/openai/v1";
    expect(modeloDeTranscricaoEmVigor({ model: "whisper-large-v3", apiKey: "", baseUrl: groq })).toBe("whisper-1");
    // Com a chave própria, o modelo vai ao serviço dele — e vale.
    expect(modeloDeTranscricaoEmVigor({ model: "whisper-large-v3", apiKey: "k", baseUrl: groq })).toBe(
      "whisper-large-v3",
    );
  });
});

describe("custo da transcrição pelo serviço (degraus 1 e 2)", () => {
  function resposta(json: unknown) {
    return vi.fn().mockResolvedValue(
      new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } }),
    );
  }

  it("⭐ `usage.cost` do OpenRouter (dólares) vira cost_cents (centavos de dólar)", async () => {
    const fetchMock = resposta({ text: "oi", usage: { cost: 0.0012 } });
    const p = apiTranscriptionProvider(
      { apiKey: "sk-or", baseUrl: "https://openrouter.ai/api/v1", model: "openai/whisper-1" },
      fetchMock,
    );
    const r = await p.transcribeComCusto!(Buffer.from([1]), "audio/ogg");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(r.texto).toBe("oi");
    expect(r.costCents).toBeCloseTo(0.12, 10);
  });

  it("sem custo, com a duração e modelo de preço conhecido: estima duração × preço por minuto", () => {
    // whisper-1: US$ 0,006/min → 90 s = US$ 0,009 = 0,9 centavo
    expect(custoDaTranscricao("whisper-1", { text: "x", usage: { type: "duration", seconds: 90 } })).toBeCloseTo(0.9, 10);
    expect(custoDaTranscricao("openai/whisper-1", { text: "x", duration: 30 })).toBeCloseTo(0.3, 10);
  });

  it("controle negativo: sem custo e sem duração → null (nunca 0)", async () => {
    const p = apiTranscriptionProvider({ apiKey: "sk" }, resposta({ text: "oi" }));
    const r = await p.transcribeComCusto!(Buffer.from([1]), "audio/ogg");
    expect(r.costCents).toBeNull();
  });

  it("duração com modelo sem preço conhecido → null, não o preço de outro modelo", () => {
    expect(custoDaTranscricao("whisper-large-v3", { usage: { seconds: 60 } })).toBeNull();
  });

  it("⭐ `usage.cost` absurdo (acima de US$ 5) vira null com aviso no log", () => {
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);
    expect(custoDaTranscricao("openai/whisper-1", { text: "segredo do cliente", usage: { cost: 50 } })).toBeNull();
    expect(aviso).toHaveBeenCalledTimes(1);
    // Sem dado sensível: o texto da transcrição não vai para o log.
    expect(JSON.stringify(aviso.mock.calls[0])).not.toContain("segredo do cliente");
    aviso.mockRestore();
  });

  it("controle negativo: no limite (US$ 5) o custo ainda vale", () => {
    expect(custoDaTranscricao("openai/whisper-1", { usage: { cost: 5 } })).toBeCloseTo(500, 10);
  });

  it("custo inválido não é aceito como custo", () => {
    expect(custoDaTranscricao("modelo-x", { usage: { cost: "0.01" } })).toBeNull();
    expect(custoDaTranscricao("modelo-x", { usage: { cost: -1 } })).toBeNull();
  });

  it("`transcribe` continua devolvendo só o texto", async () => {
    const p = apiTranscriptionProvider({ apiKey: "sk" }, resposta({ text: "só o texto", usage: { cost: 0.01 } }));
    expect(await p.transcribe(Buffer.from([1]), "audio/ogg")).toBe("só o texto");
  });
});
