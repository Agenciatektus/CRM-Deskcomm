"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
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
  idioma,
}: {
  selecionadas: string[];
  padrao: string;
  onSelecionadas: (ids: string[]) => void;
  onPadrao: (id: string) => void;
  /** Avisa o formulário de que a lista chegou (só então o salvamento envia a escolha). */
  onCarregada: () => void;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const consulta = useTodasAsContasDaMeta(true);
  const [busca, setBusca] = useState("");
  const todas = useMemo(() => consulta.data?.data.contas ?? [], [consulta.data]);

  useEffect(() => {
    if (consulta.data) onCarregada();
  }, [consulta.data, onCarregada]);

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? todas.filter((c) => c.nome.toLowerCase().includes(termo) || c.id.includes(termo))
    : todas;
  const marcadas = todas.filter((c) => selecionadas.includes(c.id));

  function alternar(id: string) {
    onSelecionadas(selecionadas.includes(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id]);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="meta-seletor-de-contas">
      <Label htmlFor="busca_de_contas">{t("Contas de anúncio deste cliente")}</Label>
      <p className="text-xs text-muted-foreground">
        {t(
          "Os gestores desta organização só verão as contas marcadas. O login pode alcançar contas de outros clientes: marque apenas as deste.",
        )}
      </p>
      {consulta.isLoading && <p className="text-sm text-muted-foreground">{t("Carregando contas…")}</p>}
      {consulta.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("Não consegui listar as contas agora. Tente de novo em instantes.")}
        </p>
      )}
      {todas.length > 0 && (
        <>
          <Input
            id="busca_de_contas"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar por nome ou id")}
          />
          <ul className="max-h-64 overflow-y-auto rounded-md border">
            {visiveis.map((c) => (
              <li key={c.id} className="border-b last:border-b-0">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selecionadas.includes(c.id)}
                    onChange={() => alternar(c.id)}
                  />
                  <span className="flex-1">
                    {c.nome} <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.moeda}
                    {STATUS_DA_CONTA[c.status] ? ` · ${t(STATUS_DA_CONTA[c.status]!)}` : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {selecionadas.length} {t("marcadas")}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="default_account_id">{t("Conta padrão (opcional)")}</Label>
            <select
              id="default_account_id"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={marcadas.some((c) => c.id === padrao) ? padrao : ""}
              onChange={(e) => onPadrao(e.target.value)}
            >
              <option value="">{t("Primeira conta ativa")}</option>
              {marcadas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.id})
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
