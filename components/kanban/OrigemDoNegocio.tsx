"use client";

import { ListaDaOrigem, useOrigemDoContato } from "@/components/contacts/OrigemDoContato";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  contactId: string | null;
}

/**
 * DE ONDE O CLIENTE VEIO, dentro do dossiê do negócio.
 *
 * Antes esta resposta só existia na ficha do contato (`/app/contacts/[id]`), e
 * quem trabalha pelo funil nunca chega lá. A leitura e a grade são as mesmas da
 * coluna de detalhes do Inbox (`components/contacts/OrigemDoContato.tsx`).
 *
 * Some inteira quando o contato não tem origem a mostrar.
 */
export function OrigemDoNegocio({ contactId }: Props) {
  const t = useT();
  const dados = useOrigemDoContato(contactId);
  if (!dados) return null;

  return (
    <section className="border-b border-border py-3" data-testid="origem-do-negocio">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("Origem")}
      </h3>
      <ListaDaOrigem dados={dados} />
    </section>
  );
}
