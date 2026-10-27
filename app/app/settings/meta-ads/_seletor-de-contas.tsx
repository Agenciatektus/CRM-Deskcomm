"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Escolha } from "@/components/ui/escolha";
import { Label } from "@/components/ui/label";
import { useTodasAsContasDaMeta } from "@/hooks/ads/useMetaAds";
import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";

const STATUS_DA_CONTA: Record<number, string> = {
  2: "desativada",
  3: "pendência de cobrança",
  7: "em análise de risco",
  8: "aguardando pagamento",
  9: "em período de carência",
  100: "encerramento pendente",
  101: "encerrada",
};

/**
 * Escolha das contas de anúncio DESTE cliente entre as que o login alcança.
 * Gestores só enxergam as marcadas (o servidor impõe; aqui é só a escolha).
 */
export function SeletorDeContas({
  selecionadas,
  padrao,
  onSelecionadas,
  onPadrao,
  onCarregada,
  podeAmpliar,
  precisaReconectar = false,
  idioma,
}: {
  selecionadas: string[];
  padrao: string;
  onSelecionadas: (ids: string[]) => void;
  onPadrao: (id: string) => void;
  /** Avisa o formulário de que a lista chegou, com o total (só então o salvamento envia a escolha). */
  onCarregada: (total: number) => void;
  /** Quem conectou a Meta (ou suporte) vê todas as contas; os demais, só as liberadas. */
  podeAmpliar: boolean;
  /** A Meta recusou renovar: a lista não carrega, mas a escolha guardada continua valendo. */
  precisaReconectar?: boolean;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const consulta = useTodasAsContasDaMeta(true, podeAmpliar);
  const [busca, setBusca] = useState("");
  const [soMarcadas, setSoMarcadas] = useState(false);
  const todas = useMemo(() => consulta.data?.data.contas ?? [], [consulta.data]);
  const caixaDeTodas = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (consulta.data) onCarregada(todas.length);
  }, [consulta.data, todas.length, onCarregada]);

  const termo = busca.trim().toLowerCase();
  const filtrando = termo !== "" || soMarcadas;
  const visiveis = todas.filter(
    (c) =>
      (!termo || c.nome.toLowerCase().includes(termo) || c.id.includes(termo)) &&
      (!soMarcadas || selecionadas.includes(c.id)),
  );
  const marcadas = todas.filter((c) => selecionadas.includes(c.id));
  const visiveisMarcadas = visiveis.filter((c) => selecionadas.includes(c.id)).length;
  const todasVisiveis = visiveis.length > 0 && visiveisMarcadas === visiveis.length;
  const algumaVisivel = visiveisMarcadas > 0 && !todasVisiveis;

  useEffect(() => {
    if (caixaDeTodas.current) caixaDeTodas.current.indeterminate = algumaVisivel;
  }, [algumaVisivel]);

  function alternar(id: string) {
    onSelecionadas(selecionadas.includes(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id]);
  }

  function alternarVisiveis() {
    const ids = visiveis.map((c) => c.id);
    onSelecionadas(
      todasVisiveis
        ? selecionadas.filter((x) => !ids.includes(x))
        : [...selecionadas, ...ids.filter((x) => !selecionadas.includes(x))],
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="meta-seletor-de-contas">
      <div>
        <Label htmlFor="busca_de_contas" className="text-base font-medium">
          {t("Contas de anúncio deste cliente")}
        </Label>
        <p className="mt-1 text-xs text-text-muted">
          {t(
            "Os gestores desta organização só veem as contas marcadas. O login alcança contas de outros clientes também: marque só as deste.",
          )}
        </p>
      </div>
      {!podeAmpliar && (
        <p className="text-xs font-medium" data-testid="meta-sem-permissao-de-ampliar">
          {t("Para liberar outras contas, peça a quem conectou a Meta ou ao suporte")}
        </p>
      )}
      {consulta.isLoading && <p className="text-sm text-text-muted">{t("Carregando contas…")}</p>}
      {consulta.error && (
        <p role="alert" className="text-sm text-error-fg">
          {precisaReconectar
            ? t("As {n} contas marcadas continuam guardadas. Reconecte para ver a lista e mudar a seleção.").replace(
                "{n}",
                String(selecionadas.length),
              )
            : t("Não consegui listar as contas agora. Tente de novo em instantes.")}
        </p>
      )}
      {todas.length > 0 && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="busca_de_contas"
              name="busca_de_contas"
              type="search"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar por nome ou id")}
            />
            <div role="group" aria-label={t("Filtrar contas")} className="flex gap-1">
              <Button
                type="button"
                variant={soMarcadas ? "outline" : "secondary"}
                aria-pressed={!soMarcadas}
                onClick={() => setSoMarcadas(false)}
              >
                {t("Todas")}
              </Button>
              <Button
                type="button"
                variant={soMarcadas ? "secondary" : "outline"}
                aria-pressed={soMarcadas}
                onClick={() => setSoMarcadas(true)}
              >
                {t("Marcadas")}
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-border">
            <label
              data-testid="meta-selecionar-todas"
              className="flex cursor-pointer items-center gap-2 border-b border-border bg-surface-elevated px-3 py-2 text-sm font-medium"
            >
              <input
                ref={caixaDeTodas}
                type="checkbox"
                checked={todasVisiveis}
                disabled={visiveis.length === 0}
                onChange={alternarVisiveis}
              />
              <span className="flex-1">
                {filtrando
                  ? t("Selecionar as {n} visíveis").replace("{n}", String(visiveis.length))
                  : t("Selecionar todas")}
              </span>
              <span className="text-xs font-normal text-text-muted" data-testid="meta-contagem-marcadas">
                {t("{x} de {n} marcadas")
                  .replace("{x}", String(marcadas.length))
                  .replace("{n}", String(todas.length))}
              </span>
            </label>
            <ul className="max-h-64 overflow-y-auto">
              {visiveis.length === 0 && (
                <li className="px-3 py-3 text-sm text-text-muted">{t("Nenhuma conta encontrada.")}</li>
              )}
              {visiveis.map((c) => (
                <li key={c.id} className="border-b border-border last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selecionadas.includes(c.id)}
                      onChange={() => alternar(c.id)}
                    />
                    <span className="flex-1">
                      {c.nome} <span className="font-mono text-xs text-text-muted">{c.id}</span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {c.moeda}
                      {STATUS_DA_CONTA[c.status] ? `, ${t(STATUS_DA_CONTA[c.status]!)}` : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <Label htmlFor="default_account_id">{t("Conta padrão (opcional)")}</Label>
            <Escolha
              id="default_account_id"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={marcadas.some((c) => c.id === padrao) ? padrao : ""}
              onValueChange={onPadrao}
              opcoes={[
                { value: "", label: t("Primeira conta ativa") },
                ...marcadas.map((c) => ({ value: c.id, label: `${c.nome} (${c.id})` })),
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
