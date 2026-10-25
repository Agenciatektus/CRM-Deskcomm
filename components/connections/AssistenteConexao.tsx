"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";

import { Etapas, PassoComo, PassoNome, PassoSucesso, type Passo, type Uso } from "./AssistentePassos";
import { ConexaoNativaNumero } from "./ConexaoNativaNumero";
import { ConexaoNativaPasskey } from "./ConexaoNativaPasskey";
import { ConexaoNativaQr } from "./ConexaoNativaQr";
import { useConexaoNativa } from "./useConexaoNativa";

/** Passo 3: o mesmo poll alimenta as tres abas; o hook para sozinho ao conectar. */
function PassoConectar({
  canalId,
  onConectado,
  onVoltar,
  onDepois,
}: {
  canalId: string;
  onConectado: (telefone: string | null) => void;
  onVoltar: () => void;
  onDepois: () => void;
}) {
  const t = useT();
  const { corpo, falha, tentarAgora } = useConexaoNativa(canalId, (c) => onConectado(c.telefone ?? null));
  return (
    <div className="mt-6 flex flex-col gap-4">
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
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onVoltar}>
          {t("Voltar")}
        </Button>
        <Button variant="link" onClick={onDepois}>
          {t("Conectar depois")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Assistente de conexao de WhatsApp em 4 passos (nome, como conectar, conectar,
 * sucesso). A conexao e CRIADA ao sair do passo 2 (POST hosted, modo qr). A chave
 * de idempotencia vive ate a criacao dar certo e muda se o nome mudar: repetir o
 * clique ou a rede cair devolve o MESMO canal em vez de criar outro.
 */
export function AssistenteConexao({
  onClose,
  onAtualizar,
  onConfigurarAgente,
}: {
  onClose: () => void;
  onAtualizar: () => void;
  onConfigurarAgente?: (canalId: string) => void;
}) {
  const t = useT();
  const [passo, setPasso] = useState<Passo>(1);
  const [nome, setNome] = useState("");
  const [uso, setUso] = useState<Uso | null>(null);
  const [criando, setCriando] = useState(false);
  const [canalId, setCanalId] = useState<string | null>(null);
  const [telefone, setTelefone] = useState<string | null>(null);
  const chave = useRef<{ nome: string; id: string } | null>(null);

  const criar = async () => {
    if (canalId) return setPasso(3);
    setCriando(true);
    const rotulo = nome.trim();
    if (chave.current?.nome !== rotulo) chave.current = { nome: rotulo, id: randomId() };
    try {
      const r = await apiClient.post<{ data: { channel_session_id: string; recebimento_ligado: boolean } }>(
        "/api/v1/channels/hosted",
        { modo: "qr", rotulo },
        { idempotencyKey: chave.current.id, timeoutMs: 120_000 },
      );
      chave.current = null;
      setCanalId(r.data.channel_session_id);
      if (!r.data.recebimento_ligado) toast.warning(t("Conexão criada, mas o recebimento não foi ligado."));
      onAtualizar();
      setPasso(3);
    } catch (e) {
      toast.error(e instanceof Error ? t(e.message) : t("Não foi possível criar a conexão."));
    } finally {
      setCriando(false);
    }
  };

  const fechar = () => {
    onAtualizar();
    onClose();
  };
  const descricao: Record<Passo, string> = {
    1: t("Comece dando um nome para esta conexão."),
    2: t("Conte como você usa este WhatsApp para escolhermos a conexão certa."),
    3: t("Conclua a conexão. A tela atualiza sozinha."),
    4: t("Pronto! WhatsApp conectado ao CRM."),
  };

  return (
    <Sheet open onOpenChange={(o) => !o && fechar()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("Conectar WhatsApp")}</SheetTitle>
          <SheetDescription>{descricao[passo]}</SheetDescription>
        </SheetHeader>
        <Etapas passo={passo} />
        {passo === 1 && <PassoNome nome={nome} travado={!!canalId} onNome={setNome} onContinuar={() => setPasso(2)} />}
        {passo === 2 && (
          <PassoComo uso={uso} criando={criando} onUso={setUso} onVoltar={() => setPasso(1)} onContinuar={() => void criar()} />
        )}
        {passo === 3 && canalId && (
          <PassoConectar
            canalId={canalId}
            onConectado={(tel) => {
              setTelefone(tel);
              setPasso(4);
              onAtualizar();
            }}
            onVoltar={() => setPasso(2)}
            onDepois={fechar}
          />
        )}
        {passo === 4 && (
          <PassoSucesso
            telefone={telefone}
            onAgente={() => {
              fechar();
              if (canalId) onConfigurarAgente?.(canalId);
            }}
            onConcluir={fechar}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
