"use client";
import { useT } from "@/hooks/i18n/useT";
import {
  forwardRef, useEffect, useId, useImperativeHandle, useRef, useState,
  type ClipboardEvent, type KeyboardEvent,
} from "react";
import { BarraDoComposer } from "@/components/inbox/composer/BarraDoComposer";
import { DialogosDoComposer } from "@/components/inbox/composer/DialogosDoComposer";
import { FaixaDoDono } from "@/components/inbox/composer/FaixaDoDono";
import { AbasDoComposer, AvisoDoRascunho, FaixaDaCitacao } from "@/components/inbox/composer/FaixasDoComposer";
import { ReplyReviewPanel } from "@/components/inbox/composer/ReplyReviewPanel";
import { resolveSlash, TemplateMenu } from "@/components/inbox/composer/TemplateMenu";
import { useSugestaoDeResposta } from "@/components/inbox/composer/useSugestaoDeResposta";
import { useCreateNote } from "@/hooks/inbox/useCreateNote";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { useUploadMedia } from "@/hooks/inbox/useUploadMedia";
import { imagemDoClipboard } from "@/lib/inbox/clipboard-image";
import { interpolateTemplate } from "@/lib/inbox/template-vars";
import type { AvisoDeRascunho } from "@/lib/inbox/rascunho-sugerido";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface ComposerHandle { focus: () => void }

interface Props {
  conversationId: string;
  initialDraft?: string;
  initialMode?: "reply" | "note";
  onDraftChange?: (text: string, mode: "reply" | "note") => void;
  active?: boolean;
  disabled?: boolean;
  /** Contato bloqueado ou anonimizado: a faixa diz o motivo no lugar da caixa. */
  blockedReason?: string | null;
  /** Janela de 24h fechada: barra a RESPOSTA, e só ela (a nota nunca chega ao cliente). */
  janelaFechada?: string | null;
  /** A mensagem que esta resposta CITA (escolhida no fio). `null` = envio solto. */
  respondendo?: { id: string; body: string | null; direction: string } | null;
  /** Desfaz a escolha — o `x` da faixa de citação. */
  onCancelarResposta?: () => void;
  /** Nome do contato da conversa, para interpolar {{nome}}/{{primeiro_nome}} do template escolhido. */
  contactName?: string | null;
  /** Contato da conversa — excluído do seletor de cartão compartilhado. */
  currentContactId?: string | null;
  /** Texto sugerido por integração (issue #1611): o AVISO de origem e o `draft_id`. */
  rascunho?: AvisoDeRascunho | null;
  /** Para a faixa de quem atende; sem ela o composer não afirma nada sobre o dono. */
  conversa?: ConversationWithContact | null;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  {
    conversationId, initialDraft = "", initialMode = "reply", active = true, onDraftChange, disabled,
    blockedReason, janelaFechada, contactName, currentContactId, respondendo, onCancelarResposta,
    rascunho = null, conversa = null,
  },
  ref,
) {
  const t = useT();
  const dicaId = useId();
  const [text, setText] = useState(initialDraft);
  // O aviso some no primeiro ENVIO: depois do clique o rascunho foi usado, e
  // deixar a faixa prometendo texto que já saiu seria mentira de tela.
  const [rascunhoUsado, setRascunhoUsado] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /**
   * O modo em que o arquivo foi ESCOLHIDO, congelado na escolha. Sem isto, um
   * anexo escolhido em "Nota interna" que o operador troque para "Responder"
   * antes de clicar Enviar subiria em `whatsapp-media` e iria para o cliente
   * (o defeito que a F3 da #1863 existe para não ter).
   */
  const [pendingEm, setPendingEm] = useState<"reply" | "note">("reply");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [mode, setMode] = useState<"reply" | "note">(initialMode);
  useEffect(() => {
    onDraftChange?.(text, mode);
  }, [text, mode, onDraftChange]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const send = useSendMessage();
  const upload = useUploadMedia();
  const createNote = useCreateNote();
  const templates = useMessageTemplates();
  const sugestao = useSugestaoDeResposta(conversationId, mode === "reply");
  const slash = resolveSlash(text);
  const menuOpen = mode === "reply" && slash.open && !menuDismissed;

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }));

  // send/createNote fora do disable: o texto some na hora do envio; travar o campo
  // até a API voltar impedia digitar a próxima mensagem com o campo ainda cheio.
  const isDisabled = disabled || !!blockedReason || upload.isPending;
  // A janela só alcança o que SAI. Em modo nota o composer segue liberado.
  const respostaBarrada = isDisabled || (mode === "reply" && !!janelaFechada);
  const campoBarrado = mode === "note" ? isDisabled : respostaBarrada;

  /** Escolhe o arquivo e MARCA o modo da escolha (ver `pendingEm`). */
  function escolherArquivo(file: File) {
    setPendingFile(file);
    setPendingEm(mode);
  }

  function autoresize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  /** Põe `trecho` no cursor (ou no fim) e devolve o foco ao campo. */
  function inserir(trecho: string) {
    const ta = taRef.current;
    if (!ta) {
      setText((atual) => atual + trecho);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    setText(text.slice(0, start) + trecho + text.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + trecho.length;
      autoresize();
    });
  }

  function handleSubmit() {
    const body = text.trim();
    if (!body || campoBarrado) return;
    setText("");
    requestAnimationFrame(() => autoresize());
    const restoreOnError = () => {
      // Se a pessoa já começou a próxima resposta, preserve os dois textos.
      setText((current) => (current ? `${body}\n${current}` : body));
      requestAnimationFrame(() => autoresize());
    };
    if (mode === "note") {
      createNote.mutate({ conversation_id: conversationId, body }, { onError: restoreOnError });
      return;
    }
    send.mutate(
      { conversation_id: conversationId, body, type: "text", ...(respondendo ? { reply_to_message_id: respondendo.id } : {}) },
      {
        onSuccess: () => {
          // A citação vale para UMA mensagem. Mantê-la depois do envio faria a
          // próxima frase sair citando algo que o atendente já respondeu.
          onCancelarResposta?.();
          consumirRascunhoEnviado();
          requestAnimationFrame(() => autoresize());
        },
        // Sem isto o texto some quando o envio falha, e quem escreveu um
        // parágrafo o perde sem ter como recuperá-lo.
        onError: restoreOnError,
      },
    );
  }

  /**
   * Marca o rascunho como usado — só depois do ENVIO humano dar certo.
   * Fire-and-forget de propósito: o texto já saiu, e a falha do consumo não
   * pode virar erro de envio. A proposta é de uso único.
   */
  function consumirRascunhoEnviado(): void {
    const leitura = rascunho?.leitura;
    if (rascunhoUsado || leitura?.estado !== "sugerido") return;
    setRascunhoUsado(true);
    void apiClient
      .post(`/api/v1/conversations/${conversationId}/drafts/consume`, { draft_id: leitura.draftId })
      .catch(() => {
        /* silêncio: ver docstring */
      });
  }

  function applyTemplate(tpl: MessageTemplate) {
    const filled = interpolateTemplate(tpl.body, { name: contactName ?? null });
    setText(filled);
    setMenuDismissed(true);
    const ta = taRef.current;
    if (!ta) return;
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = filled.length;
      autoresize();
    });
  }

  /**
   * Ctrl/Cmd+V com imagem no clipboard cai no MESMO caminho do menu "+": abre
   * o preview com legenda. Com um anexo já em preview, ou desabilitado, o
   * Ctrl+V continua sendo o de sempre. Em "Nota interna" a imagem colada vira
   * o mesmo preview, com o modo congelado na escolha (#1863, F3).
   */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (respostaBarrada || pendingFile) return;
    const imagem = imagemDoClipboard(e.clipboardData, new Date());
    if (!imagem) return; // colagem de texto segue o caminho normal do browser
    e.preventDefault();
    escolherArquivo(imagem);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && menuOpen) {
      setMenuDismissed(true);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (menuOpen) return; // deixa o Enter pro menu; não envia /query como mensagem
      handleSubmit();
    }
  }

  if (blockedReason) {
    return (
      <div className="bg-bg px-4 pb-3.5 pt-2.5">
        <p className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-center text-sm text-text-muted">
          {blockedReason}
        </p>
      </div>
    );
  }

  const nota = mode === "note";
  return (
    <>
      <div className="relative bg-bg px-4 pb-3.5 pt-2.5" data-modo={mode}>
        {!nota && <ReplyReviewPanel sugestao={sugestao} disabled={isDisabled} />}
        {!nota && conversa && <FaixaDoDono conversa={conversa} />}
        {rascunho && !rascunhoUsado && !nota && <AvisoDoRascunho rascunho={rascunho} />}
        <AbasDoComposer mode={mode} onMode={setMode} dicaId={dicaId} />
        {respondendo && !nota && <FaixaDaCitacao respondendo={respondendo} onCancelar={onCancelarResposta} />}
        <div
          // A caixa ganha a borda e o anel do accent no foco, e a nota interna
          // vira tracejada no tom de aviso: quem digita sabe, sem ler nada, se
          // aquilo vai para o cliente ou fica com o time.
          className={cn(
            "relative rounded-2xl border transition-[border-color,box-shadow]",
            nota
              ? "border-dashed border-warning/60 bg-warning-bg focus-within:border-warning focus-within:ring-3 focus-within:ring-warning/20"
              : "border-border-strong bg-surface focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20",
          )}
        >
          <TemplateMenu open={menuOpen} query={slash.query} templates={templates.data ?? []} onPick={applyTemplate} onClose={() => setMenuDismissed(true)} />
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!resolveSlash(e.target.value).open) setMenuDismissed(false);
              autoresize();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            // "(só o time vê)" FICA no placeholder da nota: não é atalho, é
            // consequência. Quem escreve uma nota interna precisa saber que ela
            // não vai para o cliente sem depender de abrir um diálogo.
            placeholder={nota ? t("Escreva uma nota interna… (só o time vê)") : t("Escreva uma mensagem…")}
            aria-describedby={dicaId}
            className="block max-h-40 min-h-12 w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-sm leading-normal text-text placeholder:text-text-subtle focus:outline-hidden disabled:cursor-not-allowed"
            disabled={campoBarrado}
            aria-label={t("Mensagem")}
          />
          <BarraDoComposer
            nota={nota}
            texto={text}
            conversationId={conversationId}
            active={active}
            isDisabled={isDisabled}
            respostaBarrada={respostaBarrada}
            campoBarrado={campoBarrado}
            sugestao={sugestao}
            onArquivo={escolherArquivo}
            onContato={() => setContactPickerOpen(true)}
            onEmoji={inserir}
            onRespostasRapidas={() => {
              setText("/");
              setMenuDismissed(false);
              requestAnimationFrame(() => taRef.current?.focus());
            }}
            onEnviar={handleSubmit}
          />
        </div>
      </div>
      <DialogosDoComposer
        conversationId={conversationId} currentContactId={currentContactId}
        pendingFile={pendingFile} pendingEm={pendingEm} limparArquivo={() => setPendingFile(null)}
        contactPickerOpen={contactPickerOpen} setContactPickerOpen={setContactPickerOpen}
        send={send} upload={upload} createNote={createNote}
      />
    </>
  );
});
