"use client";

import { ListaDaOrigem, useOrigemDoContato } from "@/components/contacts/OrigemDoContato";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/hooks/i18n/useT";

import { SecaoRecolhivel } from "./SecaoRecolhivel";

/**
 * De qual anúncio a pessoa veio, na coluna de detalhes do Inbox (aba Resumo).
 *
 * É onde quem atende está olhando: o dado vinha só do dossiê do funil e da ficha
 * do contato. Mesma leitura e mesma grade das duas (`OrigemDoContato`). Seção
 * recolhível, aberta por padrão, com a campanha no cabeçalho quando fechada. Some
 * (com o separador) quando o contato não tem origem a mostrar.
 */
export function OrigemNoPainel({ contactId }: { contactId: string | null }) {
  const t = useT();
  const dados = useOrigemDoContato(contactId);
  if (!dados) return null;

  return (
    <>
      <SecaoRecolhivel testId="painel-origem" titulo={t("Origem")} resumo={dados.resumo}>
        <ListaDaOrigem dados={dados} />
      </SecaoRecolhivel>
      <Separator />
    </>
  );
}
