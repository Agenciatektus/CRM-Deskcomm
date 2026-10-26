"use client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { acoesDaConexao, destinoDeGerenciar, type AcaoDaConexao, type ItemDeConexao } from "@/lib/channels/conexoes-lista";
import { ArrowsClockwise, ChatCircle, Pause, Play, ShieldCheck, Trash, UsersThree } from "@/lib/ui/icons";

import { AcoesConexaoPresa } from "./AcoesConexaoPresa";
import { RenomearConexao } from "./RenomearConexao";

export interface AcoesDaConexaoProps {
  item: ItemDeConexao;
  /** O serviço de WhatsApp por QR está no ar neste ambiente. */
  transporteNoAr: boolean;
  /** Está configurado (excluir canal por QR precisa dele). */
  transporteConfigurado: boolean;
  ocupado: boolean;
  onAcao: (acao: AcaoDaConexao, item: ItemDeConexao) => void;
  onRecarregar: () => Promise<void>;
}

/**
 * As ações de UMA conexão, decididas por `acoesDaConexao` (estado -> ações). Esta peça só
 * desenha e delega: abrir diálogo, pausar etc. são do pai, que tem um diálogo só para a lista.
 * Retomar (nativa presa) e Cancelar reaproveitam `AcoesConexaoPresa`, que já pede confirmação.
 */
export function AcoesDaConexao({
  item,
  transporteNoAr,
  transporteConfigurado,
  ocupado,
  onAcao,
  onRecarregar,
}: AcoesDaConexaoProps) {
  const t = useT();
  const acoes = acoesDaConexao(item, transporteNoAr);
  const nome = item.nome;
  const podeExcluir = transporteConfigurado || !item.viveNoTransporte;

  if (acoes.includes("continuar")) {
    return (
      <AcoesConexaoPresa
        canalId={item.id}
        onContinuar={() => onAcao("continuar", item)}
        onCancelado={() => void onRecarregar()}
        onConferir={onRecarregar}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {acoes.map((a) => {
        switch (a) {
          case "abrir":
            return (
              <Button key={a} asChild variant="outline" size="sm">
                <Link href="/app/inbox" aria-label={`${t("Abrir conversas")} ${nome}`}>
                  <ChatCircle size={14} aria-hidden />
                  {t("Abrir conversas")}
                </Link>
              </Button>
            );
          case "renomear":
            return (
              <RenomearConexao
                key={a}
                channelId={item.id}
                currentName={item.nomeCru}
                onSaved={() => onRecarregar()}
              />
            );
          case "protecao":
            return (
              <Button key={a} variant="outline" size="sm" onClick={() => onAcao(a, item)}>
                <ShieldCheck size={14} aria-hidden />
                {t("Proteção de envio")}
              </Button>
            );
          case "pausar":
          case "retomar":
            return (
              <Button
                key={a}
                variant={a === "retomar" ? "primary" : "outline"}
                size="sm"
                disabled={ocupado}
                aria-label={`${a === "retomar" ? t("Retomar") : t("Pausar")} ${nome}`}
                onClick={() => onAcao(a, item)}
              >
                {a === "retomar" ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
                {a === "retomar" ? t("Retomar") : t("Pausar")}
              </Button>
            );
          case "grupos":
            return (
              <Button key={a} variant="outline" size="sm" onClick={() => onAcao(a, item)}>
                <UsersThree size={14} aria-hidden />
                {t("Grupos")}
              </Button>
            );
          case "reconectar":
            return (
              <Button key={a} size="sm" disabled={ocupado} onClick={() => onAcao(a, item)}>
                <ArrowsClockwise size={14} aria-hidden />
                {t("Reconectar")}
              </Button>
            );
          case "gerenciar":
            return (
              <Button key={a} asChild variant="outline" size="sm">
                <Link href={destinoDeGerenciar(item)} aria-label={`${t("Gerenciar")} ${nome}`}>
                  {t("Gerenciar")}
                </Link>
              </Button>
            );
          case "excluir":
            return (
              <Button
                key={a}
                variant="outline"
                size="sm"
                disabled={!podeExcluir}
                aria-label={`${t("Excluir")} ${nome}`}
                onClick={() => onAcao(a, item)}
              >
                <Trash size={14} aria-hidden />
                {t("Excluir")}
              </Button>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
