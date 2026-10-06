"use client";

import { X } from "lucide-react";

import { useT } from "@/hooks/i18n/useT";
import type { AvisoDeRascunho, MotivoDeRecusa } from "@/lib/inbox/rascunho-sugerido";
import { cn } from "@/lib/utils";

/**
 * O que a tela diz quando o rascunho NÃO vale mais (issue #1611: "a conversa
 * abre sem texto e com aviso").
 *
 * Os quatro motivos são frases separadas de propósito: o atendente precisa
 * saber se o texto expirou, se alguém já usou ou se o link era de outra
 * conversa — e a única coisa que os quatro têm em comum (a conversa abriu sem
 * ele) é justamente o que ele não deve presumir sozinho.
 */
function avisoDeRascunhoIndisponivel(motivo: MotivoDeRecusa, t: (texto: string) => string): string {
  switch (motivo) {
    case "outra_conversa":
      return t("O texto sugerido pertence a outra conversa. A conversa abriu sem ele.");
    case "usado":
      return t("O texto sugerido já foi usado. A conversa abriu sem ele.");
    case "expirado":
      return t("O texto sugerido expirou. A conversa abriu sem ele.");
    case "nao_encontrado":
    default:
      return t("O texto sugerido não foi encontrado. A conversa abriu sem ele.");
  }
}

const FAIXA = "mb-2 flex items-start gap-2 rounded-xl border-l-2 border-accent bg-surface px-3 py-2 text-xs shadow-xs";

/**
 * O AVISO DO RASCUNHO SUGERIDO (issue #1611). Nada aqui envia: a faixa só diz
 * de onde veio o texto que já está no campo (e, quando o rascunho não vale
 * mais, por que o campo está vazio).
 */
export function AvisoDoRascunho({ rascunho }: { rascunho: AvisoDeRascunho }) {
  const t = useT();
  return (
    <div data-testid="aviso-rascunho" className={FAIXA}>
      <p className="min-w-0 flex-1 text-text-muted">
        {rascunho.leitura.estado === "sugerido" ? (
          <>
            {t("Texto sugerido por")}{" "}
            <span className="font-medium text-text">{rascunho.leitura.origem}</span>.{" "}
            {t("Revise antes de enviar.")}
          </>
        ) : (
          avisoDeRascunhoIndisponivel(rascunho.leitura.motivo, t)
        )}
      </p>
    </div>
  );
}

/**
 * A FAIXA DA CITAÇÃO — o que o atendente escolheu responder.
 *
 * Fica ACIMA do campo, como no WhatsApp, e não dentro dele: o texto citado
 * pode ter várias linhas, e empurrá-lo para dentro do campo faria o que se
 * digita disputar espaço com o que se cita. `line-clamp-2` porque o objetivo
 * é reconhecer qual mensagem é, não relê-la — ela está logo acima, no fio.
 */
export function FaixaDaCitacao({
  respondendo,
  onCancelar,
}: {
  respondendo: { body: string | null; direction: string };
  onCancelar?: () => void;
}) {
  const t = useT();
  return (
    <div className={FAIXA}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-accent-700 dark:text-accent-300">
          {respondendo.direction === "outbound" ? t("Você") : t("Cliente")}
        </div>
        <div className="line-clamp-2 text-text-muted">{respondendo.body?.trim() || t("(sem texto)")}</div>
      </div>
      <button
        type="button"
        onClick={onCancelar}
        aria-label={t("Cancelar resposta")}
        className="rounded-md p-0.5 text-text-muted hover:bg-muted hover:text-text"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * As abas Responder / Nota interna, como pílulas, e a dica de teclado.
 *
 * A dica fica À VISTA, ao lado das abas. Antes ela morava no `title` do campo
 * (o placeholder some na primeira letra, justamente quando se ia quebrar
 * linha); o `title` só aparece a quem para o mouse em cima, e quem digita não
 * para. Ela continua ligada ao campo por `aria-describedby`.
 */
export function AbasDoComposer({
  mode,
  onMode,
  dicaId,
}: {
  mode: "reply" | "note";
  onMode: (m: "reply" | "note") => void;
  dicaId: string;
}) {
  const t = useT();
  const pilula = "h-7 rounded-full px-3 text-xs font-semibold transition-colors";
  return (
    <div className="mb-2 flex items-center gap-1">
      <button
        type="button"
        aria-pressed={mode === "reply"}
        onClick={() => onMode("reply")}
        className={cn(pilula, mode === "reply" ? "bg-text text-surface" : "text-text-muted hover:bg-muted hover:text-text")}
      >
        {t("Responder")}
      </button>
      <button
        type="button"
        aria-pressed={mode === "note"}
        onClick={() => onMode("note")}
        className={cn(pilula, mode === "note" ? "bg-warning-fg text-surface" : "text-text-muted hover:bg-muted hover:text-text")}
      >
        {t("Nota interna")}
      </button>
      <span id={dicaId} className="ml-auto hidden text-xs text-text-subtle sm:inline">
        {mode === "note"
          ? t("Enter salva a nota, Shift+Enter quebra linha")
          : t("Enter envia, Shift+Enter quebra linha")}
      </span>
    </div>
  );
}
