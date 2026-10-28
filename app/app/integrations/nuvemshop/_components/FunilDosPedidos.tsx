"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      <Select
        value={escolhidoId ?? ""}
        disabled={disabled || pending || funis.length === 0}
        onValueChange={(id) => id && rodar(() => escolherFunilDosPedidos(id))}
      >
        <SelectTrigger className="h-9 w-[240px]" aria-label={t("Funil dos pedidos")}>
          <SelectValue placeholder={t("Escolha um funil")} />
        </SelectTrigger>
        <SelectContent>
          {funis.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" disabled={disabled || pending} onClick={() => rodar(criarFunilDosPedidos)}>
        {t("Criar funil padrão")}
      </Button>
    </div>
  );
}
