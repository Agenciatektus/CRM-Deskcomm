"use client";

import { useId } from "react";
import { format } from "date-fns";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { CartaoDaPassagem } from "@/lib/escalacao/cartao-da-passagem";
import { Robot } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CorpoDaPassagem } from "./passagem/CorpoDaPassagem";
import { RodapeDaPassagem } from "./passagem/RodapeDaPassagem";

interface Props {
  cartao: CartaoDaPassagem;
  /** Para o gesto de opt-out: a ficha do contato é onde mora o bloqueio. */
  contatoId: string | null;
  /** Assumir a conversa. É o MESMO gesto do cabeçalho — uma rota, um efeito. */
  onAssumir: () => void;
  assumindo: boolean;
}

/**
 * O CARTÃO "POR QUE A IA PASSOU PARA VOCÊ", dentro do fio da conversa.
 *
 * ═══ Por que ele mora aqui, e não no cabeçalho nem no painel lateral ═══
 *
 * O cabeçalho já travou a largura da tela inteira uma vez (707px de
 * `min-content`, empurrando o painel de CRM 311px para fora da viewport em
 * 1280px) — o comentário no topo de `ConversationHeader.tsx` conta a história.
 * Ele é uma barra de selos de 10px; um cartão de seis linhas ali reintroduz o
 * defeito que o `flex-wrap` acabou de consertar.
 *
 * O painel lateral é coluna de CONSULTA: a pessoa olha para lá depois, e ele
 * some em largura apertada.
 *
 * O fio é o eixo de leitura que termina no composer. Ele já intercala mensagens
 * e notas por timestamp, já tem `NoteCard` como cartão não-mensagem, e o
 * auto-scroll traz o fim para a viewport. Como a passagem CALA a IA, ela é quase
 * sempre o último evento quando a pessoa chega — o cartão aparece exatamente
 * onde o olho está antes de o dedo digitar.
 *
 * ═══ O que NÃO pode virar link ═══
 *
 * `falaDoCliente` e `textoDeQuemPassou` são texto de FORA (o cliente, o modelo,
 * um agente MCP). Eles já passaram por `sanitizarTextoDoLead` na escrita, mas a
 * regra na tela é mais simples e mais segura: **nada aqui vira `<a>`**. Um link
 * renderizado a partir do que o cliente digitou é phishing dentro do CRM, de
 * graça e com a autoridade da nossa interface.
 *
 * ═══ Acessibilidade ═══
 *
 * `<article aria-labelledby>` com `<h3>` — o cartão é um marco, não um parágrafo
 * solto no fio. O ⚠ tem `aria-hidden` e a severidade viaja no TEXTO ("O cliente
 * NÃO foi avisado"), nunca só na cor: cor não sobrevive ao daltonismo nem ao
 * teste do metro. As tentativas são `<ol>` de verdade, e as passagens antigas
 * usam `<details>` nativo — teclado e leitor de tela de graça.
 *
 * ⚠️ **GUARDA DE LOCALIZADOR.** O convite se chama "Assumir e responder", e o
 * cabeçalho tem um botão "Assumir". As duas specs que clicam o do cabeçalho usam
 * localizador ANCORADO (`{ name: "Assumir", exact: true }` em
 * `encerramento-atendimento.spec.ts` e `/^Assumir$/i` em
 * `inbox-quem-manda.spec.ts`), então elas passam — **mas a margem é de uma
 * palavra**. Encurtar este rótulo para "Assumir" faz as duas virarem *strict
 * mode violation*, e o vermelho aparece longe daqui.
 */
export function PassagemCard({ cartao, contatoId, onAssumir, assumindo }: Props) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const tituloId = useId();
  const hora = format(new Date(cartao.criadoEm), "dd/MM HH:mm", { locale: localeDaData });

  if (cartao.recolhido) {
    return (
      <div className="flex w-full justify-center px-4 py-1">
        <details
          className="w-full max-w-[min(92%,40rem)] rounded-2xl border border-border bg-surface/70 px-3.5 py-2 text-sm"
          data-testid="cartao-passagem"
          data-passagem-recolhido="true"
        >
          <summary className="cursor-pointer text-xs text-text-subtle">
            {t(cartao.motivo)}
            {cartao.percebidoPeloJev && <> {t("(percebido pelo Jev)")}</>} · {hora}
          </summary>
          <div className="mt-2">
            <CorpoDaPassagem cartao={cartao} tituloId={tituloId} />
          </div>
        </details>
      </div>
    );
  }

  const emAberto = cartao.estado === "aberta";

  // Visual v2 (fase 3.5): cabeçalho em faixa colorida, corpo e rodapé
  // separados por linha. Em aberto o cabeçalho é de AVISO (alguém precisa agir);
  // reconhecida ou devolvida, ele volta ao tom do accent, que só informa.
  return (
    <div className="flex w-full justify-center px-4 py-2">
      <article
        aria-labelledby={tituloId}
        data-testid="cartao-passagem"
        data-passagem-estado={cartao.estado}
        className={cn(
          "w-full max-w-[min(92%,40rem)] overflow-hidden rounded-2xl border bg-surface text-sm shadow-xs",
          emAberto ? "border-warning/50" : "border-border",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-3.5 py-2.5",
            emAberto ? "bg-warning-bg text-warning-fg" : "bg-accent-soft text-accent-700 dark:text-accent-300",
          )}
        >
          <h3 id={tituloId} className="flex items-center gap-1.5 text-sm font-semibold">
            <Robot size={15} weight="fill" aria-hidden />
            {t(cartao.titulo)}
          </h3>
          <span className="ml-auto shrink-0 text-xs text-text-subtle">{hora}</span>
        </div>

        <div className="px-3.5 pb-3 pt-1">
          <CorpoDaPassagem cartao={cartao} tituloId={tituloId} />
        </div>

        <RodapeDaPassagem cartao={cartao} contatoId={contatoId} onAssumir={onAssumir} assumindo={assumindo} />
      </article>
    </div>
  );
}
