"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { CartaoDaPassagem } from "@/lib/escalacao/cartao-da-passagem";
import { cn } from "@/lib/utils";

/** A faixa de baixo do cartão: separada do corpo por uma linha, como no protótipo. */
const RODAPE = "border-t border-border px-3.5 py-2.5 text-xs text-text-subtle";

/**
 * O gesto. QUAL gesto é decisão de `montarCartoesDaPassagem` — aqui só se
 * desenha, porque o vocabulário do banco que distingue os casos é proibido em
 * `components/` (`tests/unit/passagem-motivo-em-portugues.test.ts`).
 */
export function RodapeDaPassagem({
  cartao,
  contatoId,
  onAssumir,
  assumindo,
}: {
  cartao: CartaoDaPassagem;
  contatoId: string | null;
  onAssumir: () => void;
  assumindo: boolean;
}) {
  const t = useT();

  if (cartao.estado === "reconhecida") {
    return (
      <p className={RODAPE}>
        {cartao.assumidaPor === null
          ? t("Alguém da equipe já assumiu este atendimento.")
          : `${t("Assumida por")} ${cartao.assumidaPor}`}
      </p>
    );
  }

  if (cartao.estado === "devolvida") {
    return (
      <p className={RODAPE}>
        {t("Atendimento devolvido ao automático — ninguém assumiu.")}
      </p>
    );
  }

  switch (cartao.acao.tipo) {
    case "assumir_e_responder":
      return (
        <div className={cn(RODAPE, "flex justify-end")}>
          <Button size="sm" onClick={onAssumir} disabled={assumindo} data-testid="passagem-assumir">
            {assumindo ? t("Assumindo...") : t("Assumir e responder")}
          </Button>
        </div>
      );
    case "abrir_contato":
      // Sem convite de responder, de propósito: um botão que diz "assumir e
      // responder" empurra alguém a escrever para quem acabou de pedir para
      // parar de receber mensagens.
      return (
        <div className={cn(RODAPE, "flex justify-end")}>
          {contatoId !== null ? (
            <Button size="sm" variant="outline" asChild data-testid="passagem-abrir-contato">
              <Link href={`/app/contacts/${contatoId}`}>
                {t("Abrir o contato para confirmar o bloqueio")}
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-text-subtle">
              {t("Confirme na ficha do contato se ele pediu para não receber mais mensagens.")}
            </p>
          )}
        </div>
      );
    case "avisa_quem_atende":
      // O gesto que existe é transferir, e ele mora no cabeçalho. Duplicá-lo
      // aqui seria dois botões para um ato; ficar mudo deixaria o cartão mais
      // caro da entrega sem nada a dizer para metade dos leitores.
      return (
        <p className={RODAPE}>
          {cartao.acao.donoNome === null
            ? t("Outra pessoa está atendendo. Se precisar assumir, use Transferir no topo da conversa.")
            : `${cartao.acao.donoNome} ${t("está atendendo. Se precisar assumir, use Transferir no topo da conversa.")}`}
        </p>
      );
    case "nenhuma":
      return null;
  }
}
