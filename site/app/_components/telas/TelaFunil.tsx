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
        { nome: "Rafael Nogueira", valor: "—", canal: "instagram", dono: "IA", idade: "12 min", tom: 3 },
        { nome: "Beatriz Lima", valor: "—", canal: "whatsapp", dono: "IA", idade: "40 min", tom: 4 },
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
        { nome: "Gustavo Alves", valor: "—", canal: "instagram", dono: "IA", idade: "8 min", tom: 3 },
        { nome: "Carla Mendes", valor: "—", canal: "whatsapp", dono: "IA", idade: "1 h", tom: 0 },
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
        { nome: "Condomínio Aurora", valor: "—", canal: "whatsapp", dono: "IA", idade: "25 min", tom: 3 },
        { nome: "Oficina do Zé", valor: "—", canal: "whatsapp", dono: "IA", idade: "2 h", tom: 0 },
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

function CartaoLead({ c, termo }: { c: Cartao; termo: string }) {
  return (
    <div
      className={`rounded-card border p-2.5 text-left ${
        c.destaque ? "border-accent bg-accent-soft shadow-[0_0_0_1px_rgb(38_144_177/0.4)]" : "border-border bg-surface-elevated"
      } ${c.destaque ? "a-pulso-borda" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Avatar nome={c.nome} tom={c.tom} tamanho="size-7" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-meta font-bold">{c.nome}</p>
          <p className="m-0 text-[0.65rem] text-text-subtle">{termo}</p>
        </div>
        <span className="text-meta font-semibold">{c.valor}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <CanalChip canal={c.canal} />
        <Selo tom={c.dono === "IA" ? "ia" : "info"}>{c.dono}</Selo>
        <span
          className={`ml-auto flex items-center gap-1 text-[0.65rem] ${
            c.nota === "esfriando" ? "font-semibold text-warn" : "text-text-subtle"
          }`}
        >
          <Icone nome="relogio" className="size-3" />
          {c.nota === "esfriando" ? "Esfriando" : c.idade}
        </span>
      </div>
    </div>
  );
}

export function TelaFunil({ compacto = false }: { compacto?: boolean }) {
  const [chave, setChave] = useState<keyof typeof NEGOCIOS>("clinica");
  const n = NEGOCIOS[chave] as Negocio;
  const etapas = compacto ? n.etapas.slice(1, 4) : n.etapas;

  return (
    <div className="bg-bg text-text">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <p className="m-0 flex items-center gap-2 text-[0.95rem] font-bold">
          <Icone nome="funil" className="size-4 text-link" /> Funil
        </p>
        <div role="tablist" aria-label="Tipo de negócio" className="flex gap-1 rounded-full bg-surface p-1">
          {ORDEM.map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={chave === k}
              onClick={() => setChave(k)}
              className={`min-h-8 cursor-pointer rounded-full px-3.5 text-meta font-semibold transition-colors ${
                chave === k ? "bg-surface-elevated text-text" : "text-text-subtle hover:text-text"
              }`}
            >
              {NEGOCIOS[k]?.rotulo}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden items-center gap-1.5 text-meta text-text-subtle sm:flex">
          O lead vira <b className="text-text">{n.termo}</b>
        </span>
      </div>
      <div className="overflow-x-auto p-3">
        <div className={`grid gap-2.5 ${compacto ? "min-w-[34rem] grid-cols-3" : "min-w-[56rem] grid-cols-5"}`}>
          {etapas.map((e) => (
            <div key={e.nome} className="flex flex-col gap-2 rounded-field bg-surface/70 p-2">
              <p className="m-0 flex items-center justify-between px-1 pb-0.5 font-mono text-[0.66rem] tracking-wider text-text-subtle uppercase">
                <span className="truncate">{e.nome}</span>
                <span className="rounded-full bg-bg px-1.5 py-0.5">{e.cartoes.length}</span>
              </p>
              {e.cartoes.map((c) => (
                <CartaoLead key={c.nome} c={c} termo={n.termo} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
