"use client";

import { useEffect, useState } from "react";

export interface MidiaDeExemplo {
  imagem: string | null;
  figurinha: string | null;
  audio: string | null;
  video: string | null;
}

/** Uma imagem desenhada num canvas: degradê com um círculo, sem arquivo nenhum. */
function desenhar(
  largura: number,
  altura: number,
  pintar: (ctx: CanvasRenderingContext2D) => void,
): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  pintar(ctx);
  return canvas.toDataURL("image/png");
}

/** Um segundo de silêncio em WAV (PCM 8 bits, 8 kHz), montado byte a byte. */
function silencio(): string | null {
  if (typeof URL.createObjectURL !== "function") return null;
  const amostras = 8000;
  const buffer = new ArrayBuffer(44 + amostras);
  const v = new DataView(buffer);
  const escrever = (pos: number, texto: string) =>
    [...texto].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  escrever(0, "RIFF");
  v.setUint32(4, 36 + amostras, true);
  escrever(8, "WAVE");
  escrever(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  escrever(36, "data");
  v.setUint32(40, amostras, true);
  for (let i = 0; i < amostras; i += 1) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

/**
 * Meio segundo de vídeo gravado de um canvas animado (MediaRecorder). Sem
 * isso o vídeo da amostra não teria fonte, e a bolha de vídeo cai na rota
 * `/api/v1/messages/{id}/media`, que é rede.
 */
function gravarVideo(pronto: (url: string) => void): () => void {
  if (typeof MediaRecorder === "undefined") return () => undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") return () => undefined;
  let quadro = 0;
  const pintar = () => {
    quadro += 1;
    ctx.fillStyle = `rgb(60 ${90 + (quadro % 40)} 140)`;
    ctx.fillRect(0, 0, 320, 240);
  };
  const relogio = setInterval(pintar, 50);
  const gravador = new MediaRecorder(canvas.captureStream(20));
  const partes: Blob[] = [];
  gravador.ondataavailable = (e) => partes.push(e.data);
  gravador.onstop = () => {
    clearInterval(relogio);
    const url = URL.createObjectURL(new Blob(partes, { type: gravador.mimeType || "video/webm" }));
    // Só entrega o vídeo que o navegador consegue abrir: se a bolha recebesse
    // um arquivo que falha, ela cairia na rota de mídia do servidor.
    const teste = document.createElement("video");
    teste.preload = "metadata";
    teste.onloadedmetadata = () => pronto(url);
    teste.onerror = () => URL.revokeObjectURL(url);
    teste.src = url;
  };
  gravador.start();
  const parar = setTimeout(() => gravador.state !== "inactive" && gravador.stop(), 1200);
  return () => {
    clearTimeout(parar);
    clearInterval(relogio);
  };
}

/**
 * A mídia das mensagens de exemplo, gerada no navegador: a bolha de imagem,
 * figurinha e áudio é a de verdade e precisa de um arquivo para mostrar. Nada é
 * baixado de lugar nenhum.
 */
export function useMidiaDeExemplo(): MidiaDeExemplo {
  const [midia, setMidia] = useState<MidiaDeExemplo>({
    imagem: null,
    figurinha: null,
    audio: null,
    video: null,
  });
  useEffect(() => {
    const audio = silencio();
    // Um quadro depois: o desenho no canvas não precisa atrasar a montagem.
    let video: string | null = null;
    const pararVideo = gravarVideo((url) => {
      video = url;
      setMidia((m) => ({ ...m, video: url }));
    });
    const quadro = requestAnimationFrame(() =>
      setMidia((m) => ({
        ...m,
        imagem: desenhar(600, 450, (ctx) => {
          const g = ctx.createLinearGradient(0, 0, 600, 450);
          g.addColorStop(0, "rgb(214 160 140)");
          g.addColorStop(1, "rgb(150 90 90)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 600, 450);
          ctx.fillStyle = "rgb(255 255 255 / 0.35)";
          ctx.beginPath();
          ctx.arc(200, 170, 90, 0, Math.PI * 2);
          ctx.fill();
        }),
        figurinha: desenhar(256, 256, (ctx) => {
          ctx.font = "200px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("😄", 128, 140);
        }),
        audio,
      })),
    );
    return () => {
      cancelAnimationFrame(quadro);
      pararVideo();
      if (video) URL.revokeObjectURL(video);
      if (audio) URL.revokeObjectURL(audio);
    };
  }, []);
  return midia;
}
