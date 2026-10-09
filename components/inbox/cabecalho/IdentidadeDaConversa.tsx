"use client";
import { AvatarDoContato } from "@/components/inbox/AvatarDoContato";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { initials } from "@/components/inbox/item/tempo-da-linha";
import { OwnerBadge } from "@/components/kanban/OwnerBadge";
import type { ChannelSummary, ContactSummary } from "@/hooks/inbox/useConversationsRealtime";
import { useT } from "@/hooks/i18n/useT";
import { channelBrand, CHANNEL_BRAND_LABEL } from "@/lib/channels/presentation";
import type { Comando } from "@/lib/inbox/comando-da-conversa";
import { cn } from "@/lib/utils";

/** O separador do protótipo: um ponto desenhado, não um caractere na frase. */
function Sep() {
  return <i className="h-1 w-1 shrink-0 rounded-full bg-border-strong" aria-hidden />;
}

interface Props {
  nome: string;
  /** Rótulo do ciclo de vida, já traduzido (Aberta, Fechada…). */
  status: string;
  encerrada: boolean;
  canal: ChannelSummary | null | undefined;
  telefone: string | null;
  comando: Comando;
  meuUserId: string;
  /** O contato, para o avatar com a cor da pessoa (a mesma da lista e do painel). */
  contato?: ContactSummary | null;
}

/**
 * QUEM é a conversa: nome, ciclo de vida, canal, telefone e quem atende.
 *
 * O dono continua desenhado pelo `OwnerBadge`, o mesmo do card do funil e do
 * dossiê (disco cheio para pessoa, anel vazado para o automático). Um quarto
 * jeito de dizer "quem manda" faria a mesma pergunta ter respostas diferentes
 * na mesma tela. O testid é contrato de `inbox-quem-manda.spec.ts`.
 */
export function IdentidadeDaConversa({ nome, status, encerrada, canal, telefone, comando, meuUserId, contato = null }: Props) {
  const t = useT();
  const marca = channelBrand(canal);
  const rotuloDoCanal = marca === "unknown" ? null : CHANNEL_BRAND_LABEL[marca];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {/* O avatar repete a cor da linha da lista: o olho reconhece que abriu a
          pessoa certa antes de ler o nome. */}
      <AvatarDoContato contato={contato} nome={nome} iniciais={initials(nome, telefone ?? "?")} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-base font-bold" title={nome}>
            {nome}
          </h1>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-2 py-px text-xs font-semibold",
              encerrada ? "bg-surface-elevated text-text-muted" : "bg-success-bg text-success-fg",
            )}
          >
            {status}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] text-text-muted">
          {canal && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <ChannelLogo channel={canal} size={14} />
              {rotuloDoCanal}
            </span>
          )}
          {canal && telefone && <Sep />}
          {telefone && <span className="truncate font-mono text-xs">{telefone}</span>}
          {(canal || telefone) && <Sep />}
          <span className="min-w-0" data-testid="comando-da-conversa">
            {comando.quem === "humano" ? (
              <OwnerBadge
                ownerKind="user"
                ownerName={comando.userId === meuUserId ? t("Você") : (comando.nome ?? t("Atendente"))}
                compacto
              />
            ) : comando.quem === "automatico" ? (
              <OwnerBadge ownerKind="ai" ownerName={t("Automático")} compacto />
            ) : (
              // `ninguem`, `aguardando` e `encerrada` sem dono: o disco TRACEJADO,
              // que é como o funil já desenha "ninguém".
              <OwnerBadge ownerKind={null} ownerName={null} compacto />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
