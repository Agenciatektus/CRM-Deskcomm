"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { format } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { Note as NoteIcon, Trash } from "@/lib/ui/icons";
import type { Note } from "@/lib/types/messaging";

import { AudioPlayer } from "@/components/inbox/media/AudioPlayer";
import { DocumentCard } from "@/components/inbox/media/DocumentCard";
import { ImageMedia } from "@/components/inbox/media/ImageMedia";
import { VideoMedia } from "@/components/inbox/media/VideoMedia";
import { kindFromMime } from "@/lib/messaging/media/upload-validation";

/**
 * O anexo da nota interna (#1863, F3).
 *
 * A URL é a da ROTA DA NOTA, não a de mensagem: `/notes/{id}/media` devolve um
 * 302 para signed URL de 60 s no bucket `internal-media`. Um anexo de nota não
 * tem `messages.id`, e servir pela rota de mensagem seria servir pelo caminho
 * que leva ao cliente.
 *
 * O tipo não vem do banco: `conversation_notes` guarda só o mime GRAVADO, e
 * `kindFromMime` é o MESMO corte que decidiu se o upload era aceito — o que
 * renderiza é necessariamente o que passou pela validação. Mime que a função não
 * conhece cai em documento, o fallback que sempre dá para baixar o arquivo.
 */
export function NoteMedia({ note }: { note: Note }) {
  const t = useT();
  if (!note.media_storage_path) return null; // nota só de texto
  const src = `/api/v1/conversations/${note.conversation_id}/notes/${note.id}/media`;
  switch (kindFromMime(note.media_mime ?? "") ?? "document") {
    case "image":
      return (
        <div className="mt-1.5">
          <ImageMedia messageId={note.id} src={src} alt={t("Imagem da nota interna")} />
        </div>
      );
    case "video":
      return (
        <div className="mt-1.5">
          <VideoMedia messageId={note.id} src={src} />
        </div>
      );
    case "audio":
      return (
        <div className="mt-1.5">
          <AudioPlayer messageId={note.id} src={src} isOutbound={false} />
        </div>
      );
    default:
      return (
        <div className="mt-1.5">
          <DocumentCard
            messageId={note.id}
            src={src}
            mime={note.media_mime}
            sizeBytes={note.media_size_bytes}
            storagePath={note.media_storage_path}
            isOutbound={false}
          />
        </div>
      );
  }
}

interface Props {
  note: Note;
  onDelete?: () => void;
}

/**
 * Onda 5.2: nota interna inline no thread — nunca vai ao cliente.
 *
 * Visual v2 (fase 3.5): ela fica do NOSSO lado do fio (é o time falando), com
 * borda tracejada no tom de aviso, a mesma linguagem da caixa do composer em
 * "Nota interna". Quem escreveu e o "só o time vê" vão acima da bolha, como o
 * nome das mensagens; a hora fica dentro, no canto, como em toda bolha.
 */
export function NoteCard({ note, onDelete }: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const time = format(new Date(note.created_at), "HH:mm", { locale: localeDaData });

  return (
    <div className="group flex w-full min-w-0 justify-end px-4 pt-3">
      <div className="flex min-w-0 max-w-[min(80%,36rem)] flex-col items-end">
        <p className="mx-2 mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning-fg">
          <NoteIcon size={12} weight="fill" aria-hidden />
          <span>{note.created_by_name ?? t("Alguém")}</span>
          <span aria-hidden>·</span>
          <span>{t("Nota interna · só o time vê")}</span>
        </p>
        <div
          data-testid="nota-interna"
          className="relative min-w-0 max-w-full rounded-2xl rounded-br-md border border-dashed border-warning/60 bg-warning-bg px-3 py-1.5 text-sm leading-normal text-text"
        >
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              // Visível onde não há hover (toque) e no foco do teclado; com mouse,
              // aparece ao passar por cima, sem disputar a leitura da nota.
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full border border-border bg-surface text-text-muted shadow-xs transition-opacity hover:text-destructive [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={t("Excluir nota")}
            >
              <Trash size={12} weight="bold" />
            </button>
          )}
          <NoteMedia note={note} />
          {/* Nota só de anexo (imagem colada sem legenda) chega com `body` vazio:
              renderizar o `<p>` assim mesmo deixaria um parágrafo fantasma de
              altura nula entre o arquivo e a hora. Com texto, a hora flutua no
              fim da última linha (espaçador invisível), como nas mensagens. */}
          {note.body ? (
            <>
              <p className="whitespace-pre-wrap wrap-anywhere">
                {note.body}
                <span aria-hidden className="inline-block h-px w-10 align-baseline" />
              </p>
              <span className="absolute bottom-1.5 right-2.5 text-[0.6875rem] leading-none text-text-subtle">{time}</span>
            </>
          ) : (
            <div className="mt-1 text-right text-[0.6875rem] leading-none text-text-subtle">{time}</div>
          )}
        </div>
      </div>
    </div>
  );
}
