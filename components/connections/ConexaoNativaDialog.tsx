"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { CheckCircle } from "@/lib/ui/icons";

import { ConexaoNativaNumero } from "./ConexaoNativaNumero";
import { ConexaoNativaQr } from "./ConexaoNativaQr";
import { useConexaoNativa } from "./useConexaoNativa";

/**
 * Conectar um canal CRIADO pelo CRM: QR (com instrucoes por aparelho) ou codigo
 * por numero. O estado vem do servidor a cada 2,5 s, que reabre a conexao se a
 * WhatsApp a encerrou por falta de leitura.
 */
export function ConexaoNativaDialog({
  canalId,
  onClose,
  onConectado,
}: {
  canalId: string;
  onClose: () => void;
  onConectado: () => void;
}) {
  const t = useT();
  const [aba, setAba] = useState("qr");
  const { corpo, falha, tentarAgora } = useConexaoNativa(canalId, onConectado);
  const conectado = corpo?.estado === "conectado";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{conectado ? t("WhatsApp conectado!") : t("Conectar WhatsApp")}</DialogTitle>
          <DialogDescription>
            {conectado
              ? t("O CRM já recebe e envia mensagens por este número.")
              : t("Leia o QR code ou use o código por número. A tela atualiza sozinha.")}
          </DialogDescription>
        </DialogHeader>
        <div aria-live="polite" className="min-h-[18rem]">
          {conectado ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle size={48} weight="fill" className="text-success-fg" aria-hidden />
              {corpo?.telefone && <p className="font-mono text-lg text-text">+{corpo.telefone}</p>}
              <Button autoFocus onClick={onClose}>
                {t("Concluir")}
              </Button>
            </div>
          ) : (
            <Tabs value={aba} onValueChange={setAba}>
              <TabsList>
                <TabsTrigger value="qr">{t("QR code")}</TabsTrigger>
                <TabsTrigger value="numero">{t("Por número")}</TabsTrigger>
              </TabsList>
              <TabsContent value="qr" className="pt-4">
                <ConexaoNativaQr corpo={corpo} falha={falha} onTentarAgora={tentarAgora} />
              </TabsContent>
              <TabsContent value="numero" className="pt-4">
                <ConexaoNativaNumero canalId={canalId} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
