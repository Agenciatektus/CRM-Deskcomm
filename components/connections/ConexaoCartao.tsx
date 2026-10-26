"use client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import {
  detalheDaConexao,
  precisaDeAtencao,
  ROTULO_DO_METODO,
  type ItemDeConexao,
  type TipoDeConexao,
} from "@/lib/channels/conexoes-lista";
import { lerEstadoDoCanal } from "@/lib/channels/estado";
import { cn } from "@/lib/utils";
import { InstagramLogo, Phone, WhatsappLogo } from "@/lib/ui/icons";

import { AcoesDaConexao, type AcoesDaConexaoProps } from "./AcoesDaConexao";
import { ChannelAiAccess } from "./ChannelAiAccess";

export type PropsDeAcoes = Omit<AcoesDaConexaoProps, "item" | "ocupado"> & { ocupadoId: string | null };

export function IconeDoTipo({ tipo, className }: { tipo: TipoDeConexao; className?: string }) {
  const Icone = tipo === "instagram" ? InstagramLogo : tipo === "ligacao" ? Phone : WhatsappLogo;
  return (
    <span
      className={cn("grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text", className)}
      aria-hidden
    >
      <Icone size={18} />
    </span>
  );
}

/** O estado, na palavra do produto. Pausado vence: o canal pode estar conectado e mudo. */
export function SeloDeStatus({ item }: { item: ItemDeConexao }) {
  const t = useT();
  if (item.pausado) return <Badge variant="neutral">{t("Pausado")}</Badge>;
  const leitura = lerEstadoDoCanal(item.status);
  return <Badge variant={leitura.tom}>{t(leitura.rotulo)}</Badge>;
}

export function SeloDoMetodo({ item }: { item: ItemDeConexao }) {
  const t = useT();
  return <Badge variant="tag">{t(ROTULO_DO_METODO[item.metodo])}</Badge>;
}

export function numeroOuAviso(item: ItemDeConexao, t: (x: string) => string): string {
  return item.numero ?? t("Sem número ainda");
}

/** O cartão da Galeria (e da Lista no celular, em `compacto`). */
export function CartaoDaConexao({
  item,
  compacto = false,
  agora,
  ocupadoId,
  ...acoes
}: PropsDeAcoes & { item: ItemDeConexao; compacto?: boolean; agora: number }) {
  const t = useT();
  return (
    <Card
      data-testid={`conexao-${item.id}`}
      className={cn(
        "flex flex-col gap-3 p-4",
        precisaDeAtencao(item) && (item.status === "FAILED" || item.status === "STOPPED")
          ? "border-error/40"
          : precisaDeAtencao(item)
            ? "border-warning/40"
            : "",
      )}
    >
      <div className="flex items-start gap-3">
        <IconeDoTipo tipo={item.tipo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{item.nome}</span>
            <SeloDeStatus item={item} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{numeroOuAviso(item, t)}</span>
            <SeloDoMetodo item={item} />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{detalheDaConexao(item, agora, t)}</p>
      {!compacto && item.fonte === "canal" && item.status === "WORKING" && !item.pausado && (
        <div id={`canal-ia-${item.id}`}>
          <ChannelAiAccess channelId={item.id} />
        </div>
      )}
      <div className="mt-auto">
        <AcoesDaConexao item={item} ocupado={ocupadoId === item.id} {...acoes} />
      </div>
    </Card>
  );
}

/** A linha da tabela da Lista (telas largas). */
export function LinhaDaConexao({
  item,
  agora,
  ocupadoId,
  ...acoes
}: PropsDeAcoes & { item: ItemDeConexao; agora: number }) {
  const t = useT();
  return (
    <tr data-testid={`conexao-${item.id}`} className="border-t border-border align-middle">
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <IconeDoTipo tipo={item.tipo} className="size-8" />
          <span className="text-sm font-medium">{item.nome}</span>
        </div>
      </td>
      <td className="px-3 py-3 font-mono text-xs">{numeroOuAviso(item, t)}</td>
      <td className="px-3 py-3">
        <SeloDoMetodo item={item} />
      </td>
      <td className="px-3 py-3">
        <SeloDeStatus item={item} />
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{detalheDaConexao(item, agora, t)}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end">
          <AcoesDaConexao item={item} ocupado={ocupadoId === item.id} {...acoes} />
        </div>
      </td>
    </tr>
  );
}
