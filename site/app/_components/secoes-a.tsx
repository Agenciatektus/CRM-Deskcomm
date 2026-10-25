import {
  AGENTE,
  CONTA,
  ESTATISTICA_RD,
  ETAPAS,
  MECANISMO,
  PROBLEMAS,
  PROBLEMAS_FECHO,
  PROBLEMAS_INTRO,
  PROBLEMAS_TITULO,
  PROVA,
} from "@/lib/conteudo";

import { Calculadora } from "./Calculadora";
export { Faixa } from "./Faixa";
import { Card, Cabeca, Secao } from "./Secao";
import { TelaFunil } from "./telas/TelaFunil";
import { PainelConhecimento, PainelPassagem, PainelProposta } from "./telas/TelasDoAgente";
import { Janela } from "./ui/Janela";
import { Icone, type NomeIcone } from "./ui/Icones";
import { Avatar, CanalChip, Exemplo, Selo } from "./ui/Pecas";

/** Seis cenas do vácuo, cada uma com um pedaço de tela mostrando o sintoma. */
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
      <p className="m-0 w-fit max-w-[85%] rounded-bubble rounded-bl-bubble-tail border border-border bg-bubble-in px-3 py-[7px] text-[15px] leading-[1.42]">
        Qual o valor do plano completo?
      </p>
      <p className="m-0 w-fit max-w-[85%] self-end rounded-bubble rounded-br-bubble-tail bg-bubble-out px-3 py-[7px] text-[15px] leading-[1.42]">
        O pacote com 10 sessões fica em R$ 900.
      </p>
      <p className="m-0 flex items-center gap-1.5 text-xs text-text-subtle">
        <Icone nome="relogio" className="size-3" /> ninguém retomou
      </p>
    </div>
  );
}

function Fila({ icone, children }: { icone: NomeIcone; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-menu border border-border bg-surface px-3 py-2.5 text-ui">
      <Icone nome={icone} className="size-4 shrink-0 text-text-subtle" />
      {children}
    </div>
  );
}

function MiniFimDeSemana() {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs text-text-subtle">Sábado, 22h</p>
      {["Quanto custa?", "Tem horário amanhã?", "Vi o anúncio, como funciona?"].map((m) => (
        <Fila key={m} icone="chat">
          <span className="truncate">{m}</span>
          <span className="ml-auto size-2 shrink-0 rounded-full bg-link" />
        </Fila>
      ))}
      <p className="m-0 flex items-center gap-1.5 text-xs text-text-subtle">
        <Icone nome="relogio" className="size-3" /> próxima resposta: segunda, 9h
      </p>
    </div>
  );
}

function MiniAfundou() {
  return (
    <div className="flex flex-col gap-1.5">
      <Fila icone="chat">
        <span className="truncate text-text-muted">Vou ver com meu marido e te falo</span>
        <Selo tom="aviso">há 6 d</Selo>
      </Fila>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-2 rounded-field border border-border px-3 py-2">
          <div className="h-1.5 w-1/2 rounded-full bg-border-strong" />
          <div className="ml-auto h-1.5 w-8 rounded-full bg-border" />
        </div>
      ))}
      <p className="m-0 text-meta text-text-subtle">e mais 80 conversas por cima</p>
    </div>
  );
}

function MiniCarteira() {
  return (
    <div className="flex flex-col gap-2">
      <Fila icone="usuario">
        <span>Celular pessoal do vendedor</span>
        <Selo tom="crit">saiu</Selo>
      </Fila>
      <Fila icone="funil">
        <span className="text-text-muted">Negociações em andamento</span>
        <span className="ml-auto font-bold">?</span>
      </Fila>
      <p className="m-0 text-meta text-text-subtle">Quem, quanto e a que preço: ninguém sabe.</p>
    </div>
  );
}

function MiniSemMedida() {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-field border border-border bg-surface-elevated px-2 py-3">
          <p className="m-0 text-[1.5rem] leading-none font-bold">400</p>
          <p className="m-0 mt-1 text-meta text-text-subtle">conversas</p>
        </div>
        <div className="rounded-field border border-dashed border-border-strong px-2 py-3">
          <p className="m-0 text-[1.5rem] leading-none font-bold text-text-subtle">?</p>
          <p className="m-0 mt-1 text-meta text-text-subtle">vendas</p>
        </div>
      </div>
      <p className="m-0 text-meta text-text-subtle">O custo por conversa aparece. O custo por venda fica em branco.</p>
    </div>
  );
}

function MiniSemDono() {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 w-fit max-w-[88%] rounded-bubble rounded-bl-bubble-tail border border-border bg-bubble-in px-3 py-[7px] text-[15px] leading-[1.42]">
        Ninguém me respondeu.
      </p>
      <Fila icone="usuario">
        <span className="text-text-muted">Responsável</span>
        <span className="ml-auto font-bold">?</span>
      </Fila>
      <Fila icone="relogio">
        <span className="text-text-muted">Quando pegou</span>
        <span className="ml-auto font-bold">?</span>
      </Fila>
    </div>
  );
}

export function Problema() {
  const minis = [
    <MiniLeadSumiu key="a" />,
    <MiniFimDeSemana key="b" />,
    <MiniAfundou key="c" />,
    <MiniCarteira key="d" />,
    <MiniSemMedida key="e" />,
    <MiniSemDono key="f" />,
  ];
  return (
    <Secao titulo="titulo-problema" fundo="pontos">
      <Cabeca id="titulo-problema" titulo={PROBLEMAS_TITULO} texto={PROBLEMAS_INTRO} />
      <div className="grid gap-6 lg:gap-8 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {PROBLEMAS.map((p, i) => (
          <Card key={p.titulo} atraso={(i % 3) * 0.1} className="flex flex-col gap-6">
            <div className="rounded-field border border-border bg-bg p-4" aria-hidden="true">
              {minis[i]}
            </div>
            <div>
              <h3 className="m-0 text-[1.15rem] leading-snug font-bold">{p.titulo}</h3>
              <p className="mt-2 mb-0 leading-relaxed text-text-muted">{p.texto}</p>
              <p className="mt-3 mb-0 flex gap-2 leading-relaxed">
                <Icone nome="check" className="mt-1 size-4 shrink-0 text-success-fg" />
                <span>{p.saida}</span>
              </p>
            </div>
          </Card>
        ))}
      </div>
      <div className="revela mt-10 max-w-[44rem]">
        <p className="m-0 text-[1.05rem] leading-relaxed">{PROBLEMAS_FECHO}</p>
        <p className="mt-3 mb-0 leading-relaxed text-text-muted">{ESTATISTICA_RD}</p>
      </div>
    </Secao>
  );
}

export function Conta() {
  return (
    <Secao id="conta" titulo="titulo-conta" fundo="azul" largura="grade" ritmo="l">
      <Cabeca id="titulo-conta" titulo={CONTA.titulo} texto={CONTA.intro} />
      <div className="revela">
        <Calculadora />
        <p className="mt-6 mb-0 max-w-(--container-leitura) text-[1.05rem] leading-relaxed">{CONTA.ponte}</p>
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
          <div key={n} className="flex items-center gap-3 rounded-menu border border-border bg-surface px-3 py-2.5">
            <Avatar nome={n} tom={t} />
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-center gap-2 text-ui font-bold">
                {n} <CanalChip canal={c} />
              </p>
              <p className="m-0 truncate text-meta text-text-muted">{m}</p>
            </div>
            <span className="pele-grad-contador inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold">1</span>
          </div>
        ))}
      </div>
    );
  if (i === 1)
    return (
      <div className="flex flex-col gap-2.5">
        <p className="m-0 w-fit max-w-[88%] rounded-bubble rounded-bl-bubble-tail border border-border bg-bubble-in px-3 py-[7px] text-[15px] leading-[1.42]">
          Quero marcar uma avaliação.
        </p>
        <p className="m-0 w-fit max-w-[88%] self-end pele-bolha-ia rounded-bubble rounded-br-bubble-tail px-3 py-[7px] text-[15px] leading-[1.42]">
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
          <div key={e} className="rounded-lg border border-border bg-surface/50 p-2">
            <p className="m-0 mb-2 truncate text-meta font-semibold text-text-muted">{e}</p>
            {Array.from({ length: k === 1 ? 1 : 2 }, (_, j) => (
              <div key={j} className="mb-1.5 rounded-xl border border-border bg-surface p-2">
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
      <div className="flex items-center gap-3 rounded-menu border border-border bg-surface px-3 py-2.5">
        <Icone nome="relogio" className="size-5 text-warning-fg" />
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

/** O mecanismo (Plantão do Verdash): as três peças e a vida de uma conversa em cinco passos. */
export function Plantao() {
  return (
    <Secao id="plantao" titulo="titulo-plantao" fundo="faixa">
      <Cabeca id="titulo-plantao" titulo={MECANISMO.titulo} texto={MECANISMO.texto} />
      <div className="mb-20 grid gap-6 lg:gap-8 md:grid-cols-3 [&>*]:min-w-0">
        {MECANISMO.pecas.map((p, i) => (
          <Card key={p.titulo} atraso={i * 0.1}>
            <h3 className="m-0 text-[1.15rem] font-bold">{p.titulo}</h3>
            <p className="mt-2 mb-0 leading-relaxed text-text-muted">{p.texto}</p>
          </Card>
        ))}
        <p className="revela m-0 text-[1.25rem] font-bold md:col-span-3">{MECANISMO.fecho}</p>
      </div>
      <ol className="relative m-0 flex list-none flex-col gap-12 p-0 lg:gap-20">
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

function MiniAudio() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex w-fit items-center gap-2 rounded-bubble rounded-bl-bubble-tail border border-border bg-bubble-in px-3 py-[7px] text-[15px] leading-[1.42]">
        <Icone nome="enviar" className="size-3.5" />
        <span className="h-1.5 w-24 rounded-full bg-border-strong" />
        <span className="font-mono text-[0.65rem] text-text-subtle">0:14</span>
      </div>
      <p className="m-0 rounded-field border border-dashed border-border-strong px-3 py-2 text-meta text-text-muted">
        Transcrição: &quot;Queria saber se vocês atendem de manhã.&quot;
      </p>
      <p className="m-0 w-fit max-w-[88%] self-end pele-bolha-ia rounded-bubble rounded-br-bubble-tail px-3 py-[7px] text-[15px] leading-[1.42]">
        Atendemos, sim. Prefere às 9h ou às 10h?
      </p>
    </div>
  );
}

function MiniAgenda() {
  return (
    <div className="flex flex-col gap-2">
      {(
        [
          ["Qui 9h", "ocupado"],
          ["Qui 10h", "livre"],
          ["Qui 14h", "livre"],
        ] as const
      ).map(([h, e]) => (
        <div
          key={h}
          className="flex items-center justify-between rounded-field border border-border bg-surface-elevated px-3 py-2 text-ui"
        >
          {h}
          <Selo tom={e === "livre" ? "ok" : "neutro"}>{e}</Selo>
        </div>
      ))}
      <p className="m-0 flex items-center gap-1.5 text-meta text-text-muted">
        <Icone nome="check" className="size-3.5 text-success-fg" /> Agendamento criado para quinta, 10h
      </p>
    </div>
  );
}

function MiniForaDoHorario() {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 w-fit max-w-[88%] rounded-bubble rounded-bl-bubble-tail border border-border bg-bubble-in px-3 py-[7px] text-[15px] leading-[1.42]">
        Oi, ainda tem vaga?
      </p>
      <p className="m-0 w-fit max-w-[88%] self-end pele-bolha-ia rounded-bubble rounded-br-bubble-tail px-3 py-[7px] text-[15px] leading-[1.42]">
        Nossa equipe volta às 8h. Já deixei o seu pedido anotado.
      </p>
      <div>
        <Selo tom="ia">
          <Icone nome="relogio" className="size-3" /> aviso fora do horário
        </Selo>
      </div>
    </div>
  );
}

/** Seis cenas de atendimento: cada uma é um painel do produto com a legenda embaixo. */
export function Agente() {
  const paineis = [
    <PainelConhecimento key="0" />,
    <MiniAudio key="1" />,
    <MiniAgenda key="2" />,
    <PainelPassagem key="3" />,
    <MiniForaDoHorario key="4" />,
    <PainelProposta key="5" />,
  ];
  return (
    <Secao id="agente" titulo="titulo-agente" fundo="azul">
      <Cabeca id="titulo-agente" titulo={AGENTE.titulo} texto={AGENTE.texto} />
      <div className="grid items-start gap-6 lg:gap-8 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {AGENTE.itens.map((item, k) => (
          <Card key={item.rotulo} atraso={(k % 3) * 0.08} className="flex flex-col gap-5">
            <div className="rounded-field border border-border bg-bg p-4" aria-hidden="true">
              {paineis[k]}
            </div>
            <div>
              <h3 className="m-0 text-[1.05rem] font-bold">{item.rotulo}</h3>
              <p className="mt-1.5 mb-0 text-[0.95rem] leading-relaxed text-text-muted">{item.texto}</p>
            </div>
          </Card>
        ))}
      </div>
      <Exemplo className="mt-6" />
    </Secao>
  );
}

/** Prova do produto: o funil completo, com abas que trocam o vocabulário por negócio. */
export function Funil() {
  return (
    <Secao id="funil" titulo="titulo-funil" fundo="grade" largura="tela" ritmo="l">
      <Cabeca id="titulo-funil" titulo={PROVA.titulo} texto={PROVA.intro} />
      <div className="revela">
        <Janela rota="funil" interativa>
          <TelaFunil />
        </Janela>
        <p className="m-0 mt-3 text-meta text-text-subtle">{PROVA.exemploFunil}</p>
      </div>
      <div className="revela mt-5 max-w-[44rem]">
        <h3 className="m-0 text-[1.15rem] font-bold">{PROVA.funil.titulo}</h3>
        <p className="mt-1.5 mb-0 leading-relaxed text-text-muted">{PROVA.funil.texto}</p>
      </div>
    </Secao>
  );
}
