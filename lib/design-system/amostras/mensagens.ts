/**
 * Uma mensagem de cada tipo que a Inbox renderiza, para a vitrine do design
 * system: os mesmos tipos que os testes da bolha (`BolhaPorTipo.test.tsx`)
 * cobrem. A mídia (imagem, figurinha, áudio) vem gerada no navegador e entra
 * por `media_signed_url`, o mesmo campo que a URL assinada usa.
 */
import type { Message } from "@/lib/types/messaging";

import { mensagem } from "./conversa";

export type ChaveDaMensagem =
  | "texto"
  | "imagem"
  | "ia"
  | "audio"
  | "video"
  | "figurinha"
  | "documento"
  | "localizacao"
  | "contato"
  | "reacao"
  | "citacao"
  | "editada"
  | "apagada"
  | "falhou"
  | "nao-suportada";

export interface MidiaDasAmostras {
  imagem: string | null;
  figurinha: string | null;
  audio: string | null;
  video: string | null;
}

export function mensagensDaVitrine(agora: number, midia: MidiaDasAmostras): Record<ChaveDaMensagem, Message> {
  const saida = { direction: "outbound" as const, sent_via: "user" as const, status: "read" };
  const texto = mensagem(1, agora, { body: "Boa tarde! Vi o anúncio do clareamento." });
  return {
    texto,
    imagem: mensagem(2, agora, {
      type: "image",
      body: "É este o resultado que eu quero.",
      media_storage_path: "amostra/sorriso.png",
      media_mime: "image/png",
      media_signed_url: midia.imagem,
    }),
    ia: mensagem(3, agora, {
      ...saida,
      sent_via: "ai",
      body: "A avaliação leva 30 minutos e não tem custo. Quer agendar?",
    }),
    audio: mensagem(4, agora, {
      type: "audio",
      media_storage_path: "amostra/audio.wav",
      media_mime: "audio/wav",
      media_signed_url: midia.audio,
      media_derived_text: "Oi, queria saber se ainda tem horário no sábado de manhã.",
    }),
    video: mensagem(5, agora, {
      type: "video",
      media_storage_path: "amostra/video.webm",
      media_mime: "video/webm",
      media_signed_url: midia.video,
    }),
    figurinha: mensagem(6, agora, {
      type: "sticker",
      media_storage_path: "amostra/figurinha.png",
      media_mime: "image/png",
      media_signed_url: midia.figurinha,
    }),
    documento: mensagem(7, agora, {
      ...saida,
      type: "document",
      media_storage_path: "amostra/Contrato_2026.pdf",
      media_mime: "application/pdf",
      media_size_bytes: 312_000,
    }),
    localizacao: mensagem(8, agora, {
      type: "location",
      body: "📍 Location",
      metadata: { location: { latitude: -23.56, longitude: -46.65 } },
    }),
    contato: mensagem(9, agora, {
      type: "contact",
      metadata: { shared_contact: { name: "Carla Dias", phone_number: "+5511977770000" } },
    }),
    reacao: mensagem(10, agora, { type: "reaction", body: "👍" }),
    citacao: mensagem(11, agora, {
      ...saida,
      body: "Tenho sábado às 10h ou às 11h30.",
      reply_to_message_id: texto.id,
    }),
    editada: mensagem(12, agora, {
      ...saida,
      body: "Tenho sábado às 10h ou às 11h30.",
      edited_at: new Date(agora - 50 * 60_000).toISOString(),
    }),
    apagada: mensagem(13, agora, { body: "Mensagem apagada pelo cliente", revoked_at: new Date(agora - 45 * 60_000).toISOString() }),
    falhou: mensagem(14, agora, {
      ...saida,
      status: "failed",
      body: "Qual horário prefere?",
      error_message: "O canal não confirmou o envio.",
    }),
    "nao-suportada": mensagem(15, agora, { body: null, metadata: { tipo_nao_suportado: "pollCreationMessage" } }),
  };
}
