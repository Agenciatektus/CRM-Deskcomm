import { Icone, type NomeIcone } from "../ui/Icones";
import { Selo } from "../ui/Pecas";

/**
 * Peças da área "Agente de IA" do CRM, com dados FICTÍCIOS: conhecimento, skills, teto de gasto,
 * aprovação de melhorias e a passagem para uma pessoa. Cada uma é um bloco independente para
 * entrar num card da LP.
 */

function Cabecalho({ icone, titulo, direita }: { icone: NomeIcone; titulo: string; direita?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="m-0 flex items-center gap-2 text-ui font-bold">
        <Icone nome={icone} className="size-4 text-link" /> {titulo}
      </p>
      {direita}
    </div>
  );
}

export function PainelConhecimento() {
  const arquivos = [
    ["Tabela de procedimentos.pdf", "indexado", "ok"],
    ["Perguntas frequentes.md", "indexado", "ok"],
    ["Política de remarcação.docx", "indexado", "ok"],
    ["Promoções de novembro.pdf", "indexando", "aviso"],
  ] as const;
  return (
    <div>
      <Cabecalho icone="arquivo" titulo="Conhecimento da empresa" direita={<Selo>por organização</Selo>} />
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {arquivos.map(([nome, estado, tom]) => (
          <li key={nome} className="flex items-center gap-2.5 rounded-field border border-border bg-surface-elevated px-3 py-2">
            <Icone nome="arquivo" className="size-4 shrink-0 text-text-subtle" />
            <span className="min-w-0 flex-1 truncate text-meta font-semibold">{nome}</span>
            <Selo tom={tom}>{estado}</Selo>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-meta text-text-subtle">O agente responde com o que a empresa cadastrou.</p>
    </div>
  );
}

export function PainelSkills() {
  const skills = [
    ["Mover o negócio de etapa", true],
    ["Criar agendamento", true],
    ["Registrar nota na ficha", true],
    ["Passar para uma pessoa", true],
    ["Enviar proposta", false],
  ] as const;
  return (
    <div>
      <Cabecalho icone="raio" titulo="Skills do agente" />
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {skills.map(([nome, ligada]) => (
          <li key={nome} className="flex items-center justify-between gap-3 rounded-field px-2 py-1.5">
            <span className={`text-ui ${ligada ? "text-text" : "text-text-subtle"}`}>{nome}</span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full ${ligada ? "bg-(image:--degrade)" : "bg-border-strong"}`}
            >
              <i
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${ligada ? "left-[1.1rem]" : "left-0.5"}`}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PainelProposta() {
  return (
    <div>
      <Cabecalho icone="agente" titulo="Proposta da IA" direita={<Selo tom="aviso">aguarda aprovação</Selo>} />
      <p className="m-0 text-ui leading-snug">
        Três clientes perguntaram sobre <b>parcelamento</b> e o agente passou para uma pessoa. Sugestão: acrescentar a
        política de pagamento ao conhecimento.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-field border border-dashed border-border-strong px-3 py-2 font-mono text-[0.7rem] text-text-muted">
        <span className="text-text-subtle">versão 12</span>
        <Icone nome="seta" className="size-3" />
        <span className="font-bold text-text">versão 13</span>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="rounded-field bg-(image:--degrade) px-3 py-1.5 text-meta font-semibold text-white">Aprovar</span>
        <span className="rounded-field border border-border-strong px-3 py-1.5 text-meta font-semibold text-text-muted">
          Revisar
        </span>
      </div>
      <p className="m-0 mt-2.5 text-[0.7rem] text-text-subtle">Nada muda sem uma pessoa aprovar.</p>
    </div>
  );
}

export function PainelPassagem() {
  const eventos = [
    ["14:03", "A IA identificou pergunta de pagamento", "agente"],
    ["14:03", "Atendimento passado para Camila", "usuario"],
    ["14:05", "Camila assumiu e respondeu", "check"],
  ] as const;
  return (
    <div>
      <Cabecalho icone="usuario" titulo="Passagem para uma pessoa" />
      <ol className="m-0 flex list-none flex-col p-0">
        {eventos.map(([hora, texto, icone], i) => (
          <li key={texto} className="relative flex gap-3 pb-3 last:pb-0">
            {i < eventos.length - 1 ? (
              <span aria-hidden="true" className="absolute top-6 bottom-0 left-[0.8rem] w-px bg-border-strong" />
            ) : null}
            <span className="z-10 grid size-[1.65rem] shrink-0 place-items-center rounded-full border border-border-strong bg-surface-elevated text-link">
              <Icone nome={icone} className="size-3.5" />
            </span>
            <div>
              <p className="m-0 text-ui leading-tight">{texto}</p>
              <p className="m-0 font-mono text-[0.65rem] text-text-subtle">{hora}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-2 text-[0.7rem] text-text-subtle">Quem assumiu e quando fica registrado.</p>
    </div>
  );
}
