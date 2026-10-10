"use client";
import { forwardRef, type ReactNode, useId, useState } from "react";

import { CaretDown } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** O `data-testid` da seção (contrato dos testes e das sondas). */
  testId: string;
  icone?: ReactNode;
  titulo: string;
  /**
   * O resumo de uma linha que aparece no cabeçalho com a seção FECHADA (P6 da
   * auditoria): "2 de 3 campos", o começo da observação, "1 demanda aberta".
   * `null` = nada a resumir.
   */
  resumo?: string | null;
  abertaInicial?: boolean;
  children: ReactNode;
}

/**
 * Uma seção do Resumo do painel do lead como ACORDEÃO (P6): o cabeçalho é um
 * botão (`aria-expanded`) e, fechada, a seção mostra o resumo de uma linha no
 * lugar do conteúdo.
 *
 * Abre sozinha quando recebe o foco: os atalhos "Detalhes" e "Obs" do cabeçalho
 * do painel rolam até a seção e põem o foco nela (`CRMSidePanel.irPara`), e
 * chegar numa seção fechada seria chegar em lugar nenhum.
 *
 * Nasce aberta por padrão: o conteúdo é o que quem atende lê de relance, e as
 * sondas e os e2e o leem sem clicar. Fechar é escolha de quem quer o painel curto.
 */
export const SecaoRecolhivel = forwardRef<HTMLElement, Props>(function SecaoRecolhivel(
  { testId, icone, titulo, resumo = null, abertaInicial = true, children },
  ref,
) {
  const [aberta, setAberta] = useState(abertaInicial);
  const conteudoId = useId();
  return (
    <section
      ref={ref}
      data-testid={testId}
      data-aberta={aberta ? "true" : "false"}
      tabIndex={-1}
      onFocus={(e) => {
        if (e.target === e.currentTarget) setAberta(true);
      }}
      className="scroll-mt-12 focus:outline-hidden"
    >
      <h3>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={conteudoId}
          onClick={() => setAberta((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-xs font-semibold text-text hover:text-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {icone}
          <span className="shrink-0">{titulo}</span>
          {!aberta && resumo && (
            <span className="min-w-0 flex-1 truncate font-normal text-text-muted" data-testid={`${testId}-resumo`}>
              · {resumo}
            </span>
          )}
          <CaretDown
            size={12}
            aria-hidden
            className={cn("ml-auto shrink-0 text-text-subtle transition-transform", aberta && "rotate-180")}
          />
        </button>
      </h3>
      {aberta && <div id={conteudoId}>{children}</div>}
    </section>
  );
});
