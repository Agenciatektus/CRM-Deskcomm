import { Cartao } from "./Cartao";
import { reais, somaEtapa, type Cartao as DadosDoCartao, type Etapa } from "./dados";

/**
 * Coluna do quadro (StageColumn): 320 px, cabeçalho grudado com ponto da etapa, nome e contador,
 * faixa com a soma da etapa e o valor ponderado quando há probabilidade, e os cartões.
 * Na vista de celular (`lista`) ocupa a largura toda e empilha.
 */
export function Coluna({ etapa, cartoes, lista = false }: { etapa: Etapa; cartoes: DadosDoCartao[]; lista?: boolean }) {
  const { soma, ponderado } = somaEtapa(etapa, cartoes);
  return (
    <section
      aria-label={`${etapa.nome}, ${cartoes.length} ${cartoes.length === 1 ? "lead" : "leads"}`}
      className={`flex flex-col self-start rounded-lg border border-border bg-surface-2/60 ${lista ? "w-full" : "w-80 shrink-0"}`}
    >
      <div className="sticky top-0 z-10 rounded-t-lg border-b border-border bg-surface">
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <i aria-hidden="true" className="size-2 rounded-full" style={{ background: etapa.cor }} />
          <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold">{etapa.nome}</h4>
          <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
            {cartoes.length}
          </span>
        </div>
        <p className="m-0 flex items-center gap-2 px-3 pt-1 pb-2 text-[11px] text-text-muted tabular-nums">
          <span>{reais(soma)}</span>
          {ponderado !== undefined ? <span>ponderado {reais(ponderado)}</span> : null}
        </p>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {cartoes.length ? (
          cartoes.map((k) => <Cartao key={k.id} k={k} />)
        ) : (
          <p className="m-0 py-6 text-center text-xs text-text-subtle">vazio</p>
        )}
      </div>
    </section>
  );
}
