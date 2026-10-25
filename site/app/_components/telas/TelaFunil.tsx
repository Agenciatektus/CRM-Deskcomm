"use client";

import { useState } from "react";

import { Icone } from "../ui/Icones";
import { Avatar, CanalChip, Selo } from "../ui/Pecas";

/**
 * O quadro do funil (Kanban) do CRM, com dados FICTÍCIOS e o vocabulário que muda por negócio.
 * É o único ponto da LP com estado de cliente: as abas trocam os nomes de etapa e o termo do lead,
 * como a configuração de funil do CRM faz. O HTML renderizado no servidor já traz o primeiro
 * negócio (clínica) completo; o JavaScript só troca de aba.
 */

type Cartao = { nome: string; valor: string; canal: "whatsapp" | "instagram"; dono: string; idade: string; nota?: "esfriando" | "sem-dono"; tom: number; destaque?: boolean };
type Negocio = { rotulo: string; termo: string; etapas: { nome: string; cartoes: Cartao[] }[] };

const NEGOCIOS: Record<string, Negocio> = {
  clinica: {
    rotulo: "Clínica",
    termo: "Paciente",
    etapas: [
      { nome: "Primeiro contato", cartoes: [
        { nome: "Rafael Nogueira", valor: "", canal: "instagram", dono: "IA", idade: "12 min", tom: 3 },
        { nome: "Beatriz Lima", valor: "", canal: "whatsapp", dono: "IA", idade: "40 min", tom: 4 },
      ] },
      { nome: "Avaliação", cartoes: [
        { nome: "Paulo Santos", valor: "R$ 640", canal: "whatsapp", dono: "IA", idade: "3 h", tom: 1 },
        { nome: "Tiago Moreira", valor: "R$ 900", canal: "whatsapp", dono: "IA", idade: "2 d", nota: "esfriando", tom: 5 },
      ] },
      { nome: "Proposta enviada", cartoes: [
        { nome: "Helena Costa", valor: "R$ 1.800", canal: "instagram", dono: "Camila", idade: "1 d", tom: 0 },
      ] },
      { nome: "Negociação", cartoes: [
        { nome: "Marina Duarte", valor: "R$ 2.400", canal: "whatsapp", dono: "Camila", idade: "20 min", tom: 2, destaque: true },
      ] },
      { nome: "Tratamento fechado", cartoes: [
        { nome: "Luciana Ramos", valor: "R$ 3.100", canal: "whatsapp", dono: "Camila", idade: "ontem", tom: 4 },
      ] },
    ],
  },
  infoproduto: {
    rotulo: "Infoproduto",
    termo: "Comprador",
    etapas: [
      { nome: "Lead novo", cartoes: [
        { nome: "Gustavo Alves", valor: "", canal: "instagram", dono: "IA", idade: "8 min", tom: 3 },
        { nome: "Carla Mendes", valor: "", canal: "whatsapp", dono: "IA", idade: "1 h", tom: 0 },
      ] },
      { nome: "Aula assistida", cartoes: [
        { nome: "Diego Farias", valor: "R$ 497", canal: "whatsapp", dono: "IA", idade: "5 h", tom: 1 },
        { nome: "Aline Prado", valor: "R$ 497", canal: "whatsapp", dono: "IA", idade: "2 d", nota: "esfriando", tom: 5 },
      ] },
      { nome: "Carrinho", cartoes: [{ nome: "Renata Souza", valor: "R$ 497", canal: "instagram", dono: "Bruno", idade: "1 d", tom: 4 }] },
      { nome: "Checkout iniciado", cartoes: [{ nome: "Felipe Costa", valor: "R$ 497", canal: "whatsapp", dono: "Bruno", idade: "35 min", tom: 2, destaque: true }] },
      { nome: "Pago", cartoes: [{ nome: "Mariana Vaz", valor: "R$ 497", canal: "whatsapp", dono: "Bruno", idade: "ontem", tom: 1 }] },
    ],
  },
  servicos: {
    rotulo: "Serviços",
    termo: "Cliente",
    etapas: [
      { nome: "Pedido de orçamento", cartoes: [
        { nome: "Condomínio Aurora", valor: "", canal: "whatsapp", dono: "IA", idade: "25 min", tom: 3 },
        { nome: "Oficina do Zé", valor: "", canal: "whatsapp", dono: "IA", idade: "2 h", tom: 0 },
      ] },
      { nome: "Visita técnica", cartoes: [
        { nome: "Clínica Sorriso", valor: "R$ 4.200", canal: "whatsapp", dono: "Lara", idade: "1 d", tom: 1 },
        { nome: "Padaria Central", valor: "R$ 1.900", canal: "instagram", dono: "IA", idade: "3 d", nota: "esfriando", tom: 5 },
      ] },
      { nome: "Proposta", cartoes: [{ nome: "Escola Horizonte", valor: "R$ 8.600", canal: "whatsapp", dono: "Lara", idade: "2 d", tom: 4 }] },
      { nome: "Negociação", cartoes: [{ nome: "Rede Vitória", valor: "R$ 12.000", canal: "whatsapp", dono: "Lara", idade: "4 h", tom: 2, destaque: true }] },
      { nome: "Fechado", cartoes: [{ nome: "Studio Pilates", valor: "R$ 3.300", canal: "whatsapp", dono: "Lara", idade: "ontem", tom: 4 }] },
    ],
  },
};

const ORDEM = ["clinica", "infoproduto", "servicos"] as const;

const PREVIAS = [
  "Pode ser amanhã?",
  "Qual o valor?",
  "Obrigada, vou ver aqui",
  "Me manda o endereço",
  "Combinado, fecho hoje",
  "Tem horário na sexta?",
];
const ETIQUETAS = ["indicação", "anúncio-meta", "retorno", "primeira-vez", "pediu-preço"];

function hash(nome: string) {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h;
}

/** Cartão do Kanban (KanbanCard): avatar com selo de canal, nome 14/700, valor 15/700, última mensagem, etiquetas e rodapé. */
function CartaoLead({ c }: { c: Cartao }) {
  const h = hash(c.nome);
  const esfriando = c.nota === "esfriando";
  return (
    <div
      className={`flex flex-col gap-2.5 overflow-hidden rounded-xl border px-3 pt-3 pb-2.5 text-left shadow-xs ${
        c.destaque ? "a-pulso-borda border-accent bg-accent-soft ring-1 ring-accent" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative">
          <Avatar nome={c.nome} tom={c.tom} tamanho="size-9" />
          <span
            className={`absolute -right-1 -bottom-1 grid size-[17px] place-items-center rounded-full text-white ring-2 ${
              c.destaque ? "ring-[#1d3943]" : "ring-surface"
            } ${c.canal === "whatsapp" ? "bg-[#1fa561]" : "bg-[#c13584]"}`}
          >
            <Icone nome={c.canal === "whatsapp" ? "chat" : "camera"} peso="bold" className="size-2.5" />
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="m-0 truncate text-sm leading-5 font-bold">{c.nome}</p>
          <span className="truncate text-xs text-text-subtle tabular-nums">+55 21 9•••• {String(1000 + h).slice(-4)}</span>
        </div>
      </div>
      {c.valor ? <span className="text-[15px] leading-tight font-bold tabular-nums">{c.valor}</span> : null}
      <span className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-text-muted">
        <Icone nome="conversa" className="size-3 shrink-0" />
        <span className="truncate">{PREVIAS[h % PREVIAS.length]}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        <span className="inline-flex h-[22px] items-center rounded-full border border-border bg-surface px-2 text-xs text-text-muted">
          {ETIQUETAS[h % ETIQUETAS.length]}
        </span>
      </span>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-text-subtle">
        {esfriando ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-warning-bg px-1.5 py-0.5 font-bold whitespace-nowrap text-warning-fg">
            <Icone nome="bandeira" className="size-3.5" /> Parado há {c.idade}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Icone nome="relogio" className="size-3.5" /> há {c.idade}
          </span>
        )}
        {c.dono === "IA" ? (
          <Selo tom="ia">
            <Icone nome="agente" className="size-3" /> IA
          </Selo>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-text-muted">
            <Avatar nome={c.dono} tom={h % 6} tamanho="size-5" />
            {c.dono}
          </span>
        )}
      </div>
    </div>
  );
}

export function TelaFunil({ compacto = false }: { compacto?: boolean }) {
  const [chave, setChave] = useState<keyof typeof NEGOCIOS>("clinica");
  const n = NEGOCIOS[chave] as Negocio;
  const etapas = compacto ? n.etapas.slice(1, 4) : n.etapas;
  const total = n.etapas.reduce((t, e) => t + e.cartoes.length, 0);

  return (
    <div className="bg-bg text-text">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="m-0 text-xl font-bold tracking-[-0.01em]">Funil</h3>
          <p className="m-0 text-sm text-text-muted">
            <span className="font-semibold text-text tabular-nums">{total} leads</span>
          </p>
        </div>
        <div role="group" aria-label="Tipo de negócio" className="pele-seg flex gap-0.5 rounded-field border border-border p-[3px]">
          {ORDEM.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={chave === k}
              onClick={() => setChave(k)}
              className={`min-h-7 cursor-pointer rounded-[7px] px-3.5 text-meta font-semibold transition-colors ${
                chave === k ? "pele-seg-item-on text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {NEGOCIOS[k]?.rotulo}
            </button>
          ))}
        </div>
        <span className="hidden h-8 items-center gap-1.5 rounded-control bg-(image:--degrade) px-3.5 text-[13px] font-semibold text-white sm:inline-flex">
          <Icone nome="mais" peso="bold" className="size-3.5" /> Novo Lead
        </span>
      </header>
      <div className="overflow-x-auto p-3" role="region" aria-label="Etapas do funil" tabIndex={0}>
        <div className="flex w-max gap-3">
          {etapas.map((e, i) => (
            <div key={e.nome} className="flex w-[17.5rem] shrink-0 flex-col rounded-lg border border-border bg-surface/50">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <i className="size-2 rounded-full" style={{ background: ["#65a7fa", "#ffb848", "#c4a1f4", "#2bc88f", "#41ce90"][i % 5] }} />
                <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold">{e.nome}</h4>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
                  {e.cartoes.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                {e.cartoes.map((c) => (
                  <CartaoLead key={c.nome} c={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
