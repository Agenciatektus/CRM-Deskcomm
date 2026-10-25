import { CANAIS, NICHOS, RADAR } from "@/lib/conteudo";

import { Card, Cabeca, Secao } from "./Secao";
import { TelaRadar } from "./telas/TelaRadar";
import { CartaoCanal } from "./telas/TelasDeGestao";
import { Icone } from "./ui/Icones";
import { Exemplo, Selo } from "./ui/Pecas";
import { Janela } from "./ui/Janela";

export function Radar() {
  return (
    <Secao titulo="titulo-radar" fundo="menta" largura="tela" ritmo="l">
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
                  <Icone nome="check" peso="bold" className="size-3 text-success-fg" /> {t}
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
            <div key={t} className="flex items-center justify-between gap-2 rounded-menu border border-border bg-surface px-3 py-2 text-sm">
              <span className="truncate font-medium">{t}</span>
              <Selo tom="ok">Aprovado</Selo>
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
          <p className="m-0 w-fit max-w-[90%] rounded-bubble rounded-bl-bubble-tail border border-border bg-bubble-in px-3 py-[7px] text-[15px] leading-[1.42]">Vi o post, como funciona?</p>
          <p className="pele-bolha-ia m-0 w-fit max-w-[90%] self-end rounded-bubble rounded-br-bubble-tail px-3 py-[7px] text-[15px] leading-[1.42]">Oi! Te explico em um minuto.</p>
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
      <div className="grid gap-6 lg:gap-8 md:grid-cols-3 [&>*]:min-w-0">
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

export { Implantacao } from "./Implantacao";
