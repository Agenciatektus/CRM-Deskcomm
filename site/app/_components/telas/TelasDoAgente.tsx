import { Icone } from "../ui/Icones";
import { BotaoApp, Selo } from "../ui/Pecas";

/**
 * Peças da área "Agente de IA" do CRM, com dados FICTÍCIOS, na forma das telas reais:
 * Conhecimento (KnowledgeSourceCard), Skills instaladas, Propostas (ProposalsList) e o cartão de
 * passagem da conversa (PassagemCard). Cada uma é um bloco independente para entrar num card da LP.
 */

/** O `Card` do app: `rounded-menu` (14), borda, superfície, sombra curta. */
function Cartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-menu border border-border bg-surface text-ui shadow-xs ${className}`}>{children}</div>
  );
}

export function PainelConhecimento() {
  const materiais = [
    ["Tabela de procedimentos", "PDF", "O agente já sabe", "ok", "há 2 dias", "42", "Assistente"],
    ["Perguntas frequentes", "Perguntas e respostas", "O agente já sabe", "ok", "há 5 dias", "18", "Assistente"],
    ["Promoções de novembro", "PDF", "Preparando…", "info", "agora", "0", "Assistente"],
  ] as const;
  return (
    <div className="flex flex-col gap-2.5">
      {materiais.map(([nome, tipo, estado, tom, quando, trechos, uso]) => (
        <Cartao key={nome} className="flex flex-col">
          <div className="flex flex-col gap-1 px-4 pt-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Icone nome="arquivo" className="size-5 shrink-0 text-accent-text" />
                <p className="m-0 text-base leading-snug font-semibold [overflow-wrap:anywhere]">{nome}</p>
              </div>
              <Selo tom={tom}>{estado}</Selo>
            </div>
            <p className="m-0 text-sm text-text-muted">{tipo}</p>
          </div>
          <dl className="m-0 flex flex-col gap-2 px-4 pt-2.5 pb-3.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-text-muted">Preparado</dt>
              <dd className="m-0">{quando}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-text-muted">Trechos que o agente encontra</dt>
              <dd className="m-0 tabular-nums">{trechos}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-muted">Consultado por</dt>
              <dd className="m-0 text-right">{uso}</dd>
            </div>
          </dl>
        </Cartao>
      ))}
    </div>
  );
}

export function PainelSkills() {
  const skills = [
    ["Mover o negócio de etapa", "do catálogo", "12/10/2026", "Move o lead de etapa quando o cliente confirma o que combinou."],
    ["Criar agendamento", "do catálogo", "12/10/2026", "Marca o horário na agenda e avisa o cliente."],
    ["Passar para uma pessoa", "do catálogo", "09/10/2026", "Entrega a conversa com o resumo do que já foi tentado."],
    ["Regras de desconto", "manual", "02/10/2026", "Só fala em desconto dentro da política da empresa."],
  ] as const;
  return (
    <Cartao className="p-4">
      <p className="m-0 mb-3 text-base font-semibold">Skills instaladas</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {skills.map(([nome, origem, data, descricao]) => (
          <li key={nome} className="flex flex-col gap-1.5 rounded-md border border-border/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Icone nome="quebracabeca" className="size-4 text-accent-text" />
              <span className="font-medium">{nome}</span>
              <span className="inline-flex h-[22px] items-center rounded-pill border border-transparent bg-info-bg px-2 text-[10px] font-semibold text-info-fg data-[manual=true]:border-border data-[manual=true]:bg-surface-elevated data-[manual=true]:text-text-muted" data-manual={origem === "manual"}>
                {origem}
              </span>
              <span className="ml-auto text-xs text-text-muted">atualizada em {data}</span>
            </div>
            <p className="m-0 text-text-muted">{descricao}</p>
            <div className="flex justify-end gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong px-3 text-[13px] font-semibold">
                <Icone nome="lapis" className="size-4" /> Editar
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong px-3 text-[13px] font-semibold">
                <Icone nome="lixo" className="size-4" /> Desinstalar
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export function PainelProposta() {
  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-field border border-border p-[3px] text-[13px] font-semibold pele-seg">
        <span className="pele-seg-item-on flex h-7 flex-1 items-center justify-center rounded-[7px]">Aguardando decisão (1)</span>
        <span className="flex h-7 flex-1 items-center justify-center text-text-muted">Já decididas</span>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
        <li className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium">Limpeza de pele, Marina Duarte</span>
            <Selo>Assistente</Selo>
            <span className="text-xs text-text-muted">proposta há 4 min</span>
          </div>
          <p className="m-0 text-sm">
            Três clientes perguntaram sobre parcelamento e o agente passou para uma pessoa. Acrescentar a política de
            pagamento ao conhecimento.
          </p>
          <div className="flex gap-2">
            <BotaoApp>Aprovar</BotaoApp>
            <BotaoApp variante="contorno">Ignorar</BotaoApp>
          </div>
        </li>
      </ul>
      <p className="m-0 mt-2.5 text-xs text-text-subtle">Nada muda sem uma pessoa aprovar.</p>
    </div>
  );
}

export function PainelPassagem() {
  return (
    <article className="overflow-hidden rounded-menu border border-warning-line bg-surface text-ui">
      <div className="flex items-center gap-2 bg-accent-soft px-3.5 py-2.5 text-accent-text">
        <h3 className="m-0 flex items-center gap-2 text-label font-bold">
          <Icone nome="agente" peso="bold" className="size-[15px]" />
          Passagem para uma pessoa
        </h3>
        <span className="ml-auto shrink-0 text-label font-medium text-text-subtle">14:03</span>
      </div>
      <div className="px-3.5 pt-1 pb-3">
        <p className="m-0 mt-1.5 font-medium">Pergunta sobre forma de pagamento: fora do que a IA pode decidir.</p>
        {(
          [
            ["O cliente quer", <p key="q" className="m-0">Parcelar a limpeza de pele de amanhã, 16h.</p>],
            [
              "A IA já tentou",
              <ol key="t" className="m-0 list-decimal space-y-0.5 pl-4">
                <li>Confirmou o horário de amanhã.</li>
                <li>Explicou o valor da sessão.</li>
              </ol>,
            ],
            [
              "Últimas palavras do cliente",
              <blockquote key="b" className="m-0 border-l-2 border-border pl-2 italic">
                16h. E dá para parcelar?
              </blockquote>,
            ],
          ] as const
        ).map(([rotulo, corpo]) => (
          <div key={rotulo} className="mt-2">
            <p className="m-0 text-[0.6875rem] font-semibold tracking-wide text-text-subtle uppercase">{rotulo}</p>
            <div className="mt-0.5 text-sm">{corpo}</div>
          </div>
        ))}
        <p className="m-0 mt-2 flex items-start gap-1.5 text-xs text-success-fg">
          <Icone nome="concluir" className="mt-px size-3.5 shrink-0" />O cliente já foi avisado de que uma pessoa vai assumir.
        </p>
      </div>
      <div className="flex justify-end border-t border-border px-3.5 py-2.5">
        <BotaoApp>Assumir e responder</BotaoApp>
      </div>
    </article>
  );
}
