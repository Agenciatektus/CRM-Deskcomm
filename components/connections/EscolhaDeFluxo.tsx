"use client";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { InstagramLogo, Phone, WhatsappLogo } from "@/lib/ui/icons";

/**
 * "Conectar": o que a pessoa quer ligar. WhatsApp abre o assistente unico (nome, método,
 * conexão); Instagram, voz e telefone levam à tela que já existia.
 */
export function EscolhaDeFluxo({ onWhatsapp, onFechar }: { onWhatsapp: () => void; onFechar: () => void }) {
  const t = useT();
  const router = useRouter();
  const ir = (aba: string) => {
    onFechar();
    router.push(`/app/connections?aba=${aba}`);
  };
  const tipos = [
    {
      chave: "whatsapp",
      titulo: "WhatsApp",
      ajuda: t("Número de WhatsApp para atender clientes."),
      Icone: WhatsappLogo,
      ir: () => {
        onFechar();
        onWhatsapp();
      },
    },
    { chave: "instagram", titulo: "Instagram", ajuda: t("Direct do Instagram na aba Conversas."), Icone: InstagramLogo, ir: () => ir("instagram") },
    { chave: "ligacao", titulo: t("Ligação"), ajuda: t("Chamada de voz e linha de telefone."), Icone: Phone, ir: () => ir("voz") },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("O que você quer conectar?")}</DialogTitle>
          <DialogDescription>{t("Escolha o tipo de canal.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {tipos.map(({ chave, titulo, ajuda, Icone, ir: vai }) => (
            <Button key={chave} variant="outline" className="h-auto justify-start gap-3 py-3 text-left" onClick={vai}>
              <Icone size={20} aria-hidden />
              <span className="flex flex-col"><b>{titulo}</b><small className="font-normal text-muted-foreground">{ajuda}</small></span>
            </Button>
          ))}
          <Button variant="link" size="sm" onClick={() => ir("telefonia")}>{t("Cadastrar número de telefone (DID)")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
