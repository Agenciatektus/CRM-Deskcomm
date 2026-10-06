"use client";

import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { PontoDaEtiqueta } from "@/components/tags/PontoDaEtiqueta";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useConversationTagVocabulary, useUpdateConversationTags } from "@/hooks/inbox/useConversationTags";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";
import { deltaDaEtiqueta } from "@/lib/inbox/menu-da-conversa";
import { opcoesDoLembrete } from "@/lib/inbox/opcoes-do-lembrete";
import { Clock, Tag, UsersThree } from "@/lib/ui/icons";

import { cn } from "@/lib/utils";

import { CLASSE_DO_DETALHE, CLASSE_DO_ITEM, CLASSE_DO_SUBMENU } from "./estilo";

const ROTULO_DO_PAPEL: Record<string, string> = {
  agent: "Atendente",
  manager: "Gestor",
  admin: "Admin",
};

/**
 * Os submenus que só chamam a porta que o cabeçalho já usa:
 *   - Transferir → escolher o nome abre a confirmação com motivo opcional
 *     (`DialogoDeTransferir`, `POST /transfer`); a troca de número continua só
 *     no cabeçalho;
 *   - Lembrar depois → `useSnoozeConversation` (`POST`/`DELETE /snooze`), com as
 *     MESMAS opções do cabeçalho (`opcoesDoLembrete`, instante calculado no fuso
 *     de quem clica); "Escolher data e hora" fica só no cabeçalho;
 *   - Etiquetas → `useUpdateConversationTags` (`PATCH` só com o delta, 9044).
 */

export function SubmenuTransferir({ conversation, meuUserId, onEscolher }: {
  conversation: ConversationWithContact;
  meuUserId: string | null;
  /** Escolher só pede a confirmação (com motivo); quem transfere é a janela. */
  onEscolher: (destino: { userId: string; nome: string }) => void;
}) {
  const t = useT();
  // Habilitado com o menu aberto: o submenu abre já preenchido, e a mesma chave
  // do diálogo de transferência deixa as duas telas dividirem o cache.
  const membros = useAssignableMembers(true);
  const destinos = (membros.data ?? []).filter(
    (m) => m.user_id !== meuUserId && m.user_id !== conversation.assigned_to_user_id,
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={CLASSE_DO_ITEM}>
        <UsersThree size={16} aria-hidden />
        <span className="grow">{t("Transferir para")}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={CLASSE_DO_SUBMENU} collisionPadding={8} aria-labelledby={undefined} aria-label={t("Transferir para")}>
          {membros.isLoading && (
            <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>{t("Carregando…")}</DropdownMenuItem>
          )}
          {!membros.isLoading && destinos.length === 0 && (
            <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>{t("Ninguém disponível para receber")}</DropdownMenuItem>
          )}
          {destinos.map((m) => (
            <DropdownMenuItem
              key={m.user_id}
              className={CLASSE_DO_ITEM}
              onSelect={() => onEscolher({ userId: m.user_id, nome: m.full_name ?? t("Sem nome") })}
            >
              <span className="min-w-0 truncate">{m.full_name ?? t("Sem nome")}</span>
              <span className={CLASSE_DO_DETALHE}>{t(ROTULO_DO_PAPEL[m.role] ?? "Atendente")}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function SubmenuLembrar({ conversationId, lembreteAtivo }: {
  conversationId: string;
  lembreteAtivo: boolean;
}) {
  const t = useT();
  const locale = useLocaleDeData();
  const { snooze, cancel } = useSnoozeConversation();
  // O menu remonta a cada abertura: "agora" é o instante em que ele abriu.
  const [agora] = useState(() => new Date());

  function lembrar(quando: Date) {
    // `mutateAsync`: o menu desmonta ao escolher, e o `onSuccess` por chamada
    // não rodaria. DESFAZER DE VERDADE: o `DELETE /snooze` devolve a conversa
    // exatamente ao estado de antes (sem lembrete), a única ação do menu com
    // volta exata; arquivar encerra o atendimento e reabrir não desfaz isso.
    void snooze.mutateAsync({ conversation_id: conversationId, snooze_until: quando.toISOString() }).then(
      () =>
        toast.success(t("Lembrete marcado."), {
          action: { label: t("Desfazer"), onClick: () => cancel.mutate({ conversation_id: conversationId }) },
        }),
      () => {},
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={CLASSE_DO_ITEM}>
        <Clock size={16} aria-hidden />
        <span className="grow">{t("Lembrar depois")}</span>
        {lembreteAtivo && <span className={CLASSE_DO_DETALHE}>{t("Lembrete ativo")}</span>}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={CLASSE_DO_SUBMENU} collisionPadding={8} aria-labelledby={undefined} aria-label={t("Lembrar depois")}>
          {lembreteAtivo ? (
            <DropdownMenuItem
              className={CLASSE_DO_ITEM}
              disabled={cancel.isPending}
              onSelect={() => cancel.mutate({ conversation_id: conversationId })}
            >
              {t("Cancelar lembrete")}
            </DropdownMenuItem>
          ) : (
            opcoesDoLembrete(agora).map((o) => (
              <DropdownMenuItem
                key={o.id}
                className={CLASSE_DO_ITEM}
                disabled={snooze.isPending}
                onSelect={() => lembrar(o.quando)}
              >
                <span className="grow">{t(o.rotulo)}</span>
                <span className={cn(CLASSE_DO_DETALHE, "tabular-nums")}>
                  {format(o.quando, o.id === "em_1_semana" ? "EEE d MMM, p" : "p", { locale })}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function SubmenuEtiquetas({ conversation }: { conversation: ConversationWithContact }) {
  const t = useT();
  const atuais = conversation.tags ?? [];
  const vocabulario = useConversationTagVocabulary(conversation.organization_id);
  const gravar = useUpdateConversationTags();
  // As da conversa primeiro (marcadas), depois o vocabulário da org.
  const opcoes = [...atuais, ...(vocabulario.data ?? []).filter((v) => !atuais.includes(v))];

  function alternar(tag: string) {
    const delta = deltaDaEtiqueta(atuais, tag);
    if (delta === null) {
      toast.error(t("Limite de 20 etiquetas por conversa."));
      return;
    }
    gravar.mutate({ conversation_id: conversation.id, ...delta });
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={CLASSE_DO_ITEM}>
        <Tag size={16} aria-hidden />
        <span className="grow">{t("Etiquetas")}</span>
        {atuais.length > 0 && <span className={CLASSE_DO_DETALHE}>{atuais.length}</span>}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className={CLASSE_DO_SUBMENU} collisionPadding={8} aria-labelledby={undefined} aria-label={t("Etiquetas")}>
          {opcoes.length === 0 && (
            <DropdownMenuItem disabled className={CLASSE_DO_ITEM}>
              {vocabulario.isLoading ? t("Carregando…") : t("Nenhuma etiqueta criada ainda")}
            </DropdownMenuItem>
          )}
          {opcoes.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag}
              checked={atuais.includes(tag)}
              disabled={gravar.isPending}
              // Fecha ao marcar: a marca vem da conversa, que só muda quando o
              // servidor responde. Desde a 9044 o clique manda só o delta, então
              // nada se perde; fechar evita mostrar a marca velha.
              onCheckedChange={() => alternar(tag)}
              className="h-[34px] gap-2 rounded-lg text-[13.5px] focus:bg-surface-elevated focus:text-text"
            >
              <PontoDaEtiqueta tag={tag} />
              <span className="min-w-0 truncate">{tag}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
