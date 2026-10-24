import { AGENTE, ETAPAS, FAIXA, NICHOS, PROBLEMAS } from "@/lib/conteudo";

import { Card, Cabeca, Secao } from "./Secao";
import { TelaFunil } from "./telas/TelaFunil";
import {
  PainelConhecimento,
  PainelPassagem,
  PainelProposta,
  PainelProvedor,
  PainelSkills,
  PainelTeto,
} from "./telas/TelasDoAgente";
import { Janela } from "./ui/Janela";
import { Icone } from "./ui/Icones";
import { Avatar, CanalChip, Exemplo, Selo } from "./ui/Pecas";

/** Faixa de compatibilidades: corre devagar; parada, mostra tudo em duas linhas que quebram. */
export function Faixa() {
  const itens = [...FAIXA, ...FAIXA];
  return (
    <section aria-label="Canais e integrações" className="relative overflow-hidden border-y border-border bg-surface/50">
      <ul
        className="a-corre m-0 flex w-max list-none items-center gap-3 p-0 py-4 motion-reduce:w-auto motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:px-5"
      >
        {itens.map((t, i) => (
          <li
            key={`${t}-${i}`}
            aria-hidden={i >= FAIXA.length ? "true" : undefined}
            className="shrink-0 rounded-full border border-border bg-bg px-4 py-1.5 text-meta font-semibold text-text-muted motion-reduce:[&:nth-child(n+13)]:hidden"
          >
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Três falhas do comercial, cada uma com um pedaço de tela mostrando o sintoma. */
function MiniLeadSumiu() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar nome="Tiago Moreira" tom={5} tamanho="size-8" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-ui font-bold whitespace-nowrap">Tiago Moreira</p>
          <CanalChip canal="whatsapp" />
        </div>
        <Selo tom="crit">há 2 d</Selo>
      </div>
      <p className="m-0 w-fit max-w-[85%] rounded-bubble rounded-bl-md bg-bubble-in px-3.5 py-2 text-message">
        Qual o valor do plano completo?
      </p>
      <p className="m-0 w-fit max-w-[85%] self-end rounded-bubble rounded-br-md bg-bubble-out px-3.5 py-2 text-message">
        Fica em R$ 900 por mês.
      </p>
      <p className="m-0 flex items-center gap-1.5 font-mono text-[0.68rem] text-text-subtle">
        <Icone nome="relogio" className="size-3" /> ninguém retomou
      </p>
    </div>
  );
}

function MiniRobo() {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 w-fit max-w-[88%] rounded-bubble rounded-bl-md bg-bubble-in px-3.5 py-2 text-message">
        Dá para entregar até sexta?
      </p>
      <p className="m-0 w-fit max-w-[88%] self-end rounded-bubble rounded-br-md border border-warning-line/40 bg-bubble-ai px-3.5 py-2 text-message">
        Sim, entrego sexta com 20% de desconto.
      </p>
      <div className="flex items-center gap-2 rounded-field border border-dashed border-border-strong px-3 py-2 text-meta text-text-muted">
        <Icone nome="agente" className="size-3.5 text-link" /> Resposta da IA registrada na conversa
      </div>
    </div>
  );
}

function MiniEspalhado() {
  const lugares = [
    ["Planilha", "arquivo"],
    ["WhatsApp pessoal", "chat"],
    ["Funil em outra ferramenta", "funil"],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      {lugares.map(([nome, icone], i) => (
        <div
          key={nome}
          className={`flex items-center gap-2.5 rounded-field border border-border bg-surface-elevated px-3 py-2.5 text-ui ${
            i === 1 ? "ml-5" : i === 2 ? "ml-10" : ""
          }`}
        >
          <Icone nome={icone} className="size-4 text-text-subtle" />
          {nome}
        </div>
      ))}
      <p className="m-0 mt-1 text-meta text-text-subtle">Cada pedaço do negócio num lugar diferente.</p>
    </div>
  );
}

export function Problema() {
  const minis = [<MiniLeadSumiu key="a" />, <MiniRobo key="b" />, <MiniEspalhado key="c" />];
  return (
    <Secao titulo="titulo-problema" fundo="pontos">
      <Cabeca id="titulo-problema" titulo="Onde a venda pelo WhatsApp costuma se perder." />
      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        {PROBLEMAS.map((p, i) => (
          <Card key={p.titulo} atraso={i * 0.1} className="flex flex-col gap-5">
            <div className="rounded-field border border-border bg-bg p-4">{minis[i]}</div>
            <div>
              <h3 className="m-0 text-[1.15rem] leading-snug font-bold">{p.titulo}</h3>
              <p className="mt-2 mb-0 leading-relaxed text-text-muted">{p.texto}</p>
            </div>
          </Card>
        ))}
      </div>
    </Secao>
  );
}

/** Mini visuais de cada passo do fluxo. */
function VisualEtapa({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="flex flex-col gap-2.5">
        {(
          [
            ["Marina Duarte", 2, "whatsapp", "Oi, vocês atendem aos sábados?"],
            ["Rafael Nogueira", 3, "instagram", "Vi o anúncio, como funciona?"],
          ] as const
        ).map(([n, t, c, m]) => (
          <div key={n} className="flex items-center gap-3 rounded-field border border-border bg-surface-elevated px-3 py-2.5">
            <Avatar nome={n} tom={t} />
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-center gap-2 text-ui font-bold">
                {n} <CanalChip canal={c} />
              </p>
              <p className="m-0 truncate text-meta text-text-muted">{m}</p>
            </div>
            <span className="size-2 rounded-full bg-link" />
          </div>
        ))}
      </div>
    );
  if (i === 1)
    return (
      <div className="flex flex-col gap-2.5">
        <p className="m-0 w-fit max-w-[88%] rounded-bubble rounded-bl-md bg-bubble-in px-3.5 py-2 text-message">
          Quero marcar uma avaliação.
        </p>
        <p className="m-0 w-fit max-w-[88%] self-end rounded-bubble rounded-br-md bg-bubble-ai px-3.5 py-2 text-message">
          Claro! Prefere manhã ou tarde? Qual o seu nome completo?
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Selo tom="ia">
            <Icone nome="agente" className="size-3" /> IA qualificando
          </Selo>
          <Selo tom="ok">
            <Icone nome="check" className="size-3" /> Negócio movido para Avaliação
          </Selo>
        </div>
      </div>
    );
  if (i === 2)
    return (
      <div className="grid grid-cols-3 gap-2">
        {(["Avaliação", "Proposta enviada", "Negociação"] as const).map((e, k) => (
          <div key={e} className="rounded-field border border-border bg-bg p-2">
            <p className="m-0 mb-2 truncate font-mono text-[0.62rem] tracking-wider text-text-subtle uppercase">{e}</p>
            {Array.from({ length: k === 1 ? 1 : 2 }, (_, j) => (
              <div key={j} className="mb-1.5 rounded-md border border-border bg-surface-elevated p-2">
                <div className="mb-1.5 h-1.5 w-3/4 rounded-full bg-border-strong" />
                <div className="h-1.5 w-1/2 rounded-full bg-border" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  if (i === 3) return <PainelPassagem />;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 rounded-field border border-border bg-surface-elevated px-3 py-2.5">
        <Icone nome="relogio" className="size-5 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-ui font-bold">Tiago Moreira</p>
          <p className="m-0 text-meta text-text-muted">sem resposta há 2 h</p>
        </div>
        <Selo tom="aviso">Follow-up às 16h</Selo>
      </div>
      <div className="rounded-field border border-dashed border-border-strong px-3 py-2.5 text-meta text-text-muted">
        A IA prepara a mensagem de retomada e a equipe aprova.
      </div>
    </div>
  );
}

export function ComoFunciona() {
  return (
    <Secao id="como-funciona" titulo="titulo-como" fundo="faixa">
      <Cabeca
        id="titulo-como"
        titulo="A vida de um lead, do primeiro oi ao fechamento."
        texto="Cada passo abaixo existe no produto. As telas mostram dados de exemplo."
      />
      <ol className="relative m-0 flex list-none flex-col gap-8 p-0 lg:gap-12">
        <span
          aria-hidden="true"
          className="absolute top-3 bottom-3 left-[1.15rem] w-px bg-gradient-to-b from-link/60 via-border-strong to-transparent lg:left-1/2"
        />
        {ETAPAS.map((e, i) => (
          <li
            key={e.titulo}
            className="revela relative grid items-center gap-5 pl-14 lg:grid-cols-2 lg:gap-16 lg:pl-0 [&>*]:min-w-0"
          >
            <span className="absolute top-0 left-0 z-10 grid size-9 place-items-center rounded-full border border-border-strong bg-surface-elevated font-mono text-meta font-bold text-link lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2">
              {i + 1}
            </span>
            <div className={i % 2 ? "lg:order-2 lg:pl-4" : "lg:pr-4 lg:text-right"}>
              <h3 className="m-0 text-[1.35rem] leading-snug font-bold">{e.titulo}</h3>
              <p className={`mt-2 mb-0 leading-relaxed text-text-muted ${i % 2 ? "" : "lg:ml-auto"} max-w-[30rem]`}>
                {e.texto}
              </p>
            </div>
            <div className={`card p-4 ${i % 2 ? "lg:order-1" : ""}`}>
              <VisualEtapa i={i} />
            </div>
          </li>
        ))}
      </ol>
    </Secao>
  );
}

/** Bento do agente: cada freio do produto é um painel real com a legenda embaixo. */
export function Agente() {
  const paineis = [
    { i: 0, el: <PainelConhecimento />, cls: "lg:col-span-4" },
    { i: 3, el: <PainelTeto />, cls: "lg:col-span-2" },
    { i: 1, el: <PainelSkills />, cls: "lg:col-span-2" },
    { i: 2, el: <PainelPassagem />, cls: "lg:col-span-2" },
    { i: 4, el: <PainelProposta />, cls: "lg:col-span-2" },
    { i: 5, el: <PainelProvedor />, cls: "lg:col-span-6" },
  ] as const;
  return (
    <Secao id="agente" titulo="titulo-agente" fundo="azul" larga>
      <Cabeca id="titulo-agente" titulo={AGENTE.titulo} texto={AGENTE.texto} />
      <div className="grid gap-5 lg:grid-cols-6 [&>*]:min-w-0">
        {paineis.map((p, k) => {
          const item = AGENTE.itens[p.i];
          return (
            <Card key={p.i} atraso={(k % 3) * 0.08} className={`flex flex-col gap-4 ${p.cls}`}>
              <div className="rounded-field border border-border bg-bg p-4" aria-hidden="true">
                {p.el}
              </div>
              <div>
                <h3 className="m-0 text-[1.05rem] font-bold">{item.rotulo}</h3>
                <p className="mt-1.5 mb-0 text-[0.95rem] leading-relaxed text-text-muted">{item.texto}</p>
              </div>
            </Card>
          );
        })}
      </div>
      <Exemplo className="mt-6" />
    </Secao>
  );
}

/** O funil completo, com abas que trocam o vocabulário por negócio. */
export function Funil() {
  return (
    <Secao id="funil" titulo="titulo-funil" fundo="grade" larga>
      <Cabeca id="titulo-funil" titulo={NICHOS.titulo} texto={NICHOS.texto} />
      <div className="revela">
        <Janela rota="funil" interativa>
          <TelaFunil />
        </Janela>
      </div>
      <Exemplo className="mt-4" />
    </Secao>
  );
}
