import { CTA, GARANTIA, GARANTIA_CONFIRMADA, OBJECOES, OFERTA, PARA_QUEM, linkWhatsapp } from "@/lib/conteudo";

import { BotaoSecundario } from "./Botao";
import { Planos } from "./Planos";
import { Card, Cabeca, Secao } from "./Secao";
import { Icone } from "./ui/Icones";

/** Oferta: seletor de período, os dois planos em comparativo, a implantação opcional e a dúvida. */
export function Oferta() {
  return (
    <Secao id="oferta" titulo="titulo-oferta" fundo="grade" largura="grade" ritmo="l">
      <Cabeca id="titulo-oferta" titulo={OFERTA.titulo} />
      <Planos />
      <div className="revela mt-8 flex flex-wrap items-center gap-3">
        <BotaoSecundario href={linkWhatsapp(CTA.duvida.mensagem)}>
          {CTA.duvida.rotulo}
        </BotaoSecundario>
      </div>
      <p className="mt-3 mb-0 text-[0.95rem] text-text-muted">{OFERTA.apoioCta}</p>
    </Secao>
  );
}

/** Só renderiza com `GARANTIA_CONFIRMADA`. */
export function Garantia() {
  if (!GARANTIA_CONFIRMADA) return null;
  return (
    <Secao titulo="titulo-garantia" fundo="menta" largura="texto">
      <div className="card borda-luz revela mx-auto max-w-[48rem] p-8 text-center sm:p-12">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-border-strong bg-surface-elevated text-ok">
          <Icone nome="escudo" className="size-6" />
        </span>
        <h2 id="titulo-garantia" className="m-0 text-[clamp(1.6rem,3vw,2.4rem)] leading-tight font-bold tracking-tight">
          {GARANTIA.titulo}
        </h2>
        <p className="mt-4 mb-0 text-[1.1rem] leading-relaxed">{GARANTIA.texto}</p>
        <p className="mt-3 mb-0 leading-relaxed text-text-muted">{GARANTIA.limite}</p>
      </div>
    </Secao>
  );
}

export function ParaQuem() {
  return (
    <Secao titulo="titulo-para-quem" fundo="pontos">
      <Cabeca id="titulo-para-quem" titulo={PARA_QUEM.titulo} />
      <div className="grid gap-6 lg:gap-8 md:grid-cols-2 [&>*]:min-w-0">
        {[PARA_QUEM.serve, PARA_QUEM.naoServe].map((b, i) => (
          <Card key={b.titulo} atraso={i * 0.1}>
            <h3 className="m-0 text-[1.15rem] font-bold">{b.titulo}</h3>
            <p className="mt-2 mb-0 leading-relaxed text-text-muted">{b.texto}</p>
          </Card>
        ))}
      </div>
    </Secao>
  );
}

export function Objecoes() {
  return (
    <Secao titulo="titulo-objecoes" fundo="azul">
      <Cabeca id="titulo-objecoes" titulo="O que costuma passar pela cabeça antes de comprar" />
      <div className="grid gap-6 lg:gap-8 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {OBJECOES.map((o, i) => (
          <Card key={o.p} atraso={(i % 3) * 0.08}>
            <h3 className="m-0 text-[1.05rem] leading-snug font-bold">{o.p}</h3>
            <p className="mt-2 mb-0 leading-relaxed text-text-muted">{o.r}</p>
          </Card>
        ))}
      </div>
    </Secao>
  );
}
