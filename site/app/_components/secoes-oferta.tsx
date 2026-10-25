import { CTA, GARANTIA, GARANTIA_CONFIRMADA, OBJECOES, OFERTA, PARA_QUEM, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario, BotaoSecundario } from "./Botao";
import { Card, Cabeca, Secao } from "./Secao";
import { Icone } from "./ui/Icones";

/** Oferta empilhada: o que vem, os dois planos lado a lado, cada um com seu botão, a implantação opcional e a dúvida. */
export function Oferta() {
  return (
    <Secao id="oferta" titulo="titulo-oferta" fundo="grade">
      <Cabeca id="titulo-oferta" titulo={OFERTA.titulo} />
      <ul className="m-0 mb-16 grid list-none gap-5 lg:gap-6 p-0 md:grid-cols-2 [&>*]:min-w-0">
        {OFERTA.itens.map((i, k) => (
          <li key={i.titulo} className="revela flex gap-3" style={{ "--atraso": `${(k % 2) * 0.08}s` } as React.CSSProperties}>
            <Icone nome="check" className="mt-1 size-5 shrink-0 text-ok" />
            <div>
              <h3 className="m-0 text-[1.05rem] font-bold">{i.titulo}</h3>
              <p className="mt-1 mb-0 leading-relaxed text-text-muted">{i.texto}</p>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="revela m-0 mb-5 text-[1.5rem] font-bold tracking-tight">{OFERTA.precoTitulo}</h3>
      <div className="grid gap-6 lg:gap-8 md:grid-cols-2 [&>*]:min-w-0">
        {OFERTA.planos.map((p, i) => (
          <Card
            key={p.nome}
            atraso={i * 0.1}
            className={`flex flex-col gap-4 ${p.destaque ? "border-border-strong" : ""}`}
          >
            <h4 className="m-0 text-[1.1rem] font-bold">{p.nome}</h4>
            <p className="m-0 flex items-baseline gap-2">
              <span className="text-[2.6rem] leading-none font-bold tracking-tight">{p.preco}</span>
              <span className="text-text-muted">{p.periodo}</span>
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {p.detalhes.map((d) => (
                <li key={d} className="flex gap-2 leading-relaxed text-text-muted">
                  <Icone nome="check" className="mt-1 size-4 shrink-0 text-ok" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            {/* TODO(checkout): a URL do checkout ainda não existe. Quando existir, entra aqui no lugar do WhatsApp. */}
            <div className="mt-auto pt-2">
              {p.destaque ? (
                <BotaoPrimario href={linkWhatsapp(p.mensagem)} externo>
                  {p.botao}
                </BotaoPrimario>
              ) : (
                <BotaoSecundario href={linkWhatsapp(p.mensagem)} externo>
                  {p.botao}
                </BotaoSecundario>
              )}
            </div>
          </Card>
        ))}
      </div>
      <div className="revela mt-6 rounded-card border border-dashed border-border-strong px-5 py-4 lg:mt-8">
        <p className="m-0 text-label font-semibold text-text-subtle">
          {OFERTA.implantacao.rotulo}
        </p>
        <p className="m-0 mt-2 flex flex-wrap items-baseline gap-x-3">
          <span className="text-[1.4rem] leading-none font-bold tracking-tight">{OFERTA.implantacao.preco}</span>
          <span className="text-text-muted">{OFERTA.implantacao.parcelas}</span>
        </p>
        <p className="mt-2 mb-0 leading-relaxed text-text-muted">
          {OFERTA.implantacao.aviso} {OFERTA.implantacao.detalhe}
        </p>
      </div>
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
