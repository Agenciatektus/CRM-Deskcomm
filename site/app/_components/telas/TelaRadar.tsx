import { Icone } from "../ui/Icones";
import { BotaoApp, Selo } from "../ui/Pecas";

/**
 * O Radar de risco do CRM (RiskRadarList), com dados FICTÍCIOS: contadores por risco, aviso de
 * demandas sem próximo passo e a lista com selo de risco, "parado há", dono e o botão Assumir.
 * Abaixo, a mensagem de retomada que a IA propõe. Os tempos são do exemplo; no CRM o intervalo é
 * adaptativo e os gatilhos são por etapa do funil.
 */
const LINHAS = [
  {
    titulo: "Orçamento, Padaria Central",
    contato: "Carlos Almeida",
    parado: "parado há 1d",
    dono: "Sem dono",
    risco: ["Crítico", "crit"],
    aviso: ["Sem próximo passo agendado", "warn"],
  },
  {
    titulo: "Limpeza de pele, Tiago Moreira",
    contato: "Tiago Moreira",
    parado: "parado há 2h",
    dono: "Agente: Assistente",
    risco: ["Em risco", "aviso"],
    aviso: ["Assistente retorna às 16h", "info"],
  },
  {
    titulo: "Peeling, Aline Prado",
    contato: "Aline Prado",
    parado: "parado há 5h",
    dono: "Agente: Assistente",
    risco: ["Em risco", "aviso"],
    aviso: ["Assistente retorna amanhã, 9h", "info"],
  },
] as const;

export function TelaRadar() {
  return (
    <div className="bg-bg text-text">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <h3 className="m-0 flex items-center gap-2 text-xl font-bold tracking-[-0.01em]">
          <span className="relative grid size-5 place-items-center text-accent-text">
            <Icone nome="radar" className="size-[18px]" />
            <span className="a-varre absolute inset-0 rounded-full border border-transparent border-t-link/70" />
          </span>
          Radar de risco
        </h3>
        <div className="ml-auto flex flex-wrap gap-2">
          <Selo tom="crit">1 crítico</Selo>
          <Selo tom="aviso">2 em risco</Selo>
          <Selo tom="info">4 em voo</Selo>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-lg border border-warning-line bg-warning-bg/40 p-3">
          <p className="m-0 text-sm font-medium">2 demandas abertas sem próximo passo</p>
          <p className="m-0 mb-2 text-xs text-text-muted">
            Sem tarefa marcada, a demanda some do radar da equipe. Marque o próximo passo.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {[
              ["Carlos Almeida", "aberta há 26h"],
              ["Renata Souza", "aberta há 8h"],
            ].map(([n, t]) => (
              <li key={n} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate">{n}</span>
                <span className="shrink-0 tabular-nums text-text-muted">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
          {LINHAS.map((l) => (
            <li key={l.titulo} className="flex items-start gap-2 pr-3">
              <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0">
                  <Selo tom={l.risco[1]}>{l.risco[0]}</Selo>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium">{l.titulo}</p>
                  <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                    <span className="truncate">{l.contato}</span>
                    <span className="inline-flex items-center gap-1">
                      <Icone nome="relogioc" className="size-[13px]" />
                      {l.parado}
                    </span>
                    <span>{l.dono}</span>
                  </p>
                  <p
                    className={`m-0 mt-1 inline-flex items-center gap-1 text-xs ${
                      l.aviso[1] === "warn" ? "text-warning-fg" : "text-info-fg"
                    }`}
                  >
                    <Icone nome={l.aviso[1] === "warn" ? "alerta" : "relogio"} className="size-3.5" />
                    {l.aviso[0]}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-center">
                <BotaoApp variante="contorno">Assumir</BotaoApp>
                <Icone nome="seta" className="size-4 text-text-muted" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border bg-surface p-4">
        <p className="m-0 mb-2.5 flex items-center gap-2 text-meta font-bold text-text-muted">
          <Icone nome="faiscas" className="size-3.5 text-accent-text" /> Mensagem de retomada proposta pela IA para Tiago
        </p>
        <div className="pele-bolha-ia max-w-[88%] rounded-bubble rounded-bl-bubble-tail px-3 py-[7px] text-[15px] leading-[1.42]">
          Oi, Tiago! Conseguiu conversar com sua esposa? Se quiserem, eu seguro o horário de quinta, às 15h, para vocês.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BotaoApp>Enviar agora</BotaoApp>
          <BotaoApp variante="contorno">Editar</BotaoApp>
          <span className="ml-auto text-xs text-text-subtle">Respeita a janela de horário do canal</span>
        </div>
      </div>
    </div>
  );
}
