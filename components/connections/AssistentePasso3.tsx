"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";

import type { Metodo } from "./AssistenteMetodo";
import { CanalGraphParceiroClient } from "./CanalGraphParceiroClient";
import { CanalHospedadoClient } from "./CanalHospedadoClient";
import { CanalOficialClient } from "./CanalOficialClient";
import { CanalParceiroClient } from "./CanalParceiroClient";
import { ConexaoNativaNumero } from "./ConexaoNativaNumero";
import { ConexaoNativaPasskey } from "./ConexaoNativaPasskey";
import { ConexaoNativaQr } from "./ConexaoNativaQr";
import { useConexaoNativa } from "./useConexaoNativa";

export type Parceiro = "padrao" | "graph";

/** QR: o mesmo poll alimenta as tres abas; o hook para sozinho ao conectar. */
function PassoQr({ canalId, onConectado }: { canalId: string; onConectado: (telefone: string | null) => void }) {
  const t = useT();
  const { corpo, falha, tentarAgora } = useConexaoNativa(canalId, (c) => onConectado(c.telefone ?? null));
  return (
    <div aria-live="polite">
      <Tabs defaultValue="qr">
        <TabsList>
          <TabsTrigger value="qr">{t("QR code")}</TabsTrigger>
          <TabsTrigger value="numero">{t("Por número")}</TabsTrigger>
          <TabsTrigger value="passkey">{t("Passkey")}</TabsTrigger>
        </TabsList>
        <TabsContent value="qr" className="pt-4">
          <ConexaoNativaQr corpo={corpo} falha={falha} onTentarAgora={tentarAgora} />
        </TabsContent>
        <TabsContent value="numero" className="pt-4">
          <ConexaoNativaNumero canalId={canalId} />
        </TabsContent>
        <TabsContent value="passkey" className="pt-4">
          <ConexaoNativaPasskey canalId={canalId} corpo={corpo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Passo 3: a conexão do método escolhido. QR conecta sozinho (o poll avança ao passo 4); os
 * outros métodos reaproveitam a tela que já existia e avisam `onConectado` ao gravar, e quem
 * conclui é a pessoa (os cartões de webhook dessas telas precisam ser lidos antes).
 *
 * Ponto de extensão da fatia 3: o popup da Meta entra aqui, como primeira opção do ramo `oficial`.
 */
export function PassoConexao({
  metodo,
  canalId,
  graphParceiro,
  parceiro,
  onParceiro,
  onConectado,
}: {
  metodo: Metodo;
  canalId: string | null;
  graphParceiro: string | null;
  parceiro: Parceiro | null;
  onParceiro: (p: Parceiro) => void;
  onConectado: (telefone: string | null) => void;
}) {
  const t = useT();
  if (metodo === "qr") return canalId ? <PassoQr canalId={canalId} onConectado={onConectado} /> : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{t("O nome do passo 1 vale só para o QR Code. Neste método o canal recebe o nome do próprio número, e você pode renomear depois.")}</p>
      <PassoOutros metodo={metodo} graphParceiro={graphParceiro} parceiro={parceiro} onParceiro={onParceiro} onConectado={onConectado} />
    </div>
  );
}

function PassoOutros({
  metodo,
  graphParceiro,
  parceiro,
  onParceiro,
  onConectado,
}: Pick<Parameters<typeof PassoConexao>[0], "metodo" | "graphParceiro" | "parceiro" | "onParceiro" | "onConectado">) {
  const t = useT();
  if (metodo === "codigo") return <CanalHospedadoClient compacto onConectado={onConectado} />;
  if (metodo === "oficial") return <CanalOficialClient onConectado={onConectado} />;
  const escolha = graphParceiro ? parceiro : "padrao";
  if (!escolha) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-text">{t("Qual provedor?")}</p>
        <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => onParceiro("padrao")}>
          {t("Provedor parceiro")}
        </Button>
        <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => onParceiro("graph")}>
          {graphParceiro}
        </Button>
      </div>
    );
  }
  return escolha === "graph" ? <CanalGraphParceiroClient onConectado={onConectado} /> : <CanalParceiroClient onConectado={onConectado} />;
}
