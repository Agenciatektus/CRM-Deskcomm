"use client";

import { AttachmentPreviewDialog } from "@/components/inbox/composer/AttachmentPreviewDialog";
import { ContactPickerDialog } from "@/components/inbox/composer/ContactPickerDialog";
import type { useCreateNote } from "@/hooks/inbox/useCreateNote";
import type { useSendMessage } from "@/hooks/inbox/useSendMessage";
import type { DestinoDoUpload, useUploadMedia } from "@/hooks/inbox/useUploadMedia";

interface Props {
  conversationId: string;
  currentContactId?: string | null;
  pendingFile: File | null;
  /** O modo em que o arquivo foi ESCOLHIDO (ver `pendingEm` no Composer). */
  pendingEm: "reply" | "note";
  limparArquivo: () => void;
  contactPickerOpen: boolean;
  setContactPickerOpen: (aberto: boolean) => void;
  send: ReturnType<typeof useSendMessage>;
  upload: ReturnType<typeof useUploadMedia>;
  createNote: ReturnType<typeof useCreateNote>;
}

/**
 * Os dois diálogos do composer: a prévia do anexo e o seletor de contato.
 *
 * Saíram de `Composer.tsx` na fase 3.5 sem mudar comportamento. As mutações
 * continuam sendo as do Composer (vêm por prop): o `isPending` do upload trava
 * o campo lá, e duas instâncias do mesmo hook discordariam sobre isso.
 */
export function DialogosDoComposer({
  conversationId, currentContactId, pendingFile, pendingEm, limparArquivo,
  contactPickerOpen, setContactPickerOpen, send, upload, createNote,
}: Props) {
  return (
    <>
      <AttachmentPreviewDialog
        file={pendingFile}
        sending={upload.isPending || send.isPending || createNote.isPending}
        onCancel={limparArquivo}
        onSend={async (caption) => {
          if (!pendingFile) return;
          // A BIFURCAÇÃO (#1863, F3) — e ela é decidida pelo modo CONGELADO NA
          // ESCOLHA (`pendingEm`), não pelo modo de agora.
          //
          //   reply  → upload em `whatsapp-media` + `useSendMessage`: exatamente
          //            o que era antes, byte por byte. Nada aqui mudou para o
          //            cliente.
          //   note   → upload em `internal-media` + `useCreateNote`, com o trio
          //            como `anexo`. Não existe passo de envio: a nota não é
          //            mensagem, não tem `type`, não tem destino no WhatsApp.
          //
          // O `try/catch` continua cobrindo SÓ o upload (falha de gravação da
          // nota é tratada pelo onError do próprio hook, e o diálogo fica aberto
          // nos dois casos).
          const destino: DestinoDoUpload = pendingEm === "note" ? "nota" : "mensagem";
          try {
            const uploaded = await upload.mutateAsync({ conversationId, file: pendingFile, destino });
            if (destino === "nota") {
              createNote.mutate(
                {
                  conversation_id: conversationId,
                  body: caption,
                  anexo: {
                    storage_path: uploaded.storage_path,
                    media_mime: uploaded.media_mime,
                    media_size_bytes: uploaded.media_size_bytes,
                  },
                },
                { onSuccess: limparArquivo },
              );
              return;
            }
            send.mutate(
              {
                conversation_id: conversationId,
                type: uploaded.kind,
                body: caption || undefined,
                media_storage_path: uploaded.storage_path,
                media_mime: uploaded.media_mime,
                media_size_bytes: uploaded.media_size_bytes,
              },
              { onSuccess: limparArquivo },
            );
          } catch {
            // toast já disparado pelo onError de useUploadMedia; dialog fica aberto p/ retry
            return;
          }
        }}
      />
      <ContactPickerDialog
        open={contactPickerOpen}
        onOpenChange={setContactPickerOpen}
        excludeContactId={currentContactId}
        sending={send.isPending}
        onPick={(payload) => {
          send.mutate(
            {
              conversation_id: conversationId,
              type: "contact",
              metadata: payload.contactId
                ? { shared_contact_id: payload.contactId }
                : { shared_contact: { name: payload.name, phone_number: payload.phone_number } },
            },
            { onSuccess: () => setContactPickerOpen(false) },
          );
        }}
      />
    </>
  );
}
