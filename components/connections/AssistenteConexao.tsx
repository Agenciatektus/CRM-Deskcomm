"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { randomId } from "@/lib/random-id";
import { ArrowRight, CircleNotch } from "@/lib/ui/icons";

import { PassoConexao, type Parceiro } from "./AssistentePasso3";
import { PassoMetodo, recomendar, type Metodo, type Uso } from "./AssistenteMetodo";
import { Etapas, PassoNome, PassoSucesso, type Passo } from "./AssistentePassos";

/** Aba de Conexoes que mostra o canal (e o agente de IA dele) de cada metodo. */
const ABA: Record<Metodo, string> = { qr: "hospedado", codigo: "hospedado", oficial: "oficial", parceiro: "parceiro" };

/**
 * Assistente unico de conexao de WhatsApp (nome, metodo, conexao, pronto), numa gaveta
 * lateral. So o metodo QR cria o canal ao sair do passo 2 (POST hosted, modo qr); nos
 * demais ele nasce ao concluir a conexao, no passo 3. A chave de idempotencia vive ate a
 * criacao dar certo e muda se o nome mudar: repetir o clique ou a rede cair devolve o
 * MESMO canal em vez de criar outro.
 */
export function AssistenteConexao({
  onClose,
  onAtualizar,
  onConfigurarAgente,
  canalIdInicial,
  nomeInicial,
  nativoHabilitado = true,
  graphParceiro = null,
  devolverFoco,
}: {
  onClose: () => void;
  onAtualizar: () => void;
  /** Leva ao agente de IA do canal: `canalId` so existe no QR; os outros vao pela `aba`. */
  onConfigurarAgente?: (canalId: string | null, aba: string) => void;
  /** Canal nativo que ficou pela metade: abre direto no passo 3, sem criar outro. */
  canalIdInicial?: string;
  /** Nome atual do canal retomado, para o passo 1 (travado) não aparecer vazio. */
  nomeInicial?: string;
  /** A organização cria conexão por QR neste CRM; sem isso o cartão QR não aparece. */
  nativoHabilitado?: boolean;
  /** Rótulo do parceiro compatível com a Cloud API, quando a instalação o liga. */
  graphParceiro?: string | null;
  /** Devolve o foco ao botão que abriu a gaveta (Radix não sabe quem foi, não há Trigger). */
  devolverFoco?: () => void;
}) {
  const t = useT();
  const [passo, setPasso] = useState<Passo>(canalIdInicial ? 3 : 1);
  const [nome, setNome] = useState(nomeInicial ?? "");
  const [uso, setUso] = useState<Uso | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(canalIdInicial || nativoHabilitado ? "qr" : null);
  const [parceiro, setParceiro] = useState<Parceiro | null>(null);
  const [criando, setCriando] = useState(false);
  const [canalId, setCanalId] = useState<string | null>(canalIdInicial ?? null);
  const [telefone, setTelefone] = useState<string | null>(null);
  // Metodos que nao avancam sozinhos: a tela de credenciais gravou, falta a pessoa concluir.
  const [gravou, setGravou] = useState(false);
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
  const escolherUso = (u: Uso) => {
    setUso(u);
    // A resposta já aponta o método; a pessoa pode trocar no cartão.
    const r = recomendar(u, nativoHabilitado);
    if (r && !canalId) setMetodo(r);
  };
  const aba = metodo === "parceiro" && parceiro === "graph" ? "graph" : metodo ? ABA[metodo] : "hospedado";
  const descricao: Record<Passo, string> = {
    1: t("Comece dando um nome para esta conexão."),
    2: t("Conte como você usa este WhatsApp para escolhermos a conexão certa."),
    3: t("Conclua a conexão. A tela atualiza sozinha."),
    4: t("Pronto! WhatsApp conectado ao CRM."),
  };
  const continuar = () => {
    if (passo === 1) setPasso(2);
    else if (passo === 2) void (metodo === "qr" ? criar() : setPasso(3));
    else setPasso(4);
  };
  const podeContinuar = passo === 1 ? !!nome.trim() : passo === 2 ? !!metodo && !criando : gravou;
  const mostraContinuar = passo < 3 || (passo === 3 && metodo !== "qr");

  return (
    <Sheet open onOpenChange={(o) => !o && fechar()}>
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-[520px]"
        onCloseAutoFocus={(e) => {
          if (!devolverFoco) return;
          e.preventDefault();
          devolverFoco();
        }}
      >
        <SheetHeader>
          <SheetTitle>{t("Conectar WhatsApp")}</SheetTitle>
          <SheetDescription>{descricao[passo]}</SheetDescription>
        </SheetHeader>
        <Etapas passo={passo} />
        <div className="mt-6 flex-1 overflow-y-auto pb-4">
          {passo === 1 && <PassoNome nome={nome} travado={!!canalId} onNome={setNome} onContinuar={continuar} />}
          {passo === 2 &&
            (criando ? (
              <div role="status" className="flex flex-col items-center gap-3 py-10">
                <CircleNotch size={28} className="animate-spin text-accent-text" aria-hidden />
                <p className="text-sm text-text-muted">{t("Preparando sua conexão…")}</p>
              </div>
            ) : (
              <PassoMetodo uso={uso} metodo={metodo} nativo={nativoHabilitado} onUso={escolherUso} onMetodo={(m) => {
                setMetodo(m);
                setGravou(false);
              }} />
            ))}
          {passo === 3 && metodo && (
            <PassoConexao
              metodo={metodo}
              canalId={canalId}
              graphParceiro={graphParceiro}
              parceiro={parceiro}
              onParceiro={setParceiro}
              onConectado={(tel) => {
                setTelefone(tel);
                onAtualizar();
                if (metodo === "qr") setPasso(4);
                else setGravou(true);
              }}
            />
          )}
          {passo === 4 && (
            <PassoSucesso
              telefone={telefone}
              onAgente={() => {
                fechar();
                onConfigurarAgente?.(metodo === "qr" ? canalId : null, aba);
              }}
              onConcluir={fechar}
            />
          )}
        </div>
        {passo < 4 && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            {passo > 1 ? (
              <Button variant="ghost" onClick={() => setPasso((p) => (p - 1) as Passo)}>
                {t("Voltar")}
              </Button>
            ) : (
              <span />
            )}
            {passo > 1 && (
              <Button variant="link" onClick={fechar}>
                {t("Continuar depois")}
              </Button>
            )}
            {mostraContinuar ? (
              <Button onClick={continuar} disabled={!podeContinuar}>
                {passo === 3 ? t("Concluir") : t("Continuar")} <ArrowRight size={16} aria-hidden />
              </Button>
            ) : (
              <span />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
