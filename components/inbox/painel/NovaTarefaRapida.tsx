"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { AssignableMember } from "@/hooks/inbox/useAssignableMembers";
import { cn } from "@/lib/utils";

import { CLASSES_DO_CHIP, QuandoFazer } from "./QuandoFazer";

/**
 * Os gestos que mais viram tarefa no atendimento. "Ligar para o cliente" e não
 * só "Ligar": a chave "Ligar" já existe no dicionário no sentido de ATIVAR
 * (interruptor), e a mesma palavra sairia "Activar" em espanhol.
 */
const TITULOS_RAPIDOS = {
  ligar: "Ligar para o cliente",
  orcamento: "Mandar orçamento",
  consulta: "Confirmar consulta",
  retorno: "Cobrar retorno",
} as const;
const CHAVES_DOS_TITULOS = Object.keys(TITULOS_RAPIDOS) as Array<keyof typeof TITULOS_RAPIDOS>;

const CLASSES_DO_CAMPO =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring";

export interface PedidoDeTarefa {
  title: string;
  due_date: string;
  assigned_to: string;
}

/**
 * Criar o próximo passo sem sair da conversa: o quê, quando e quem.
 *
 * Prazo OBRIGATÓRIO aqui, embora a coluna aceite nulo: esta peça existe para o
 * próximo passo ter HORA. Tarefa sem prazo é lembrete solto, e quem precisa
 * dela tem a tela de Tarefas.
 */
export function NovaTarefaRapida({ usuarioId, membros, salvando, onCriar }: {
  usuarioId: string;
  membros: AssignableMember[];
  salvando: boolean;
  onCriar: (pedido: PedidoDeTarefa) => Promise<boolean>;
}) {
  const t = useT();
  // `useId`: o painel pode estar montado duas vezes (coluna larga e a gaveta do
  // celular), e id fixo repetido quebraria o vínculo rótulo → campo.
  const id = useId();
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState<Date | null>(null);
  const [responsavel, setResponsavel] = useState(usuarioId);
  // A chave do "Quando" muda depois de criar: o grupo remonta limpo, sem um
  // atalho aceso apontando para um prazo que já foi usado.
  const [rodada, setRodada] = useState(0);
  const invalido = titulo.trim().length === 0 || !prazo || salvando;
  const outros = membros.filter((m) => m.user_id !== usuarioId);

  async function criar() {
    if (invalido || !prazo) return;
    const ok = await onCriar({ title: titulo.trim(), due_date: prazo.toISOString(), assigned_to: responsavel });
    // Falha NÃO limpa o formulário: o texto digitado só some quando gravou.
    if (!ok) return;
    setTitulo("");
    setPrazo(null);
    setRodada((n) => n + 1);
  }

  return (
    <form
      className="space-y-1"
      data-testid="nova-tarefa-rapida"
      onSubmit={(e) => {
        e.preventDefault();
        void criar();
      }}
    >
      <label htmlFor={`${id}-titulo`} className="mb-1.5 mt-3 block text-xs font-semibold text-text-muted">
        {t("O que fazer")}
      </label>
      <input
        id={`${id}-titulo`}
        value={titulo}
        maxLength={255}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder={t("Ex.: ligar para confirmar o horário")}
        className={CLASSES_DO_CAMPO}
      />
      <div className="flex flex-wrap gap-1.5 pt-1.5">
        {CHAVES_DOS_TITULOS.map((k) => (
          <button key={k} type="button" className={cn(CLASSES_DO_CHIP)} onClick={() => setTitulo(t(TITULOS_RAPIDOS[k]))}>
            {t(TITULOS_RAPIDOS[k])}
          </button>
        ))}
      </div>

      <span id={`${id}-quando`} className="mb-1.5 mt-3 block text-xs font-semibold text-text-muted">
        {t("Quando")}
      </span>
      <QuandoFazer key={rodada} rotulo={`${id}-quando`} onEscolher={setPrazo} />

      <label htmlFor={`${id}-responsavel`} className="mb-1.5 mt-3 block text-xs font-semibold text-text-muted">
        {t("Responsável")}
      </label>
      <select
        id={`${id}-responsavel`}
        value={responsavel}
        onChange={(e) => setResponsavel(e.target.value)}
        className={CLASSES_DO_CAMPO}
      >
        <option value={usuarioId}>{t("Você")}</option>
        {outros.map((m) => (
          <option key={m.user_id} value={m.user_id}>{m.full_name ?? t("Sem nome")}</option>
        ))}
      </select>

      <div className="flex items-center gap-2 pt-3">
        <Button type="submit" size="sm" disabled={invalido}>
          {salvando ? t("Salvando…") : t("Criar tarefa")}
        </Button>
        <span className="text-xs text-text-muted">{t("Entra na lista de Tarefas.")}</span>
      </div>
    </form>
  );
}
