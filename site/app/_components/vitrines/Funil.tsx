/**
 * Recorte do funil (quadro Kanban) de uma clínica, com o vocabulário do negócio:
 * o lead vira Paciente e o negócio ganho vira Agendado. Etapas e nomes são um
 * EXEMPLO FICTÍCIO: no CRM cada empresa nomeia as próprias etapas.
 */

const COLUNAS: {
  etapa: string;
  cartoes: { nome: string; detalhe: string; destaque?: boolean }[];
}[] = [
  {
    etapa: "Contato novo",
    cartoes: [
      { nome: "Rafael N.", detalhe: "Instagram · há 12 min" },
      { nome: "Beatriz L.", detalhe: "WhatsApp · há 40 min" },
    ],
  },
  {
    etapa: "Conversando",
    cartoes: [
      { nome: "Paulo S.", detalhe: "IA atendendo" },
      { nome: "Helena C.", detalhe: "IA atendendo" },
      { nome: "Tiago M.", detalhe: "Sem resposta há 2 h" },
    ],
  },
  {
    etapa: "Agendado",
    cartoes: [{ nome: "Marina D.", detalhe: "Amanhã, 16h", destaque: true }],
  },
  {
    etapa: "Compareceu",
    cartoes: [{ nome: "Luciana R.", detalhe: "Atendida por Camila" }],
  },
];

export function Funil() {
  return (
    <figure className="m-0">
      <div className="rounded-modal overflow-x-auto border border-border bg-surface p-3">
        <div className="grid min-w-[40rem] grid-cols-4 gap-2.5">
          {COLUNAS.map((c) => (
            <div key={c.etapa} className="rounded-card flex flex-col gap-2 bg-bg/60 p-2">
              <p className="m-0 flex items-center justify-between px-1 font-mono text-[0.7rem] tracking-wider text-text-subtle uppercase">
                <span>{c.etapa}</span>
                <span>{c.cartoes.length}</span>
              </p>
              {c.cartoes.map((k) => (
                <div
                  key={k.nome}
                  className={`rounded-card border px-3 py-2.5 ${
                    k.destaque
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface-elevated"
                  }`}
                >
                  <p className="m-0 text-[0.88rem] font-semibold">{k.nome}</p>
                  <p
                    className={`m-0 mt-0.5 text-[0.78rem] ${
                      k.detalhe.startsWith("Sem resposta") ? "text-warn" : "text-text-subtle"
                    }`}
                  >
                    {k.detalhe}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 text-[0.8rem] text-text-subtle">
        Funil de clínica. Exemplo ilustrativo, com nomes fictícios: cada empresa nomeia as próprias
        etapas.
      </figcaption>
    </figure>
  );
}
