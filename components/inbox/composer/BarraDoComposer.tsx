"use client";

import { Button } from "@/components/ui/button";
import { AttachMenu } from "@/components/inbox/composer/AttachMenu";
import { AudioRecorder } from "@/components/inbox/composer/AudioRecorder";
import { EmojiButton } from "@/components/inbox/composer/EmojiButton";
import { useT } from "@/hooks/i18n/useT";
import { PaperPlaneTilt, Sparkle } from "@/lib/ui/icons";

import type { SugestaoDeResposta } from "./useSugestaoDeResposta";

interface Props {
  nota: boolean;
  texto: string;
  conversationId: string;
  active: boolean;
  /** Bloqueio geral (fechada, enviando anexo): vale para os dois modos. */
  isDisabled: boolean;
  /** O que barra o que SAI para o cliente (inclui a janela de 24h fechada). */
  respostaBarrada: boolean;
  /** O que barra o campo no modo atual. */
  campoBarrado: boolean;
  sugestao: SugestaoDeResposta;
  onArquivo: (file: File) => void;
  onContato: () => void;
  onEmoji: (emoji: string) => void;
  onRespostasRapidas: () => void;
  onEnviar: () => void;
}

/**
 * A BARRA DE BAIXO DA CAIXA do composer: anexo, emoji, respostas rápidas,
 * "Sugerir resposta" e, na ponta, gravar áudio ou enviar.
 *
 * Gravar e enviar dividem o MESMO lugar, como no WhatsApp: com o campo vazio
 * (e em resposta) o gesto é gravar; com texto, ou em nota, é enviar. A nota
 * nunca grava áudio, porque o áudio vira mensagem para o cliente.
 */
export function BarraDoComposer({
  nota, texto, conversationId, active, isDisabled, respostaBarrada, campoBarrado,
  sugestao, onArquivo, onContato, onEmoji, onRespostasRapidas, onEnviar,
}: Props) {
  const t = useT();
  return (
    <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
      {/* O "+" existe nos DOIS modos desde a F3 da #1863: em "Nota interna" ele
          abre foto/vídeo e documento; Contato some, porque cartão de contato é
          uma MENSAGEM para o cliente. */}
      <AttachMenu disabled={respostaBarrada} onPick={onArquivo} onPickContact={!nota ? onContato : undefined} />
      <EmojiButton disabled={isDisabled} onPick={onEmoji} />
      {!nota && (
        // As respostas rápidas já abriam com "/" no início do campo; o botão só
        // torna o atalho descobrível. Escolher uma resposta SUBSTITUI o campo,
        // então ele só vale com o campo vazio: não apaga o que foi digitado.
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 font-mono text-base"
          aria-label={t("Respostas rápidas")}
          disabled={campoBarrado || (texto !== "" && !texto.startsWith("/"))}
          onClick={onRespostasRapidas}
        >
          /
        </Button>
      )}
      {!nota && (
        // Nunca envia: pede a sugestão, que aparece no painel acima da caixa
        // para revisar. Some na nota, porque sugestão é mensagem para o cliente.
        <button
          type="button"
          onClick={() => void sugestao.generate()}
          disabled={isDisabled || sugestao.busy}
          aria-busy={sugestao.busy}
          className="ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-semibold text-accent-700 transition-colors hover:bg-accent/20 disabled:opacity-60 dark:text-accent-300"
        >
          <Sparkle size={14} weight={sugestao.busy ? "duotone" : "fill"} aria-hidden />
          {t(sugestao.busy ? "Preparando…" : "Sugerir resposta")}
        </button>
      )}
      <span className="flex-1" />
      {texto.trim() || nota ? (
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={onEnviar}
          disabled={campoBarrado || !texto.trim()}
          aria-label={t("Enviar")}
        >
          <PaperPlaneTilt size={16} weight="fill" aria-hidden />
        </Button>
      ) : (
        active && <AudioRecorder conversationId={conversationId} disabled={respostaBarrada} />
      )}
    </div>
  );
}
