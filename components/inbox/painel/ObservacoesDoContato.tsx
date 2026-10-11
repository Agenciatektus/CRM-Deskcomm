"use client";

import { SecaoRecolhivel } from "./SecaoRecolhivel";
import { forwardRef, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useContact } from "@/hooks/contacts/useContact";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { useT } from "@/hooks/i18n/useT";
import { OBSERVACOES_MAX } from "@/lib/schemas/contacts";
import { Note } from "@/lib/ui/icons";

interface Props {
  contactId: string | null;
  anonimizado: boolean;
  leitura: boolean;
}

/** O que o servidor tem, normalizado para comparar com o rascunho. */
const normal = (v: string | null | undefined) => (v ?? "").trim();

/**
 * As OBSERVAÇÕES do contato (migration 9041): anotação livre da equipe que
 * atravessa todas as conversas dele. Grava pelo PATCH de contatos que já existe
 * (`agent`+, suporte em leitura barrado na rota); o audit guarda só que mudou.
 *
 * Salva ao sair do campo e no botão: quem escreve e clica em outra conversa não
 * perde o texto, e quem prefere confirmar tem o botão. Esvaziar o campo e sair
 * APAGA a observação (o schema troca vazio por null), que é o gesto esperado de
 * "apaguei tudo".
 *
 * Em leitura (suporte somente leitura, viewer) ou contato anonimizado, só o
 * texto, sem campo: a anonimização apaga a observação no banco.
 */
export const ObservacoesDoContato = forwardRef<HTMLElement, Props>(function ObservacoesDoContato(
  { contactId, anonimizado, leitura },
  ref,
) {
  const t = useT();
  const contato = useContact(anonimizado || !contactId ? "" : contactId);
  const salvo = contato.data?.data?.observacoes ?? null;
  const podeEditar = !leitura && !anonimizado && !!contactId;

  return (
    <SecaoRecolhivel
      ref={ref}
      testId="inbox-observacoes-do-contato"
      icone={<Note size={14} aria-hidden />}
      titulo={t("Observações")}
      // P6: fechada, a primeira linha da observação.
      resumo={primeiraLinha(salvo) || t("Sem observações.")}
    >
      {podeEditar && contato.isSuccess ? (
        // A chave remonta o editor quando o valor SALVO muda (outra conversa,
        // gravação concluída): o rascunho nasce do servidor sem efeito nenhum.
        <EditorDeObservacoes key={`${contactId}:${salvo ?? ""}`} contactId={contactId} salvo={salvo} />
      ) : (
        <p
          data-testid="observacoes-somente-leitura"
          className={salvo ? "mt-1 whitespace-pre-wrap wrap-anywhere text-xs text-text" : "mt-1 text-xs text-text-muted"}
        >
          {salvo || t("Sem observações.")}
        </p>
      )}
    </SecaoRecolhivel>
  );
});

function EditorDeObservacoes({ contactId, salvo }: { contactId: string; salvo: string | null }) {
  const t = useT();
  const id = useId();
  const atualizar = useUpdateContact(contactId);
  const [rascunho, setRascunho] = useState(salvo ?? "");
  const usados = Array.from(rascunho.trim()).length;
  const mudou = normal(rascunho) !== normal(salvo);

  function salvar() {
    // O clique no botão vem depois do blur do campo: a segunda chamada encontra
    // a primeira em curso e não manda o mesmo PATCH duas vezes.
    if (!mudou || atualizar.isPending || usados > OBSERVACOES_MAX) return;
    atualizar.mutate(
      { observacoes: rascunho },
      { onSuccess: () => toast.success(t("Observações salvas.")) },
    );
  }

  return (
    <div className="mt-1 grid gap-1.5">
      <label htmlFor={id} className="sr-only">{t("Observações")}</label>
      <textarea
        id={id}
        value={rascunho}
        maxLength={OBSERVACOES_MAX}
        rows={3}
        placeholder={t("Escreva o que a equipe precisa saber sobre este contato.")}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={salvar}
        aria-describedby={`${id}-contador`}
        className="min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs text-text focus:outline-hidden focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-contador`} className="text-[0.6875rem] tabular-nums text-text-muted">
          <span className="sr-only">{`${t("Caracteres usados")}: `}</span>
          {usados}/{OBSERVACOES_MAX}
        </span>
        <Button size="sm" className="h-7 text-xs" disabled={!mudou || atualizar.isPending} onClick={salvar}>
          {atualizar.isPending ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </div>
  );
}

/** A primeira linha não vazia da observação, para o resumo da seção fechada. */
function primeiraLinha(texto: string | null): string {
  return (texto ?? "").split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
}
