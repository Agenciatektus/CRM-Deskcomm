"use client";

import { useCallback, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReopenConversation } from "@/hooks/inbox/useCloseConversation";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { comandoDaConversa, ROTULO_DO_COMANDO } from "@/lib/inbox/comando-da-conversa";
import { regrasDoMenu } from "@/lib/inbox/menu-da-conversa";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArrowsClockwise,
  CheckCircle,
  Copy,
  IdentificationCard,
  Pause,
  Robot,
  SignOut,
  UserCircle,
} from "@/lib/ui/icons";

import type { DialogoDoMenu } from "./DialogosDoMenu";
import { CLASSE_DO_ITEM, CLASSE_DO_MENU, CLASSE_DO_PRINCIPAL } from "./estilo";
import { ItensPessoais } from "./ItensPessoais";
import { SubmenuDoFunil } from "./SubmenuDoFunil";
import { SubmenuEtiquetas, SubmenuLembrar, SubmenuTransferir } from "./SubmenusDaConversa";
import type { AlvoDoMenu } from "./useMenuDaConversa";

interface Props {
  alvo: AlvoDoMenu;
  conversation: ConversationWithContact;
  leitura: boolean;
  /** Os itens por atendente (9042) têm régua própria: ver `ItensPessoais`. */
  pessoais?: { podePreferir: boolean; podeBloquear: boolean };
  meuUserId: string | null;
  automaticoDaOrg?: boolean;
  onFechar: () => void;
  onAbrirDialogo: (d: DialogoDoMenu) => void;
  onDevolverFoco: (e: Event) => void;
}

/**
 * O menu aberto: âncora, cabeçalho e itens. Monta a cada abertura (`key` no
 * pai), por isso os hooks de ação moram aqui e nascem com o menu.
 */
export function ConteudoDoMenu({
  alvo,
  conversation,
  leitura,
  pessoais,
  meuUserId,
  automaticoDaOrg,
  onFechar,
  onAbrirDialogo,
  onDevolverFoco,
}: Props) {
  const t = useT();
  const router = useRouter();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const retomar = useResumeAiAttendance();
  const pausar = usePauseAiAttendance();
  const reabrir = useReopenConversation();
  const abrirDialogo = onAbrirDialogo;
  // Foco no PRIMEIRO item ao abrir, venha de onde vier (o Radix só faz isso
  // quando a abertura foi pelo teclado DELE). Ref estável e menu remontado a
  // cada abertura: roda uma vez, não a cada re-render que o realtime provoca.
  const focarPrimeiro = useCallback((no: HTMLDivElement | null) => {
    if (!no) return;
    setTimeout(() => no.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])')?.focus({ preventScroll: true }), 0);
  }, []);

  async function copiarTelefone(telefone: string) {
    try {
      await navigator.clipboard.writeText(telefone);
      toast.success(t("Telefone copiado."));
    } catch {
      toast.error(t("Não foi possível copiar o telefone."));
    }
  }

  // As teclas do menu não chegam aos atalhos da Inbox: "a" aqui é busca por
  // letra do Radix, não "assumir a conversa selecionada" (que pode ser outra).
  const isolarTeclas = (e: KeyboardEvent) => e.stopPropagation();

  const c = conversation.contacts ?? null;
  const regras = regrasDoMenu({ conversation, meuUserId, leitura, automaticoDaOrg });
  const nome = rotuloDoContato(c, t);
  const { comando } = comandoDaConversa({
    status: conversation.status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    is_group: conversation.is_group ?? false,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: c?.is_blocked ?? null,
    automaticoDaOrg,
  });
  const id = conversation.id;
  const telefone = c?.phone_number ? phoneForDisplay(c.phone_number) : null;
  const temAtendimento = regras.assumir || regras.liberar || regras.devolver || regras.pausar;
  const temRoteamento = regras.transferir || regras.lembrar || regras.etiquetas || regras.funil;

  return (
    <DropdownMenu open modal={false} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          tabIndex={-1}
          data-testid="ancora-do-menu-da-conversa"
          className="pointer-events-none fixed size-0"
          style={{ left: alvo.x, top: alvo.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={focarPrimeiro}
        side="bottom"
        align="start"
        sideOffset={2}
        collisionPadding={8}
        aria-label={`${t("Ações da conversa com")} ${nome}`}
        aria-labelledby={undefined}
        data-testid="menu-da-conversa"
        className={CLASSE_DO_MENU}
        onKeyDown={isolarTeclas}
        onCloseAutoFocus={onDevolverFoco}
      >
        <div className="mb-1 border-b border-border px-2 pb-2.5 pt-1.5">
          <b className="block truncate text-[13.5px] text-text">{nome}</b>
          <span className="block truncate text-xs text-text-subtle">
            {leitura ? t("Somente leitura") : t(ROTULO_DO_COMANDO[comando.quem])}
          </span>
        </div>

        {regras.assumir && (
          <DropdownMenuItem
            className={cn(CLASSE_DO_ITEM, CLASSE_DO_PRINCIPAL)}
            disabled={claim.isPending}
            title={t("Você passa a responder esta conversa e o atendimento automático para aqui.")}
            onSelect={() => claim.mutate({ conversation_id: id, expected_assignee: conversation.assigned_to_user_id })}
          >
            <UserCircle size={16} aria-hidden /> {t("Assumir")}
          </DropdownMenuItem>
        )}
        {regras.liberar && (
          <DropdownMenuItem className={CLASSE_DO_ITEM} disabled={release.isPending} onSelect={() => release.mutate({ conversation_id: id })}>
            <SignOut size={16} aria-hidden /> {t("Liberar")}
          </DropdownMenuItem>
        )}
        {regras.devolver && (
          <DropdownMenuItem
            className={CLASSE_DO_ITEM}
            disabled={retomar.isPending}
            title={
              regras.motivo === "contato_travado"
                ? t("Religa o atendimento automático para este cliente, em todas as conversas dele.")
                : t("Devolve esta conversa ao atendimento automático.")
            }
            onSelect={() => retomar.mutate({ conversation_id: id })}
          >
            <Robot size={16} aria-hidden /> {t("Devolver à IA")}
          </DropdownMenuItem>
        )}
        {regras.pausar && (
          <DropdownMenuItem
            className={CLASSE_DO_ITEM}
            disabled={pausar.isPending}
            title={t("O atendimento automático para nesta conversa. O dono não muda.")}
            onSelect={() => pausar.mutate({ conversation_id: id })}
          >
            <Pause size={16} aria-hidden /> {t("Pausar o automático")}
          </DropdownMenuItem>
        )}
        {temAtendimento && temRoteamento && <DropdownMenuSeparator />}

        {regras.transferir && (
            <SubmenuTransferir
              conversation={conversation}
              meuUserId={meuUserId}
              onEscolher={(destino) => abrirDialogo({ tipo: "transferir", conversationId: id, destino })}
            />
          )}
        {regras.lembrar && <SubmenuLembrar conversationId={id} lembreteAtivo={regras.lembreteAtivo} />}
        {regras.etiquetas && <SubmenuEtiquetas conversation={conversation} />}
        {regras.funil && c?.id && (
          <SubmenuDoFunil contactId={c.id} onDialogo={(d) => abrirDialogo({ ...d, contactId: c.id })} />
        )}
        {(temAtendimento || temRoteamento) && (regras.ficha || regras.copiarTelefone) && <DropdownMenuSeparator />}

        {regras.ficha && c?.id && (
          <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => router.push(`/app/contacts/${c.id}`)}>
            <IdentificationCard size={16} aria-hidden /> {t("Abrir ficha do contato")}
          </DropdownMenuItem>
        )}
        {regras.copiarTelefone && telefone && (
          <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => void copiarTelefone(telefone)}>
            <Copy size={16} aria-hidden /> {t("Copiar telefone")}
          </DropdownMenuItem>
        )}

        {pessoais && (
          <ItensPessoais
            conversation={conversation}
            nome={nome}
            podePreferir={pessoais.podePreferir}
            podeBloquear={pessoais.podeBloquear}
            onBloquear={(contato) => abrirDialogo({ tipo: "bloquear", ...contato })}
          />
        )}
        {(regras.fechar || regras.reabrir || regras.arquivar) && <DropdownMenuSeparator />}
        {regras.fechar && (
          <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => abrirDialogo({ tipo: "fechar", conversation })}>
            <CheckCircle size={16} aria-hidden /> {t("Fechar")}
          </DropdownMenuItem>
        )}
        {regras.reabrir && (
          <DropdownMenuItem
            className={CLASSE_DO_ITEM}
            disabled={reabrir.isPending}
            onSelect={() => reabrir.mutate({ conversation_id: id, expected_revision: conversation.service_revision })}
          >
            <ArrowsClockwise size={16} aria-hidden /> {t("Reabrir")}
          </DropdownMenuItem>
        )}
        {regras.arquivar && (
          <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => abrirDialogo({ tipo: "arquivar", conversation })}>
            <Archive size={16} aria-hidden /> {t("Arquivar")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
