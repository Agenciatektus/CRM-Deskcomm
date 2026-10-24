import { AGENTE, CTA, IMPLANTACAO, NICHOS, SEGURANCA, linkWhatsapp } from "@/lib/conteudo";

import { BotaoPrimario } from "./Botao";
import { Funil } from "./vitrines/Funil";

export function Agente() {
  return (
    <section
      id="agente"
      aria-labelledby="titulo-agente"
      className="scroll-mt-16 border-t border-border"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-28 [&>*]:min-w-0">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2
            id="titulo-agente"
            className="m-0 max-w-[18ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance"
          >
            {AGENTE.titulo}
          </h2>
          <p className="mt-5 mb-0 max-w-[30rem] leading-relaxed text-text-muted">{AGENTE.texto}</p>
        </div>
        <dl className="m-0 divide-y divide-border border-y border-border">
          {AGENTE.itens.map((i) => (
            <div key={i.rotulo} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <dt className="font-mono text-[0.78rem] tracking-wider text-text-muted uppercase">
                {i.rotulo}
              </dt>
              <dd className="m-0 leading-relaxed text-text">{i.texto}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function Nichos() {
  return (
    <section aria-labelledby="titulo-nichos" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-20 [&>*]:min-w-0">
          <h2
            id="titulo-nichos"
            className="m-0 max-w-[16ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance"
          >
            {NICHOS.titulo}
          </h2>
          <p className="m-0 max-w-[34rem] leading-relaxed text-text-muted">{NICHOS.texto}</p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start [&>*]:min-w-0">
          <Funil />
          <table className="w-full border-collapse text-left text-[0.92rem]">
            <caption className="mb-3 text-left font-mono text-[0.75rem] tracking-wider text-text-muted uppercase">
              O mesmo funil, outro vocabulário
            </caption>
            <thead>
              <tr className="border-b border-border-strong text-text-subtle">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Negócio
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  O lead vira
                </th>
                <th scope="col" className="py-2 font-medium">
                  O ganho vira
                </th>
              </tr>
            </thead>
            <tbody>
              {NICHOS.exemplos.map((e) => (
                <tr key={e.negocio} className="border-b border-border">
                  <th scope="row" className="py-3 pr-3 font-semibold">
                    {e.negocio}
                  </th>
                  <td className="py-3 pr-3 text-text-muted">{e.lead}</td>
                  <td className="py-3 text-text-muted">{e.ganho}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function Implantacao() {
  return (
    <section
      id="implantacao"
      aria-labelledby="titulo-impl"
      className="scroll-mt-16 border-t border-border"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-28 [&>*]:min-w-0">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2
            id="titulo-impl"
            className="m-0 max-w-[16ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance"
          >
            {IMPLANTACAO.titulo}
          </h2>
          <p className="mt-5 mb-0 max-w-[30rem] leading-relaxed text-text-muted">
            {IMPLANTACAO.texto}
          </p>
          <div className="mt-8">
            <BotaoPrimario href={linkWhatsapp(CTA.mensagem)} externo>
              {CTA.rotulo}
            </BotaoPrimario>
          </div>
        </div>
        <ol className="m-0 list-none p-0">
          {IMPLANTACAO.passos.map((p, i) => (
            <li
              key={p.titulo}
              className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-border py-5 first:pt-0 last:border-b-0"
            >
              <span className="font-mono text-[0.8rem] tracking-widest text-text-subtle">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="m-0 text-[1.08rem] font-semibold">{p.titulo}</h3>
                <p className="mt-1.5 mb-0 leading-relaxed text-text-muted">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Seguranca() {
  return (
    <section aria-labelledby="titulo-seg" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <h2
          id="titulo-seg"
          className="m-0 max-w-[26ch] text-[clamp(1.75rem,3vw,2.6rem)] leading-tight font-bold tracking-tight text-balance"
        >
          {SEGURANCA.titulo}
        </h2>
        <dl className="m-0 mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 [&>*]:min-w-0">
          {SEGURANCA.itens.map((i) => (
            <div key={i.rotulo} className="border-t border-border-strong pt-4">
              <dt className="font-mono text-[0.78rem] tracking-wider text-text-muted uppercase">
                {i.rotulo}
              </dt>
              <dd className="m-0 mt-2 max-w-[30rem] leading-relaxed">{i.texto}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
