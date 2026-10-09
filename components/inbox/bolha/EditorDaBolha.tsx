"use client";

import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  editorRef: Ref<HTMLDivElement>;
  texto: string;
  onMudar: (texto: string) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  ocupado: boolean;
}

/**
 * O editor de uma mensagem já enviada, dentro da própria bolha.
 *
 * Enter salva e Shift+Enter quebra linha, como no composer; `isComposing`
 * protege quem digita com IME (acentos compostos, teclado asiático) de salvar
 * no meio da composição. A guarda contra salvar duas vezes mora em quem chama.
 */
export function EditorDaBolha({ editorRef, texto, onMudar, onSalvar, onCancelar, ocupado }: Props) {
  const t = useT();
  return (
    <div ref={editorRef} className="min-w-64 space-y-2">
      <textarea
        aria-label={t("Editar mensagem")}
        value={texto}
        onChange={(event) => onMudar(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSalvar();
          }
        }}
        maxLength={4096}
        className="min-h-20 w-full rounded-xl border border-border bg-surface p-2 text-text focus:border-accent focus:outline-hidden focus:ring-2 focus:ring-accent/25"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={ocupado} onClick={onCancelar}>{t("Cancelar")}</Button>
        <Button size="sm" disabled={ocupado || !texto.trim()} onClick={onSalvar}>{t("Salvar")}</Button>
      </div>
    </div>
  );
}
