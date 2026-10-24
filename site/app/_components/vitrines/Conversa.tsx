/**
 * Recorte da Inbox do CRM: a conversa de um lead que a IA atende e passa para
 * uma pessoa. Nomes, mensagens e horários são FICTÍCIOS e a figura diz isso.
 * Montada em HTML (e não em imagem) para o texto existir para quem lê e para
 * quem indexa, e para ficar nítida em qualquer tela.
 */

type Quem = "cliente" | "ia" | "pessoa";

const MENSAGENS: { quem: Quem; texto: string; hora: string }[] = [
  {
    quem: "cliente",
    texto: "Oi! Vocês fazem limpeza de pele? Tem horário amanhã?",
    hora: "14:02",
  },
  {
    quem: "ia",
    texto:
      "Oi, Marina! Fazemos sim, e a sessão leva cerca de 1 hora. Amanhã tenho 10h30 ou 16h. Qual fica melhor?",
    hora: "14:02",
  },
  { quem: "cliente", texto: "16h. E dá para parcelar?", hora: "14:03" },
];

const ESTILO: Record<Quem, string> = {
  cliente: "self-start bg-surface-elevated text-text",
  ia: "self-end bg-accent-soft text-text",
  pessoa: "self-end bg-accent-soft text-text",
};

const AUTOR: Record<Quem, string> = {
  cliente: "Marina",
  ia: "Agente de IA",
  pessoa: "Camila",
};

export function Conversa() {
  return (
    <figure className="m-0">
      <div className="rounded-modal overflow-hidden border border-border bg-surface shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-surface-elevated text-[0.8rem] font-bold text-text-muted"
          >
            MD
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[0.95rem] font-semibold">Marina Duarte</p>
            <p className="m-0 truncate font-mono text-[0.75rem] text-text-subtle">
              WhatsApp · clínica de estética
            </p>
          </div>
          <span className="rounded-full border border-border-strong px-2.5 py-1 font-mono text-[0.7rem] tracking-wider text-text-muted uppercase">
            Agendado
          </span>
        </div>

        <div className="flex flex-col gap-2.5 px-4 py-4 text-[0.92rem] leading-snug">
          {MENSAGENS.map((m, i) => (
            <div key={i} className={`rounded-grande max-w-[84%] px-3.5 py-2.5 ${ESTILO[m.quem]}`}>
              <p className="m-0 mb-1 font-mono text-[0.68rem] tracking-wider text-text-subtle uppercase">
                {AUTOR[m.quem]} · {m.hora}
              </p>
              <p className="m-0">{m.texto}</p>
            </div>
          ))}

          <p className="m-0 my-1 border-y border-dashed border-border-strong py-2 text-center font-mono text-[0.72rem] leading-relaxed text-text-muted">
            Pergunta de pagamento · a IA passou o atendimento para Camila · 14:03
          </p>

          <div className={`rounded-grande max-w-[84%] px-3.5 py-2.5 ${ESTILO.pessoa}`}>
            <p className="m-0 mb-1 font-mono text-[0.68rem] tracking-wider text-text-subtle uppercase">
              {AUTOR.pessoa} · 14:05
            </p>
            <p className="m-0">
              Oi, Marina, aqui é a Camila. Já vi o histórico: limpeza de pele amanhã às 16h. Te
              passo as condições de pagamento agora.
            </p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-[0.8rem] text-text-subtle">
        Exemplo ilustrativo, com nomes e mensagens fictícios.
      </figcaption>
    </figure>
  );
}
