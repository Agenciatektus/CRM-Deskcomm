"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { criarFunilDosPedidos, escolherFunilDosPedidos } from "@/app/actions/integrations/funilDosPedidosNuvemshop";
import { useT } from "@/hooks/i18n/useT";

const ERROS: Record<string, string> = {
  forbidden: "Apenas admins podem mudar o funil dos pedidos.",
  invalid_pipeline: "Esse funil não tem as 6 etapas de pedido.",
  db_error: "Falha de banco ao salvar o funil.",
};

export function FunilDosPedidos({
  funis,
  escolhidoId,
  disabled,
}: {
  funis: Array<{ id: string; name: string }>;
  escolhidoId: string | null;
  disabled?: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const rodar = (acao: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await acao();
      if (res.ok) toast.success(t("Funil dos pedidos salvo."));
      else toast.error(t(ERROS[res.error ?? ""] ?? `Erro: ${res.error}`));
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={escolhidoId ?? ""}
        disabled={disabled || pending || funis.length === 0}
        onChange={(e) => e.target.value && rodar(() => escolherFunilDosPedidos(e.target.value))}
        aria-label={t("Funil dos pedidos")}
      >
        <option value="">{t("Escolha um funil")}</option>
        {funis.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <Button variant="outline" disabled={disabled || pending} onClick={() => rodar(criarFunilDosPedidos)}>
        {t("Criar funil padrão")}
      </Button>
    </div>
  );
}
