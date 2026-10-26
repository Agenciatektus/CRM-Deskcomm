import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type * as ModuloDeEnv from "@/lib/env";
import { env } from "@/lib/env";
import { deriveVideoText } from "@/lib/messaging/media/video-derive";
import {
  chaveRecusadaPeloProvedor,
  podeDescerDeDegrau,
  decidirTranscricao,
} from "@/lib/messaging/media/escada-de-transcricao";

// Instalação COM serviço de transcrição (a chave da Tektus).
vi.mock("@/lib/env", async (importOriginal) => {
  const real = await importOriginal<typeof ModuloDeEnv>();
  return {
    env: {
      ...real.env,
      TRANSCRIPTION_API_KEY: "chave-da-instalacao-de-controle",
      TRANSCRIPTION_MODEL: "",
      TRANSCRIPTION_BASE_URL: "",
      TRANSCRIPTION_LANGUAGES: "",
    },
  };
});

const GEMINI = { provider: "google", apiKey: "chave-google", modelId: "gemini-3.5-flash" } as const;
const openai = async () => "chave-openai";

describe("escada de transcrição: o que é da organização vem primeiro, o OpenRouter da Tektus por último (26/10)", () => {
  it("Gemini com credencial PRÓPRIA vence o serviço da instalação", async () => {
    const d = await decidirTranscricao({ conversa: { ...GEMINI, credencialPropria: true }, chaveOpenai: openai });
    expect(d.origem).toBe("modelo_da_organizacao");
  });

  it("org com chave OpenAI própria e modelo sem audio usa a OpenAI dela, não o serviço", async () => {
    const d = await decidirTranscricao({
      conversa: { provider: "anthropic", apiKey: "k", modelId: "claude-sonnet-5", credencialPropria: true },
      chaveOpenai: openai,
    });
    expect(d.origem).toBe("padrao_openai_compativel");
  });

  it("org sem nada que ouça (só assinatura ChatGPT) cai no serviço da instalação", async () => {
    const d = await decidirTranscricao({
      conversa: { provider: "openai", apiKey: "k", modelId: "gpt-5", credencialPropria: true },
      chaveOpenai: async () => null,
    });
    expect(d.origem).toBe("servico_da_instalacao");
    expect(await d.proxima!()).toBeNull();
  });

  it("chave da instalação no chat NÃO conta como própria: vai direto ao serviço", async () => {
    const d = await decidirTranscricao({
      conversa: { ...GEMINI, credencialPropria: false },
      chaveOpenai: async () => null,
    });
    expect(d.origem).toBe("servico_da_instalacao");
  });

  it("cascata A → B → C, uma vez por degrau, sem laço", async () => {
    const a = await decidirTranscricao({ conversa: { ...GEMINI, credencialPropria: true }, chaveOpenai: openai });
    expect(a.origem).toBe("modelo_da_organizacao");
    const b = await a.proxima!();
    expect(b?.origem).toBe("padrao_openai_compativel");
    const c = await b!.proxima!();
    expect(c?.origem).toBe("servico_da_instalacao");
    expect(await c!.proxima!()).toBeNull();
  });
});

describe("chaveRecusadaPeloProvedor", () => {
  it("reconhece 401/403 do SDK e do transcriber, e nada além", () => {
    expect(chaveRecusadaPeloProvedor(Object.assign(new Error("x"), { statusCode: 401 }))).toBe(true);
    expect(chaveRecusadaPeloProvedor(new Error("transcription_403"))).toBe(true);
    expect(chaveRecusadaPeloProvedor(new Error("transcription_500"))).toBe(false);
    expect(chaveRecusadaPeloProvedor(Object.assign(new Error("x"), { statusCode: 429 }))).toBe(false);
    expect(chaveRecusadaPeloProvedor(null)).toBe(false);
  });

  it("podeDescerDeDegrau também aceita 429, 5xx e tempo esgotado", () => {
    expect(podeDescerDeDegrau(Object.assign(new Error("x"), { statusCode: 429 }))).toBe(true);
    expect(podeDescerDeDegrau(Object.assign(new Error("x"), { statusCode: 503 }))).toBe(true);
    expect(podeDescerDeDegrau(new Error("transcription_502"))).toBe(true);
    expect(podeDescerDeDegrau(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe(true);
    expect(podeDescerDeDegrau(Object.assign(new Error("x"), { statusCode: 400 }))).toBe(false);
  });
});

describe("P1-1: a chave OpenAI própria vai para api.openai.com com whisper-1", () => {
  it("com as envs de produção (OpenRouter) preenchidas, o degrau B anuncia whisper-1, e não openai/whisper-1", async () => {
    const e = env as unknown as Record<string, string>;
    const antes = { ...e };
    e.TRANSCRIPTION_BASE_URL = "https://openrouter.ai/api/v1";
    e.TRANSCRIPTION_MODEL = "openai/whisper-1";
    try {
      const b = await decidirTranscricao({ conversa: null, chaveOpenai: openai });
      expect(b.origem).toBe("padrao_openai_compativel");
      expect(b.anuncio.modelId).toBe("whisper-1");
      const c = await b.proxima!();
      expect(c?.origem).toBe("servico_da_instalacao");
      expect(c?.anuncio.modelId).toBe("openai/whisper-1");
    } finally {
      Object.assign(e, antes);
    }
  });
});

describe("imagem não consulta a OpenAI da org", () => {
  it("sem o thunk na entrada, o degrau B não é consultado e a cascata termina no serviço", async () => {
    const thunk = vi.fn(async () => "chave-openai");
    const d = await decidirTranscricao({ conversa: null });
    expect(thunk).not.toHaveBeenCalled();
    expect(d.origem).toBe("servico_da_instalacao");
    expect(await d.proxima!()).toBeNull();
  });
});

describe("P2-1: vídeo propaga o erro da transcrição quando o worker pede", () => {
  const runFfmpeg = async (args: string[], cwd: string) => {
    if (args.includes("audio.ogg")) {
      await mkdir(cwd, { recursive: true });
      await writeFile(join(cwd, "audio.ogg"), Buffer.from("x"));
    }
  };
  const transcriber = {
    transcribe: async () => {
      throw Object.assign(new Error("boom"), { statusCode: 503 });
    },
  };
  const describeImage = async () => "";

  it("com subirErroDaTranscricao, o erro chega ao worker", async () => {
    await expect(
      deriveVideoText(Buffer.from("v"), { transcriber, describeImage, runFfmpeg, subirErroDaTranscricao: podeDescerDeDegrau }),
    ).rejects.toThrow("boom");
  });

  it("sem ele, continua engolindo (comportamento de sempre)", async () => {
    await expect(deriveVideoText(Buffer.from("v"), { transcriber, describeImage, runFfmpeg })).resolves.not.toThrow();
  });
});
