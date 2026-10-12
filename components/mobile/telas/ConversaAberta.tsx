"use client";
import { useRef, useState } from "react";

import { AvatarDoContato } from "@/components/inbox/AvatarDoContato";
import { initials, siglaDoTelefone } from "@/components/inbox/item/tempo-da-linha";
import { formatMoney } from "@/components/inbox/painel/SemLista";
import { DialogosDoMenu, type DialogoDoMenu } from "@/components/inbox/menu/DialogosDoMenu";
import { DialButton } from "@/components/voice/DialButton";
import { useAuth, usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useFunilDoContato } from "@/hooks/inbox/useFunilDoContato";
import { channelBrand, CHANNEL_BRAND_LABEL } from "@/lib/channels/presentation";
import { useEhCelular } from "@/lib/mobile/useEhCelular";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { comandoDaConversa } from "@/lib/inbox/comando-da-conversa";
import { CaretDown, CaretLeft, Check, DotsThree, Funnel, Phone } from "@/lib/ui/icons";
import { useArmado } from "@/hooks/ui/useArmado";
import { cn } from "@/lib/utils";

import { FolhaInferior } from "../FolhaInferior";

/**
 * A barra da conversa aberta NO CELULAR (o `.nb` do item 02 do protótipo): voltar,
 * avatar e nome (tocar abre a ficha), canal e quem atende na linha de baixo, Ligar e
 * o ⋮ (o menu da conversa, com as ações do lead primeiro, que no celular é folha).
 * Só abaixo de 760px (`largo:hidden`); o cabeçalho do desktop some lá (`mb:hidden`).
 */
export function BarraDaConversaNoCelular({
  conversation,
  automaticoDaOrg,
  meuUserId,
  onVoltar,
  onAbrirFicha,
  onAbrirMenu,
}: {
  conversation: ConversationWithContact;
  automaticoDaOrg?: boolean;
  meuUserId: string | null;
  onVoltar: () => void;
  onAbrirFicha: () => void;
  onAbrirMenu: (el: HTMLElement) => void;
}) {
  const t = useT();
  const botaoDoMenu = useRef<HTMLButtonElement | null>(null);
  const celular = useEhCelular();
  const c = conversation.contacts ?? null;
  const nome = rotuloDoContato(c, t);
  const marca = channelBrand(conversation.channel_sessions ?? null);
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
  const quem =
    comando.quem === "humano"
      ? comando.userId === meuUserId
        ? t("Você está atendendo")
        : `${comando.nome ?? t("Atendente")} ${t("está atendendo")}`
      : comando.quem === "automatico"
        ? t("IA atendendo")
        : t("Sem responsável");
  const canal = marca === "unknown" ? null : CHANNEL_BRAND_LABEL[marca];

  return (
    <div className="flex min-h-(--mb-barra-altura) items-center gap-0.5 border-b border-border bg-surface px-1 largo:hidden">
      <button
        type="button"
        onClick={onVoltar}
        aria-label={t("Voltar")}
        className="pele-foco grid size-(--mb-alvo) shrink-0 place-items-center rounded-full text-accent-text hover:bg-hover"
      >
        <CaretLeft size={22} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onAbrirFicha}
        aria-label={`${t("Abrir ficha de")} ${nome}`}
        className="pele-foco flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 text-left hover:bg-hover"
      >
        <AvatarDoContato
          contato={c}
          nome={nome}
          iniciais={initials(nome, siglaDoTelefone(c?.phone_number))}
          className="size-[38px] text-[13px]"
        />
        <span className="flex min-w-0 flex-col">
          <b className="truncate text-base text-text">{nome}</b>
          <small className="truncate text-[12.5px] text-text-muted">{[canal, quem].filter(Boolean).join(" · ")}</small>
        </span>
      </button>
      {/* Só no celular de fato: o Ligar do desktop é o do cabeçalho, e a chamada pede
          o provedor de voz da casca. */}
      {celular && !conversation.is_group && c?.id && <LigarComConfirmacao contactId={c.id} hasPhone={!!c.phone_number} nome={nome} />}
      <button
        ref={botaoDoMenu}
        type="button"
        aria-haspopup="menu"
        aria-label={t("Ações da conversa")}
        onClick={() => botaoDoMenu.current && onAbrirMenu(botaoDoMenu.current)}
        className="pele-foco grid size-(--mb-alvo) shrink-0 place-items-center rounded-full text-text hover:bg-hover"
      >
        <DotsThree size={22} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

/**
 * O "Ligar" do celular pede confirmação (P2-2 do Cassio na #180): um toque perdido
 * na barra não pode começar uma chamada. A folha "Ligar para Fulano?" traz o botão
 * de chamada de verdade (`DialButton`), armado só depois de 300 ms (`useArmado`).
 */
function LigarComConfirmacao({ contactId, hasPhone, nome }: { contactId: string; hasPhone: boolean; nome: string }) {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-label={t("Ligar")}
        className="pele-foco grid size-(--mb-alvo) shrink-0 place-items-center rounded-full text-text hover:bg-hover"
      >
        <Phone size={22} aria-hidden />
      </button>
      <FolhaInferior aberto={aberta} aoMudar={setAberta} titulo={`${t("Ligar para")} ${nome}?`}>
        {aberta && <BotaoDeLigarArmado contactId={contactId} hasPhone={hasPhone} />}
      </FolhaInferior>
    </>
  );
}

function BotaoDeLigarArmado({ contactId, hasPhone }: { contactId: string; hasPhone: boolean }) {
  const armado = useArmado();
  return (
    <div className={cn("flex justify-center px-3 py-4", !armado && "pointer-events-none opacity-60")} aria-busy={!armado}>
      <DialButton contactId={contactId} hasPhone={hasPhone} />
    </div>
  );
}

/**
 * A faixa do negócio sob a barra (o `.ldbar` do protótipo): etapa, funil e valor do
 * lead do contato. Tocar abre a folha "Mover etapa", com a MESMA régua do submenu do
 * menu da conversa (`useFunilDoContato`): mover, ganhar, perder (com o motivo) e
 * levar para outro funil. Sem negócio, a faixa não aparece.
 */
export function FaixaDoLead({ contactId }: { contactId: string }) {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  const [dialogo, setDialogo] = useState<DialogoDoMenu | null>(null);
  // Só informativa para quem não pode mover (viewer, suporte somente leitura): a
  // mesma régua da barra de etapas do painel (P2-1 do Cassio na #180).
  const { user } = useAuth();
  const podeMover = usePermission("pipeline.move_card") && user.support?.access_mode !== "support_readonly";
  const { lead, etapas, indiceAtual, escolher, mover, ganhar, ganhoPendente } = useFunilDoContato(contactId, true, (d) => {
    setAberta(false);
    setDialogo({ ...d, contactId });
  });
  if (!lead) return null;
  const etapa = lead.status === "won" ? t("Ganho") : lead.status === "lost" ? t("Perdido") : (lead.etapa_nome ?? "");
  // O mesmo formato do painel do lead; sem valor, a faixa não mostra número.
  const valor = lead.value_cents ? formatMoney(lead.value_cents, lead.currency) : null;
  const aberto = lead.status === "open" && podeMover;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        disabled={!aberto}
        onClick={() => setAberta(true)}
        aria-label={`${t("Negócio")}: ${etapa}${lead.funil_nome ? `, ${lead.funil_nome}` : ""}${valor ? `, ${valor}` : ""}`}
        className="flex min-h-(--mb-alvo) w-full items-center gap-2.5 border-b border-border bg-mb-barra pr-3 pl-4 text-left text-[13.5px] text-text-muted largo:hidden"
      >
        <Funnel size={18} aria-hidden />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
          <b className="text-[14.5px] text-text">{etapa}</b>
          {lead.funil_nome && <span className="truncate">{lead.funil_nome}</span>}
        </span>
        {valor && <span className="font-bold whitespace-nowrap text-text">{valor}</span>}
        {aberto && <CaretDown size={18} aria-hidden />}
      </button>
      <FolhaInferior aberto={aberta} aoMudar={setAberta} titulo={t("Mover etapa")} subtitulo={lead.funil_nome ?? undefined}>
        {etapas.map((e, i) => (
          <button
            key={e.id}
            type="button"
            disabled={mover.isPending || ganhar.isPending || ganhoPendente}
            aria-current={i === indiceAtual ? "step" : undefined}
            onClick={() => {
              setAberta(false);
              escolher(e.id);
            }}
            className="pele-foco flex min-h-(--mb-folha-item) w-full items-center gap-3 rounded-[14px] px-3 text-left text-base font-semibold text-text hover:bg-hover"
          >
            <span
              aria-hidden
              className={cn(
                "size-3 shrink-0 rounded-full border-2 border-border-strong",
                i <= indiceAtual && "border-accent bg-accent",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            {i === indiceAtual && <Check size={18} className="text-accent-text" aria-hidden />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setAberta(false);
            setDialogo({ tipo: "outro-funil", lead, contactId });
          }}
          className="pele-foco flex min-h-(--mb-folha-item) w-full items-center rounded-[14px] px-3 text-left text-base font-semibold text-accent-text hover:bg-hover"
        >
          {t("Levar para outro funil…")}
        </button>
      </FolhaInferior>
      <DialogosDoMenu dialogo={dialogo} onFechar={() => setDialogo(null)} />
    </>
  );
}
