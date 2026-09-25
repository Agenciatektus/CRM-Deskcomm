"use client";
import { forwardRef, useEffect, useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { usePermission } from "@/hooks/auth/AuthProvider";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { fonteDeTemplates } from "@/lib/channels/templates-fonte";
import { estadoDaJanela, formatarDecorrido } from "@/lib/channels/janela";
import type { Message as ConversationMensagem } from "@/lib/types/messaging";
import { ChatThread } from "./ChatThread";
import { Composer, type ComposerHandle } from "./Composer";
import { JanelaFechadaAviso } from "./JanelaFechadaAviso";
import { RetentionNotice } from "./RetentionNotice";

/**
 * A CONVERSA COM O CAMPO DE RESPOSTA — uma peça só, usada no Inbox e no dossiê
 * do negócio (Kanban).
 *
 * ─── Por que isto saiu do `InboxLayout` ─────────────────────────────────────
 *
 * O `ConversaSlot` do quadro registrou a regra: "duas cópias do mesmo campo
 * divergem". Ela continua valendo — e é por isso que o dossiê NÃO ganhou um
 * segundo composer. Ganhou ESTE componente, o mesmo que o Inbox monta. As
 * decisões que moravam soltas no layout (a janela de 24h que fecha o texto
 * livre, o contato bloqueado ou anonimizado, quem só pode ler,
 * a mensagem escolhida para responder "em cima") agora moram aqui, e as duas
 * telas herdam a mesma correção no mesmo commit.
 *
 * ─── Quem não pode responder não vê o campo ─────────────────────────────────
 *
 * `POST /api/v1/messages` exige `agent` (viewer é somente leitura). Antes, o
 * viewer via o composer liberado e descobria a regra pelo 403 no toast — uma
 * mensagem digitada e perdida por vez. O gate é o MESMO `inbox.reply` do
 * `usePermission`; a UI só deixa de prometer o que o servidor recusa.
 *
 * ─── O estado da resposta "em cima" é por conversa ──────────────────────────
 *
 * Quem monta passa `key={conversation.id}`. Trocar de conversa desmonta o
 * painel e zera a citação — sem isso a resposta sairia citando mensagem de
 * outro cliente (o defeito que o `handleSelect` do Inbox existia para evitar).
 */
export interface PainelDaConversaProps {
  conversation: ConversationWithContact;
  /**
   * `inbox` é a coluna do meio do Inbox. `dossie` é a coluna do dossiê do
   * negócio: mesma conversa, só sem o aviso de retenção (o dossiê já tem a
   * linha do tempo como registro, e o espaço vertical ali é mais disputado).
   */
  onde?: "inbox" | "dossie";
}

export const PainelDaConversa = forwardRef<ComposerHandle, PainelDaConversaProps>(
  function PainelDaConversa({ conversation, onde = "inbox" }, composerRef) {
    const t = useT();
    // Acompanhamento de suporte somente leitura já chega aqui como `viewer`
    // (`resolveActiveOrg` o rebaixa), então este gate também o cobre.
    const podeResponder = usePermission("inbox.reply");

    /**
     * A mensagem escolhida para responder "em cima". Quem ESCOLHE é a lista de
     * mensagens e quem MOSTRA é o composer — irmãos, então o estado é daqui.
     */
    const [respondendo, setRespondendo] = useState<ConversationMensagem | null>(null);

    // A janela vence SOZINHA com a tela aberta. Sem este relógio, quem deixa a
    // conversa aberta a tarde inteira seguiria com o composer liberado numa
    // conversa que já venceu — e o bloqueio só apareceria no próximo reload.
    const [agoraJanela, setAgoraJanela] = useState(() => new Date());
    useEffect(() => {
      const timer = setInterval(() => setAgoraJanela(new Date()), 30_000);
      return () => clearInterval(timer);
    }, []);

    // A janela de 24h fecha o composer, e o motivo DIZ há quanto tempo fechou.
    // Reusa o `blockedReason` em vez de um segundo mecanismo de bloqueio: dois
    // caminhos para desabilitar o mesmo composer divergem, e o segundo esquece
    // de cobrir o áudio ou o anexo.
    const provider = conversation.channel_sessions?.provider ?? null;
    const janela = estadoDaJanela(provider, conversation.last_inbound_at ?? null, agoraJanela);
    const motivoDaJanela =
      janela.tipo === "fechada"
        ? fonteDeTemplates(provider) === null
          ? t("Aguarde uma nova mensagem do cliente para reabrir o atendimento nesta rede.")
          : janela.fechadaHaMs === null
            ? t("O cliente ainda não escreveu — a janela de 24h nunca abriu. Só um modelo aprovado sai daqui.")
            : `${t("A janela de 24h fechou há")} ${formatarDecorrido(janela.fechadaHaMs)}. ${t("Só um modelo aprovado sai daqui — texto livre é recusado pela plataforma.")}`
        : null;

    const blockedReason = conversation.contacts?.is_blocked
      ? t("Contato bloqueado — envio de mensagens desabilitado.")
      : conversation.contacts?.is_anonymized
        ? t("Contato anonimizado — não é possível enviar mensagens.")
        : null;

    return (
      <>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatThread
            conversationId={conversation.id}
            onResponder={podeResponder ? setRespondendo : undefined}
            // O cartão da passagem escolhe o gesto a partir de quem é o dono da
            // conversa: sem dono convida a assumir, com outro dono diz quem
            // atende. Sem estes campos ele ficaria mudo para quem mais precisa.
            dono={{
              userId: conversation.assigned_to_user_id ?? null,
              nome: conversation.assigned_to_user_name ?? null,
            }}
            contatoId={conversation.contacts?.id ?? null}
          />
        </div>
        {onde === "inbox" && <RetentionNotice conversationId={conversation.id} />}
        {podeResponder ? (
          <>
            {motivoDaJanela && (
              <JanelaFechadaAviso
                conversationId={conversation.id}
                provider={provider}
                motivo={motivoDaJanela}
              />
            )}
            <Composer
              ref={composerRef}
              conversationId={conversation.id}
              blockedReason={blockedReason}
              janelaFechada={motivoDaJanela}
              disabled={conversation.status === "closed"}
              contactName={conversation.contacts?.name ?? null}
              respondendo={respondendo}
              onCancelarResposta={() => setRespondendo(null)}
              currentContactId={conversation.contact_id}
            />
          </>
        ) : (
          <p
            className="border-t border-border px-4 py-3 text-center text-xs text-text-muted"
            data-testid="conversa-somente-leitura"
          >
            {t("Seu acesso é de leitura: você acompanha a conversa, mas não responde.")}
          </p>
        )}
      </>
    );
  },
);
