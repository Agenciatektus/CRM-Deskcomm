import { Icone } from "../ui/Icones";
import { Avatar, CanalChip, Selo } from "../ui/Pecas";

/**
 * O Radar de conversas e a retomada por follow-up, com dados FICTÍCIOS: o que está esfriando, há
 * quanto tempo, e a mensagem de retomada que a IA propõe. Os tempos são do exemplo; no CRM o
 * intervalo é adaptativo e os gatilhos são por etapa do funil.
 */
const LINHAS = [
  { nome: "Tiago Moreira", tom: 5, previa: "Vou falar com minha esposa e te retorno", tempo: "2 h", nivel: "aviso", canal: "whatsapp", acao: "Follow-up às 16h" },
  { nome: "Aline Prado", tom: 1, previa: "Me manda o link de novo, por favor", tempo: "5 h", nivel: "aviso", canal: "whatsapp", acao: "Follow-up amanhã, 9h" },
  { nome: "Padaria Central", tom: 0, previa: "Vamos ver o orçamento e te falo", tempo: "1 d", nivel: "crit", canal: "instagram", acao: "Passa para uma pessoa" },
] as const;

export function TelaRadar() {
  return (
    <div className="bg-bg text-text">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="m-0 flex items-center gap-2 text-[0.95rem] font-bold">
          <span className="relative grid size-5 place-items-center">
            <Icone nome="radar" className="size-4 text-link" />
            <span className="a-varre absolute inset-0 rounded-full border border-transparent border-t-link/70" />
          </span>
          Radar
        </p>
        <Selo tom="aviso">3 esfriando</Selo>
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {LINHAS.map((l, i) => (
          <li key={l.nome} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-border" : ""}`}>
            <Avatar nome={l.nome} tom={l.tom} />
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-center gap-2 text-ui font-bold">
                {l.nome}
                <CanalChip canal={l.canal} />
              </p>
              <p className="m-0 truncate text-meta text-text-muted">{l.previa}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`m-0 text-meta font-bold ${l.nivel === "crit" ? "text-crit" : "text-warn"}`}>
                sem resposta há {l.tempo}
              </p>
              <p className="m-0 flex items-center justify-end gap-1 text-[0.7rem] text-text-subtle">
                <Icone nome="relogio" className="size-3" /> {l.acao}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-border bg-surface/60 p-4">
        <p className="m-0 mb-2.5 flex items-center gap-2 font-mono text-[0.66rem] tracking-wider text-text-subtle uppercase">
          <Icone nome="agente" className="size-3" /> Mensagem de retomada proposta pela IA para Tiago
        </p>
        <div className="max-w-[88%] rounded-[14px] rounded-bl-md bg-[#12303a] px-3.5 py-2.5 text-message leading-snug">
          Oi, Tiago! Conseguiu conversar com sua esposa? Se quiserem, eu seguro o horário de quinta, às 15h, para vocês.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-field bg-(image:--degrade) px-3 py-1.5 text-meta font-semibold text-white">
            Enviar agora
          </span>
          <span className="rounded-field border border-border-strong px-3 py-1.5 text-meta font-semibold text-text-muted">
            Editar
          </span>
          <span className="ml-auto text-[0.7rem] text-text-subtle">Respeita a janela de horário do canal</span>
        </div>
      </div>
    </div>
  );
}
