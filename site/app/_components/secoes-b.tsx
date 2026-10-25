import { CANAIS, IMPLANTACAO, NICHOS, RADAR } from "@/lib/conteudo";

import { Card, Cabeca, Secao } from "./Secao";
import { TelaRadar } from "./telas/TelaRadar";
import { CartaoCanal } from "./telas/TelasDeGestao";
import { Icone } from "./ui/Icones";
import { Exemplo, Selo } from "./ui/Pecas";
import { Janela } from "./ui/Janela";

export function Radar() {
  return (
    <Secao titulo="titulo-radar" fundo="menta" larga>
      <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 [&>*]:min-w-0">
        <div className="revela">
          <h2
            id="titulo-radar"
            className="m-0 text-[clamp(1.85rem,3.4vw,2.9rem)] leading-[1.1] font-bold tracking-tight text-balance"
          >
            {RADAR.titulo}
          </h2>
          <p className="mt-4 mb-0 text-[1.05rem] leading-relaxed text-text-muted">{RADAR.texto}</p>
          <ul className="mt-6 mb-0 flex list-none flex-wrap gap-2 p-0">
            {["Tempo adaptativo", "Gatilhos por etapa", "Janela de horário do canal"].map((t) => (
              <li key={t}>
                <Selo tom="neutro">
                  <Icone nome="check" className="size-3 text-ok" /> {t}
                </Selo>
              </li>
            ))}
          </ul>
        </div>
        <div className="revela [--atraso:0.12s]">
          <Janela rota="radar">
            <TelaRadar />
          </Janela>
          <Exemplo className="mt-3" />
        </div>
      </div>
    </Secao>
  );
}

export function Canais() {
  const cartoes = [
    {
      titulo: "WhatsApp por QR code",
      detalhe: "Conecta em minutos",
      icone: "chat",
      qr: true,
      itens: [
        ["Ritmo de envio", "controlado"],
        ["Janela de horário", "respeitada"],
        ["Proteção contra bloqueio", "ativa"],
      ],
    },
    {
      titulo: "WhatsApp oficial da Meta",
      detalhe: "Canal oficial",
      icone: "chat",
      qr: false,
      visual: (
        <div className="flex flex-col gap-1.5">
          {["Confirmação de consulta", "Lembrete de retorno"].map((t) => (
            <div key={t} className="flex items-center justify-between gap-2 rounded-field border border-border bg-surface-elevated px-3 py-2 text-meta">
              <span className="truncate font-semibold">{t}</span>
              <Selo tom="ok">aprovado</Selo>
            </div>
          ))}
        </div>
      ),
      itens: [
        ["Modelos de mensagem", "aprovados e sincronizados"],
        ["Número", "canal oficial"],
      ],
    },
    {
      titulo: "Instagram",
      detalhe: "Direct e comentários",
      icone: "camera",
      qr: false,
      visual: (
        <div className="flex flex-col gap-1.5">
          <p className="m-0 w-fit max-w-[90%] rounded-bubble rounded-bl-md bg-bubble-in px-3 py-2 text-meta">Vi o post, como funciona?</p>
          <p className="m-0 w-fit max-w-[90%] self-end rounded-bubble rounded-br-md bg-bubble-ai px-3 py-2 text-meta">Oi! Te explico em um minuto.</p>
        </div>
      ),
      itens: [
        ["Conversas", "na mesma Inbox"],
        ["Atendimento", "IA e equipe"],
      ],
    },
  ] as const;
  return (
    <Secao id="canais" titulo="titulo-canais" fundo="pontos">
      <Cabeca id="titulo-canais" titulo={CANAIS.titulo} texto={CANAIS.texto} />
      <div className="grid gap-5 md:grid-cols-3 [&>*]:min-w-0">
        {cartoes.map((c, i) => (
          <Card key={c.titulo} atraso={i * 0.1}>
            <CartaoCanal titulo={c.titulo} detalhe={c.detalhe} icone={c.icone} itens={c.itens} qr={c.qr} visual={"visual" in c ? c.visual : undefined} />
          </Card>
        ))}
      </div>
      <div className="revela mt-14 max-w-[44rem]">
        <h3 className="m-0 text-[1.5rem] leading-tight font-bold tracking-tight">{NICHOS.titulo}</h3>
        <p className="mt-3 mb-0 leading-relaxed text-text-muted">{NICHOS.texto}</p>
        <ul className="mt-5 mb-0 flex list-none flex-wrap gap-2 p-0">
          {NICHOS.exemplos.map((e) => (
            <li key={e.negocio}>
              <Selo tom="neutro">
                {e.negocio}: {e.lead}, {e.ganho}
              </Selo>
            </li>
          ))}
        </ul>
      </div>
    </Secao>
  );
}

export function Implantacao() {
  return (
    <Secao id="implantacao" titulo="titulo-implantacao" fundo="azul">
      <Cabeca id="titulo-implantacao" titulo={IMPLANTACAO.titulo} texto={IMPLANTACAO.texto} />
      <ol className="relative m-0 grid list-none gap-5 p-0 md:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0">
        <span
          aria-hidden="true"
          className="absolute top-[1.65rem] right-10 left-10 hidden h-px bg-gradient-to-r from-link/50 via-border-strong to-ok/50 lg:block"
        />
        {IMPLANTACAO.passos.map((p, i) => (
          <li key={p.titulo} className="revela relative" style={{ "--atraso": `${i * 0.08}s` } as React.CSSProperties}>
            <div className="card h-full p-5">
              <span className="relative z-10 mb-4 grid size-9 place-items-center rounded-full border border-border-strong bg-surface-elevated font-mono text-meta font-bold text-link">
                {i + 1}
              </span>
              <h3 className="m-0 text-[1.02rem] leading-snug font-bold">{p.titulo}</h3>
              <p className="mt-1.5 mb-0 text-[0.92rem] leading-relaxed text-text-muted">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </Secao>
  );
}
