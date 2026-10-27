"use client";

import { useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useFiltrosSalvos, type FiltroSalvo } from "@/hooks/inbox/useFiltrosSalvos";
import { ApiError } from "@/lib/api/types";
import {
  filtrosSalvosSchema,
  haFiltroAtivo,
  normalizarFiltros,
  TAMANHO_DO_NOME,
  type FiltrosSalvos as Filtros,
} from "@/lib/inbox/filtros-salvos";
import { Trash } from "@/lib/ui/icons";

import type { InboxFiltersValue } from "../InboxFilters";

/** Aplica um filtro salvo: desliga o que estava ligado e liga o que ele guarda. A aba e a busca ficam. */
export function aplicarFiltroSalvo(value: InboxFiltersValue, f: Filtros): InboxFiltersValue {
  return {
    ...value,
    onlyUnread: f.onlyUnread ?? false,
    onlyGroups: f.onlyGroups ?? false,
    semPasso: f.semPasso ?? false,
    channel_session_id: f.channel_session_id,
    canal: f.canal,
    entrada: f.entrada,
    tag: f.tag,
    tagMode: f.tagMode,
    atendimento: f.atendimento,
  };
}

const BOTAO_DA_LINHA =
  "h-8 rounded-md px-2 text-xs font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Filtros salvos" no popover: lista (clique aplica), lixeira com confirmação no
 * lugar (sem diálogo) e "Salvar este filtro" com nome, só com filtro ativo.
 */
export function FiltrosSalvos({
  value,
  onChange,
}: {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
}) {
  const t = useT();
  const { activeOrg, user } = useAuth();
  const { lista, salvar, apagar } = useFiltrosSalvos(activeOrg?.orgId ?? null, user?.id);
  const [nome, setNome] = useState("");
  const [nomeAberto, setNomeAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);

  const ativo = haFiltroAtivo(value);
  const salvos = lista.data ?? [];

  const aplicar = (f: FiltroSalvo) => {
    // Linha gravada por versão antiga ou à mão: só aplica o que passa no schema.
    const lido = filtrosSalvosSchema.safeParse(f.filtros);
    if (!lido.success) {
      setErro(t("Este filtro salvo não pôde ser aplicado."));
      return;
    }
    setErro(null);
    onChange(aplicarFiltroSalvo(value, lido.data));
  };

  const fecharNome = () => {
    setNomeAberto(false);
    setErro(null);
  };

  const aoSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    const limpo = nome.trim();
    if (!limpo) return;
    setErro(null);
    salvar.mutate(
      { nome: limpo, filtros: normalizarFiltros(value) },
      {
        onSuccess: () => {
          setNome("");
          setNomeAberto(false);
        },
        onError: (err) =>
          setErro(
            err instanceof ApiError && (err.status === 409 || err.status === 422)
              ? err.message
              : t("Não foi possível salvar o filtro."),
          ),
      },
    );
  };

  const linha = (f: FiltroSalvo) =>
    apagando === f.id ? (
      <li key={f.id} className="flex items-center gap-1 px-1">
        <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{t("Apagar este filtro?")}</span>
        <button
          type="button"
          autoFocus
          disabled={apagar.isPending}
          onClick={() => apagar.mutate(f.id, { onError: showApiError, onSettled: () => setApagando(null) })}
          className={`${BOTAO_DA_LINHA} text-error hover:bg-surface-elevated`}
        >
          {t("Apagar")}
        </button>
        <button
          type="button"
          onClick={() => setApagando(null)}
          className={`${BOTAO_DA_LINHA} text-text-muted hover:bg-surface-elevated`}
        >
          {t("Cancelar")}
        </button>
      </li>
    ) : (
      <li key={f.id} className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => aplicar(f)}
          title={f.nome}
          className="h-8 min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm hover:bg-surface-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {f.nome}
        </button>
        <button
          type="button"
          onClick={() => setApagando(f.id)}
          aria-label={`${t("Apagar o filtro")} ${f.nome}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-subtle hover:bg-surface-elevated hover:text-error focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash size={14} aria-hidden />
        </button>
      </li>
    );

  return (
    <div className="space-y-1.5 border-t border-border px-1 pt-2.5" data-testid="filtros-salvos">
      <p className="px-1 text-xs font-semibold text-text-subtle">{t("Filtros salvos")}</p>

      {lista.isLoading ? (
        <p role="status" className="px-1 text-xs text-text-subtle">
          {t("Carregando filtros salvos")}
        </p>
      ) : lista.isError ? (
        <div className="flex items-center gap-2 px-1">
          <p role="alert" className="min-w-0 flex-1 text-xs text-error">
            {t("Não foi possível carregar os filtros salvos.")}
          </p>
          <button
            type="button"
            onClick={() => void lista.refetch()}
            className={`${BOTAO_DA_LINHA} text-accent-text hover:bg-surface-elevated`}
          >
            {t("Tentar de novo")}
          </button>
        </div>
      ) : salvos.length === 0 ? (
        <p className="px-1 text-xs text-text-subtle">{t("Nenhum filtro salvo ainda.")}</p>
      ) : (
        <ul className="space-y-0.5">{salvos.map(linha)}</ul>
      )}

      {erro && !nomeAberto && (
        <p role="alert" className="px-1 text-xs text-error">
          {erro}
        </p>
      )}

      {ativo &&
        (nomeAberto ? (
          <form onSubmit={aoSalvar} className="space-y-1.5">
            <Input
              autoFocus
              value={nome}
              maxLength={TAMANHO_DO_NOME}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                // Esc fecha só o campo; o popover continua aberto.
                if (e.key === "Escape") {
                  e.stopPropagation();
                  fecharNome();
                }
              }}
              aria-label={t("Nome do filtro")}
              placeholder={t("Nome do filtro")}
              aria-invalid={erro ? true : undefined}
              className="h-8"
            />
            {erro && (
              <p role="alert" className="text-xs text-error">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={fecharNome}>
                {t("Cancelar")}
              </Button>
              <Button type="submit" size="sm" disabled={!nome.trim() || salvar.isPending}>
                {t("Salvar")}
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setNomeAberto(true)}>
            {t("Salvar este filtro")}
          </Button>
        ))}
    </div>
  );
}
