"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { InstagramLogo, Phone, WhatsappLogo } from "@/lib/ui/icons";

type Opcao = { chave: string; titulo: string; ajuda: string; ir: () => void };

/**
 * "Conectar": o que a pessoa quer ligar. Nesta fatia cada caminho leva à criação que já
 * existia (assistente de QR, código, credenciais da Meta, telas de voz e telefone).
 */
export function EscolhaDeFluxo({
  nativoHabilitado,
  parceiroGraph,
  onAssistenteQr,
  onFechar,
}: {
  nativoHabilitado: boolean;
  /** Rótulo do parceiro compatível com a Cloud API, quando a instalação o liga. */
  parceiroGraph: string | null;
  onAssistenteQr: () => void;
  onFechar: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [passo, setPasso] = useState<"tipo" | "whatsapp">("tipo");
  const ir = (aba: string) => {
    onFechar();
    router.push(`/app/connections?aba=${aba}`);
  };
  const whatsapp: Opcao[] = [
    ...(nativoHabilitado
      ? [{ chave: "qr", titulo: t("QR code, número ou passkey"), ajuda: t("Assistente em 4 passos: você dá um nome e conecta pelo celular."), ir: () => { onFechar(); onAssistenteQr(); } }]
      : []),
    { chave: "oficial", titulo: t("API Oficial (Meta)"), ajuda: t("Número oficial, com modelos de mensagem."), ir: () => ir("oficial") },
    { chave: "codigo", titulo: t("Código da Verdash"), ajuda: t("Usa o WhatsApp que já está na Verdash, sem ler QR."), ir: () => ir("hospedado") },
    { chave: "parceiro", titulo: t("Provedor parceiro"), ajuda: t("Número ligado por um provedor parceiro."), ir: () => ir("parceiro") },
    ...(parceiroGraph ? [{ chave: "graph", titulo: parceiroGraph, ajuda: t("Parceiro compatível com a API oficial."), ir: () => ir("graph") }] : []),
  ];
  const tipos = [
    { chave: "whatsapp", titulo: "WhatsApp", ajuda: t("Número de WhatsApp para atender clientes."), Icone: WhatsappLogo, ir: () => setPasso("whatsapp") },
    { chave: "instagram", titulo: "Instagram", ajuda: t("Direct do Instagram na aba Conversas."), Icone: InstagramLogo, ir: () => ir("instagram") },
    { chave: "ligacao", titulo: t("Ligação"), ajuda: t("Chamada de voz e linha de telefone."), Icone: Phone, ir: () => ir("voz") },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{passo === "tipo" ? t("O que você quer conectar?") : t("Como conectar o WhatsApp?")}</DialogTitle>
          <DialogDescription>
            {passo === "tipo" ? t("Escolha o tipo de canal.") : t("Escolha o método.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {passo === "tipo"
            ? tipos.map(({ chave, titulo, ajuda, Icone, ir: vai }) => (
                <Button key={chave} variant="outline" className="h-auto justify-start gap-3 py-3 text-left" onClick={vai}>
                  <Icone size={20} aria-hidden />
                  <span className="flex flex-col"><b>{titulo}</b><small className="font-normal text-muted-foreground">{ajuda}</small></span>
                </Button>
              ))
            : whatsapp.map((o) => (
                <Button key={o.chave} variant="outline" className="h-auto justify-start py-3 text-left" onClick={o.ir}>
                  <span className="flex flex-col"><b>{o.titulo}</b><small className="font-normal text-muted-foreground">{o.ajuda}</small></span>
                </Button>
              ))}
          {passo === "whatsapp" && (
            <Button variant="ghost" size="sm" onClick={() => setPasso("tipo")}>{t("Voltar")}</Button>
          )}
          {passo === "tipo" && (
            <Button variant="link" size="sm" onClick={() => ir("telefonia")}>{t("Cadastrar número de telefone (DID)")}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
