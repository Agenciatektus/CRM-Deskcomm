"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Robot } from "@/lib/ui/icons";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { Badge } from "@/components/ui/badge";
import { comandoDaConversa, esperaDaConversa } from "@/lib/inbox/comando-da-conversa";
import { cn } from "@/lib/utils";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

import { AvatarDoContato } from "./AvatarDoContato";
import { BotaoMaisAcoes } from "./menu/BotaoMaisAcoes";
import { gatilhosDoMenu, type AbrirMenu } from "./menu/useMenuDaConversa";
import { MetaDaConversa } from "./item/MetaDaConversa";
import { IconesPessoais } from "./item/IconesPessoais";
import { naoLidasDaConversa } from "@/lib/inbox/estado-por-atendente";
import { initials, relativeTime, siglaDoTelefone } from "./item/tempo-da-linha";

interface Props {
  conversation: ConversationWithContact;
  isSelected: boolean;
  onSelect: (id: string) => void;
  /** Posição 1-based na fila (G5-03). Presente só na visão Fila. */
  queuePosition?: number;
  /**
   * Mostrar POR ONDE a conversa entrou.
   *
   * Só com mais de um número conectado. Com um só, o rótulo seria a mesma
   * palavra em toda linha da lista: ruído que ensina o olho a ignorar a área
   * onde vivem os avisos que importam (bloqueado, tags).
   */
  mostrarCanal?: boolean;
  /**
   * Mostrar QUEM está no comando de cada conversa.
   *
   * Mesma regra do canal, e pelo mesmo motivo: só quando o rótulo DISCRIMINA.
   * Quem decide é a lista, que é quem sabe quantos donos distintos ela tem.
   */
  mostrarAtendente?: boolean;
  /**
   * Mostrar o ícone de robô na prévia da mensagem, quando quem manda é o
   * automático. Mesma regra dos dois badges acima: só quando DISCRIMINA. Ausente
   * ou `true` = mostra (comportamento anterior, seguro para o teste que não
   * passa esta prop).
   */
  mostrarAutomatico?: boolean;
  /**
   * A org tem atendimento automático de pé? Vem por PROP e não por hook: um hook
   * por linha faria 50 assinaturas de query na mesma lista para responder a MESMA
   * pergunta org-wide. `undefined` = "não sei", e a função trata isso como "não
   * afirme nada".
   */
  automaticoDaOrg?: boolean;
  /** Quem está logado. Por prop pelo mesmo motivo do `automaticoDaOrg`. */
  meuUserId?: string | null;
  /**
   * Abre o menu de contexto da conversa (fase 3.6). Ausente = linha sem menu,
   * do jeito de antes: quem renderiza o item fora da lista não ganha um "…"
   * que não abre nada.
   */
  onAbrirMenu?: AbrirMenu;
  /** O menu está aberto NESTA linha: o "…" fica visível enquanto isso. */
  menuAberto?: boolean;
}

export function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
  queuePosition,
  mostrarCanal,
  mostrarAtendente,
  mostrarAutomatico = true,
  automaticoDaOrg,
  meuUserId,
  onAbrirMenu,
  menuAberto,
}: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const c = conversation.contacts ?? null;
  const displayName = rotuloDoContato(c, t);
  const phoneFallback = siglaDoTelefone(c?.phone_number);
  // L15: a prévia é cortada pelo CSS (`truncate`), na largura que a coluna tem,
  // e não em 60 caracteres fixos que sobravam na lista larga e estouravam na
  // estreita.
  const truncated = conversation.last_message_preview?.trim() || t("Sem mensagens");
  const naFila = queuePosition !== undefined;
  /**
   * A HORA DO CANTO RESPONDE À MESMA PERGUNTA QUE ORDENA A LISTA.
   *
   * Na Fila a lista sai por TEMPO DE ESPERA (`awaiting_since` crescente, #990),
   * mas a hora do canto era a da última mensagem de QUALQUER lado: bastava o
   * atendente responder para o número pular para agora sem a linha sair do
   * lugar, e a coluna de horas saía fora de ordem (#464).
   *
   * Fora da Fila a ordem é por atividade recente, e aí a última mensagem de
   * qualquer lado É a resposta certa. A origem é a MESMA da pílula de espera,
   * inclusive no fallback.
   */
  const horaDaOrdem = naFila ? esperaDaConversa(conversation) : conversation.last_message_at;
  const time = relativeTime(horaDaOrdem, localeDaData);
  // 9042: a marca "não lida" de quem está logado conta como 1 quando o contador zerou.
  const unread = naoLidasDaConversa(conversation);
  const naoLida = unread > 0;
  const soMarcada = naoLida && !(conversation.unread_count_for_assignee ?? 0);

  /**
   * Quem manda, pela MESMA regra do cabeçalho. `status === 'ai_handling'` era um
   * proxy ruim: o único escritor desse status em produção é o botão "Devolver ao
   * automático", então o robô quase nunca aparecia.
   */
  const { comando } = comandoDaConversa({
    status: conversation.status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: c?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg,
  });
  const isAi = comando.quem === "automatico";

  // O número DA EMPRESA por onde esta conversa chegou, não o do cliente. Com
  // dois canais é o que decide o tom da resposta e qual número a pessoa vê
  // respondendo. Cai no nome do canal quando não há número (canal recém-criado).
  const canal = conversation.channel_sessions ?? null;
  const rotuloCanal = canal?.phone_number ?? canal?.display_name ?? null;

  const gatilhos = gatilhosDoMenu(conversation.id, onAbrirMenu, !!menuAberto);

  const linha = (
    <button
      type="button"
      data-conversation-id={conversation.id}
      data-nao-lida={naoLida ? "true" : undefined}
      onClick={() => onSelect(conversation.id)}
      {...gatilhos}
      className={cn(
        "group relative grid w-full grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-border px-3.5 py-3 text-left transition-colors hover:bg-surface-elevated/60",
        "focus-visible:outline-hidden focus-visible:bg-surface-elevated/60",
        // Selecionada (L13): o `accent-soft` do protótipo, com a barra de 3px.
        // No escuro a pele troca pelo degradê horizontal da marca
        // (`pele-selecionada`), que se destaca do card mesmo com marca escura.
        isSelected && "pele-selecionada bg-accent-soft hover:bg-accent-soft",
      )}
      aria-current={isSelected ? "true" : undefined}
    >
      {/* Marcador da seleção: o `conv.is-sel::before` do protótipo, recuado em
          cima e embaixo para não colar na borda da linha vizinha. */}
      {isSelected && (
        <span className="pele-grad-traco absolute inset-y-1.5 left-0 w-[3px] rounded-r-sm bg-accent" aria-hidden />
      )}
      <div className="relative h-10 w-10 shrink-0">
        {/* Cor por pessoa (hash do id), a mesma do cabeçalho e do painel. */}
        <AvatarDoContato contato={c} nome={displayName} iniciais={initials(displayName, phoneFallback)} />
        {/* Não há mais a bolinha de "quem manda" no canto esquerdo: ela
            sobrepunha o avatar e repetia o que a pílula de dono já diz (e só
            onde discrimina). O canto do avatar é do selo do canal (WhatsApp,
            Instagram…), como no protótipo. */}
        <ChannelLogo
          channel={canal}
          size={12}
          // O anel tem a cor do FUNDO DA LINHA (que muda na seleção), para o
          // selo recortar o avatar em vez de flutuar com uma borda de outra cor.
          className={cn(
            "absolute -bottom-1 -right-1 h-[18px] w-[18px] rounded-full ring-2",
            isSelected ? "bg-surface-elevated ring-surface-elevated" : "bg-surface ring-surface",
          )}
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[14.5px] text-text",
                naoLida ? "font-bold" : "font-semibold",
                c?.is_anonymized && "font-normal italic text-text-muted",
              )}
            >
              {displayName}
            </span>
            {/* A ETIQUETA "GRUPO", ao lado do nome: sem ela a lista não distingue
                um grupo de uma conversa individual até abrir a conversa. */}
            {conversation.is_group && (
              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                {t("Grupo")}
              </Badge>
            )}
          </span>
          <IconesPessoais pinned={conversation.pinned} mutedUntil={conversation.muted_until} />
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              naoLida ? "font-semibold text-accent" : "text-text-subtle",
            )}
            // O mesmo lugar mostra duas coisas conforme a aba: na Fila é "desde
            // quando o cliente ESPERA" (#990), nas outras é "há quanto tempo a
            // conversa mexeu". O rótulo existe só onde a leitura muda.
            title={naFila ? t("Desde quando o cliente espera resposta") : undefined}
          >
            {time}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px]",
              naoLida ? "text-text" : "text-text-muted",
            )}
          >
            {isAi && mostrarAutomatico ? (
              <Robot size={12} weight="duotone" className="mr-1 inline align-[-2px]" aria-hidden />
            ) : null}
            {truncated}
          </p>
          {naoLida && (
            <span
              className="pele-grad inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-accent-foreground"
              aria-label={soMarcada ? t("Marcada como não lida") : `${unread} ${t("mensagens não lidas")}`}
            >
              {soMarcada ? "" : unread}
            </span>
          )}
        </div>

        <MetaDaConversa
          conversation={conversation}
          comando={comando}
          queuePosition={queuePosition}
          mostrarAtendente={mostrarAtendente}
          rotuloCanal={rotuloCanal}
          mostrarCanal={mostrarCanal}
          meuUserId={meuUserId}
        />
      </div>
    </button>
  );

  if (!onAbrirMenu) return linha;

  // Um <button> não pode morar dentro de outro: o "…" é IRMÃO da linha.
  return (
    <div className="group/linha relative" data-menu-aberto={menuAberto ? "true" : undefined}>
      {linha}
      <BotaoMaisAcoes
        nome={displayName}
        aberto={!!menuAberto}
        onAbrir={(el) => onAbrirMenu(conversation.id, el, el)}
      />
    </div>
  );
}
