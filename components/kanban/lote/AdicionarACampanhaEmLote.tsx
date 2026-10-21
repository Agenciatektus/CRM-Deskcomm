"use client";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Escolha } from "@/components/ui/escolha";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/** O que a conferência da rota devolve (`POST /campaigns/:id/incluir`). */
export interface ConferenciaDaInclusao {
  entram: number;
  fora: Array<{ motivo: string; quantos: number; texto: string }>;
  gravado: boolean;
}

type CampanhaDaLista = { id: string; name: string; status: string; entrada_continua?: boolean };

/**
 * "Adicionar à campanha" em LOTE (fase 2 combinada com o Peterson): os
 * contatos dos negócios selecionados entram no público de uma campanha de
 * disparo em RASCUNHO. A regra mora na rota (`lib/campanhas/incluir-do-funil.ts`);
 * aqui, a escolha e a confirmação com os números: quantos entram e, de quem
 * fica de fora, quantos e por quê — a MESMA conta da prévia da campanha.
 *
 * Sem o Desfazer de 5 s das outras ações: nada sai de um rascunho. O envio só
 * acontece depois de Preparar e Iniciar, na tela da campanha, que reconfere
 * todo mundo.
 */
export function AdicionarACampanhaEmLote({
  open,
  onOpenChange,
  selectedIds,
  onConcluido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onConcluido: () => void;
}) {
  const t = useT();
  const id = useId();
  const [campanha, setCampanha] = useState("");
  const [gravando, setGravando] = useState(false);

  // Só rascunho de campanha em LISTA: a contínua aborda quem chega na etapa.
  const campanhas = useQuery({
    queryKey: ["campanhas-em-rascunho"],
    queryFn: () => apiClient.get<{ data: CampanhaDaLista[] }>("/api/v1/campaigns?status=draft&limit=100"),
    select: (r) => r.data.filter((c) => c.status === "draft" && !c.entrada_continua),
    enabled: open,
  });
  const conferencia = useQuery({
    queryKey: ["incluir-na-campanha", campanha, selectedIds],
    queryFn: () =>
      apiClient.post<{ data: ConferenciaDaInclusao }>(`/api/v1/campaigns/${campanha}/incluir`, {
        lead_ids: selectedIds,
      }),
    select: (r) => r.data,
    enabled: open && campanha !== "",
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const lista = campanhas.data ?? [];
  const resumo = conferencia.data;
  const n = resumo?.entram ?? 0;

  const confirmar = async () => {
    if (!campanha || n === 0) return;
    setGravando(true);
    try {
      // A rota confere DE NOVO antes de gravar: o número pode ter mudado.
      const r = await apiClient.post<{ data: ConferenciaDaInclusao }>(`/api/v1/campaigns/${campanha}/incluir`, {
        lead_ids: selectedIds,
        confirmar: true,
      });
      const entraram = r.data.entram;
      toast.success(
        entraram === 1 ? t("1 contato adicionado à campanha.") : `${entraram} ${t("contatos adicionados à campanha.")}`,
      );
      onOpenChange(false);
      onConcluido();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : String(erro));
    } finally {
      setGravando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Adicionar à campanha")}</DialogTitle>
          <DialogDescription>
            {t(
              "Os contatos dos negócios selecionados entram no público de uma campanha em rascunho. Nada é enviado agora: o envio só começa quando a campanha for preparada e iniciada.",
            )}
          </DialogDescription>
        </DialogHeader>
        {campanhas.isLoading ? (
          <p className="text-sm text-text-muted">{t("Carregando…")}</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-text-muted">
            {t("Nenhuma campanha em rascunho. Crie uma em Campanhas e volte aqui.")}
          </p>
        ) : (
          <div className="space-y-3">
            <label htmlFor={`${id}-campanha`} className="block text-xs font-semibold text-text-muted">
              {t("Campanha")}
            </label>
            <Escolha
              id={`${id}-campanha`}
              value={campanha}
              onValueChange={setCampanha}
              opcoes={[
                { value: "", label: t("Escolha a campanha") },
                ...lista.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            {campanha !== "" && conferencia.isLoading && (
              <p className="text-sm text-text-muted">{t("Conferindo os contatos…")}</p>
            )}
            {conferencia.isError && (
              <p role="alert" className="text-sm text-destructive">
                {conferencia.error instanceof Error ? conferencia.error.message : t("Não consegui conferir.")}
              </p>
            )}
            {resumo && (
              <div data-testid="conferencia-da-campanha" className="space-y-1 text-sm">
                <p className="font-medium">
                  {n === 1 ? t("1 contato entra na campanha.") : `${n} ${t("contatos entram na campanha.")}`}
                </p>
                {resumo.fora.length > 0 && (
                  <>
                    <p className="text-text-muted">{t("Ficam de fora:")}</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-text-muted">
                      {resumo.fora.map((f) => (
                        <li key={f.motivo}>{`${f.quantos}: ${f.texto}`}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => void confirmar()} disabled={!resumo || n === 0 || gravando}>
            {t("Adicionar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
