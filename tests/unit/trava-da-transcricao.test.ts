import { describe, expect, it, vi } from "vitest";

import {
  DURACAO_MAXIMA_DA_TRANSCRICAO_SEGUNDOS,
  duracaoDeclaradaPeloCanal,
  MOTIVO_AUDIO_LONGO_DEMAIS,
  MOTIVO_AUDIO_SEM_DURACAO_GRANDE_DEMAIS,
  TETO_DE_BYTES_SEM_DURACAO,
  travaDaTranscricao,
} from "@/lib/messaging/media/trava-da-transcricao";
import { anexoDe } from "@/lib/channels/verdash/protobuf";

const pequeno = Buffer.alloc(10);
const doCanal = (seconds: number) => ({ provider_attachments: [{ type: "audio", seconds }] });

describe("trava de duração da transcrição", () => {
  it("o limite é 10 minutos, num lugar só", () => {
    expect(DURACAO_MAXIMA_DA_TRANSCRICAO_SEGUNDOS).toBe(600);
    expect(TETO_DE_BYTES_SEM_DURACAO).toBe(3 * 1024 * 1024);
  });

  it("controle: 9 min declarados e 9 min medidos passam — e o arquivo é medido mesmo assim", async () => {
    const medir = vi.fn(async () => 540);
    const v = await travaDaTranscricao({ audio: pequeno, metadata: doCanal(540), medir });
    expect(v).toEqual({ passa: true, segundos: 540, fonte: "arquivo" });
    expect(medir).toHaveBeenCalledTimes(1);
  });

  it("⭐ P1 da #253: `seconds: 5` declarado com 11 min medidos no arquivo é barrado", async () => {
    const v = await travaDaTranscricao({ audio: pequeno, metadata: doCanal(5), medir: async () => 660 });
    expect(v).toEqual({ passa: false, segundos: 660, fonte: "arquivo", motivo: MOTIVO_AUDIO_LONGO_DEMAIS });
  });

  it("⭐ `seconds: 5` declarado, ffprobe que falha e 4 MB: o teto de bytes vale, a declaração não", async () => {
    const v = await travaDaTranscricao({
      audio: Buffer.alloc(4 * 1024 * 1024),
      metadata: doCanal(5),
      medir: async () => null,
    });
    expect(v.passa).toBe(false);
    expect(v.fonte).toBe("tamanho");
  });

  it("⭐ 11 min declarados pelo canal são barrados sem medir, com motivo legível", async () => {
    const medir = vi.fn();
    const v = await travaDaTranscricao({ audio: pequeno, metadata: doCanal(660), medir });
    expect(medir).not.toHaveBeenCalled();
    expect(v).toEqual({ passa: false, segundos: 660, fonte: "canal", motivo: MOTIVO_AUDIO_LONGO_DEMAIS });
    expect(MOTIVO_AUDIO_LONGO_DEMAIS).toBe("áudio maior que 10 min não é transcrito");
  });

  it("sem duração do canal, mede o arquivo: 11 min barra, 9 min passa", async () => {
    expect((await travaDaTranscricao({ audio: pequeno, medir: async () => 660 })).passa).toBe(false);
    expect(await travaDaTranscricao({ audio: pequeno, medir: async () => 540 })).toEqual({
      passa: true,
      segundos: 540,
      fonte: "arquivo",
    });
  });

  it("⭐ sem duração nenhuma e acima de 3 MB: barra pelo tamanho", async () => {
    const grande = Buffer.alloc(TETO_DE_BYTES_SEM_DURACAO + 1);
    const v = await travaDaTranscricao({ audio: grande, metadata: {}, medir: async () => null });
    expect(v).toEqual({
      passa: false,
      segundos: null,
      fonte: "tamanho",
      motivo: MOTIVO_AUDIO_SEM_DURACAO_GRANDE_DEMAIS,
    });
  });

  it("controle negativo: sem duração e exatamente 3 MB ainda passa", async () => {
    const v = await travaDaTranscricao({ audio: Buffer.alloc(TETO_DE_BYTES_SEM_DURACAO), medir: async () => null });
    expect(v.passa).toBe(true);
  });

  it("duração inválida do canal é ignorada (cai na medida)", () => {
    expect(duracaoDeclaradaPeloCanal({ provider_attachments: [{ seconds: "700" }] })).toBeNull();
    expect(duracaoDeclaradaPeloCanal({ provider_attachments: [{ seconds: 0 }] })).toBeNull();
    expect(duracaoDeclaradaPeloCanal(null)).toBeNull();
  });

  it("o FZAP grava o `seconds` do audioMessage no anexo, e só quando é número", () => {
    expect(anexoDe({ audioMessage: { mimetype: "audio/ogg", seconds: 42 } }, {})).toEqual(
      expect.objectContaining({ type: "audio", seconds: 42 }),
    );
    expect(anexoDe({ audioMessage: { mimetype: "audio/ogg" } }, {})).not.toHaveProperty("seconds");
  });
});
