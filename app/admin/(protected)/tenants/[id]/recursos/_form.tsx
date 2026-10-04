"use client";

import { useState, useTransition } from "react";

import { liberarModuloParaEmpresa } from "@/app/actions/admin/liberarModuloParaEmpresa";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import type { ModuloLiberadoPorEmpresa } from "@/lib/organizacao/modulos-liberados";

/** `Record` exaustivo: módulo liberável novo sem texto não compila. */
const TEXTO: Record<ModuloLiberadoPorEmpresa, { rotulo: string; descricao: string }> = {
  prospeccao: {
    rotulo: "Prospecção no Google Maps",
    descricao:
      "A empresa busca empresas no Google Maps com a própria chave da Apify e conduz abordagens graduais com IA. Revogar esconde a tela e para a campanha em andamento.",
  },
};

/**
 * Mesmo desenho dos módulos da instalação: cada interruptor salva na hora e
 * volta se a gravação falhar. O histórico fica no audit (`platform.modulo_liberado`).
 */
export function FormularioDeLiberacao({
  organizationId,
  liberados,
  leituraFalhou,
  daInstalacao,
}: {
  organizationId: string;
  liberados: readonly string[];
  leituraFalhou: boolean;
  daInstalacao: readonly ModuloOpcional[];
}) {
  const t = useT();
  const [estado, setEstado] = useState<ReadonlySet<string>>(new Set(liberados));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function trocar(modulo: ModuloLiberadoPorEmpresa, valor: boolean) {
    setErro(null);
    const alternar = (liberar: boolean) =>
      setEstado((atual) => {
        const proximo = new Set(atual);
        if (liberar) proximo.add(modulo);
        else proximo.delete(modulo);
        return proximo;
      });
    alternar(valor);
    startTransition(async () => {
      const r = await liberarModuloParaEmpresa({ organizationId, modulo, liberado: valor });
      if (!r.ok) {
        alternar(!valor);
        setErro(t("Não deu para salvar. Tente de novo em instantes."));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Recursos liberados")}</CardTitle>
        <CardDescription>
          {t("Módulos que só aparecem para as empresas que você liberar. Sem liberação, a empresa não vê a tela nem o menu.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {leituraFalhou && (
          <p className="text-sm text-destructive" role="alert">
            {t("Não consegui ler as liberações agora. Recarregue antes de mudar qualquer coisa.")}
          </p>
        )}
        {(Object.keys(TEXTO) as ModuloLiberadoPorEmpresa[]).map((modulo) => {
          const id = `liberar-${modulo}`;
          return (
            <div key={modulo} className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor={id} className="text-base">
                  {t(TEXTO[modulo].rotulo)}
                </Label>
                <p className="text-sm text-muted-foreground">{t(TEXTO[modulo].descricao)}</p>
                {!daInstalacao.includes(modulo) && (
                  <p className="text-sm text-muted-foreground">
                    {t("Desligado no servidor: a liberação fica guardada e vale quando o módulo for ligado em Sistema.")}
                  </p>
                )}
              </div>
              <Switch
                id={id}
                checked={estado.has(modulo)}
                onCheckedChange={(valor) => trocar(modulo, valor)}
                disabled={pendente || leituraFalhou}
                aria-label={t(TEXTO[modulo].rotulo)}
              />
            </div>
          );
        })}

        {erro && (
          <p className="text-sm text-destructive" role="alert">
            {erro}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
