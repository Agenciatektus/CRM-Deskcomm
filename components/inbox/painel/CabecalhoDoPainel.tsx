"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { ContactSummary } from "@/hooks/inbox/useConversationsRealtime";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { ArrowRight, Copy, ListChecks, Note, Tag, UserCircle } from "@/lib/ui/icons";

import { ContactTagsEditor } from "../ContactTagsEditor";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return (partes[0] ?? "").slice(0, 2).toUpperCase();
  return `${partes[0]?.[0] ?? ""}${partes[partes.length - 1]?.[0] ?? ""}`.toUpperCase();
}

const CLASSES_DO_ATALHO =
  "flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border px-1.5 text-xs font-semibold text-text hover:bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  contact: ContactSummary | null;
  displayName: string;
  orgId: string;
  leitura: boolean;
  onIrParaProximoPasso: () => void;
  onIrParaDetalhes: () => void;
}

/**
 * Quem é a pessoa, sempre visível acima das abas.
 *
 * Os três atalhos levam a SEÇÕES da aba Resumo (trocam de aba se preciso e
 * rolam até lá), em vez de abrir janela: o painel continua sendo um lugar só.
 *
 * "Obs" fica desabilitado com "Em breve": `contacts` ainda não tem campo de
 * observação, e um botão que abre um campo que não grava seria o pior estado,
 * a escrita que parece ter dado certo. Desabilitado e não escondido para a
 * fileira não mudar de forma quando o campo chegar. `aria-disabled` em vez de
 * `disabled` para o leitor de tela ainda alcançar o botão e ouvir o porquê.
 */
export function CabecalhoDoPainel({ contact, displayName, orgId, leitura, onIrParaProximoPasso, onIrParaDetalhes }: Props) {
  const t = useT();
  const [editandoTags, setEditandoTags] = useState(false);
  const contactId = contact?.id ?? null;
  const tags = contact?.tags ?? [];
  const telefone = contact?.phone_number ? phoneForDisplay(contact.phone_number) : null;

  async function copiarTelefone() {
    if (!telefone) return;
    try {
      await navigator.clipboard.writeText(telefone);
      toast.success(t("Telefone copiado."));
    } catch {
      // Clipboard bloqueado (http, permissão negada): dizer, e não fingir.
      toast.error(t("Não consegui copiar. Selecione o número e copie à mão."));
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-border p-4" data-testid="inbox-cabecalho-do-painel">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {/* Só monta a <img> quando existe arquivo: sem isso o browser pediria a
              rota e levaria 404 para todo contato sem foto. */}
          {contact?.avatar_storage_path && !contact.is_anonymized ? (
            <AvatarImage src={`/api/v1/contacts/${contact.id}/avatar`} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-surface-elevated text-sm font-semibold text-text-muted">
            {iniciais(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight text-text">{displayName}</div>
          {telefone && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span className="tabular-nums">{telefone}</span>
              <button
                type="button"
                aria-label={t("Copiar telefone")}
                title={t("Copiar telefone")}
                onClick={() => void copiarTelefone()}
                className="grid h-6 w-6 place-items-center rounded-md hover:bg-surface-elevated hover:text-text"
              >
                <Copy size={12} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <ChipDeEtiqueta key={tag} tag={tag} className="h-5 px-1.5 text-[11px]" />
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 border border-dashed border-border px-2 text-[11px] text-text-muted"
          disabled={leitura || !contactId}
          aria-pressed={editandoTags}
          onClick={() => setEditandoTags((v) => !v)}
        >
          <Tag size={11} className="mr-1" weight="regular" aria-hidden /> {t("Tags do contato")}
        </Button>
        {contactId && (
          <Button asChild size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[11px]">
            <Link href={`/app/contacts/${contactId}`}>
              {t("Ver contato")}
              <ArrowRight size={11} className="ml-1" weight="regular" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
      {editandoTags && contactId && <ContactTagsEditor contactId={contactId} orgId={orgId} tags={tags} />}

      <div className="grid grid-cols-3 gap-1.5" data-testid="inbox-atalhos-do-painel">
        <button type="button" className={CLASSES_DO_ATALHO} onClick={onIrParaProximoPasso}>
          <ListChecks size={14} className="text-accent" aria-hidden /> {t("Próximo passo")}
        </button>
        {/* Visível "Detalhes" porque "Detalhes do contato" não cabe em um terço de
            296px; o nome acessível CONTÉM o visível (WCAG 2.5.3). */}
        <button type="button" className={CLASSES_DO_ATALHO} aria-label={t("Detalhes do contato")} onClick={onIrParaDetalhes}>
          <UserCircle size={14} className="text-accent" aria-hidden /> {t("Detalhes")}
        </button>
        <button
          type="button"
          aria-disabled="true"
          title={t("Em breve")}
          onClick={(e) => e.preventDefault()}
          className={`${CLASSES_DO_ATALHO} cursor-not-allowed opacity-50 hover:bg-transparent`}
        >
          <Note size={14} aria-hidden /> {t("Obs")}
          <span className="sr-only">{`(${t("Em breve")})`}</span>
        </button>
      </div>
    </div>
  );
}
