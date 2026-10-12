"use client";
import { CartaoEmpilhado } from "@/components/pagina";
import { formatUltimaAtividade } from "@/components/contacts/ContactsTable";
import { Badge } from "@/components/ui/badge";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { Contact } from "@/lib/types/contacts";

/**
 * O contato na lista do celular (tratamento "Empilhada"): nome, telefone, e-mail,
 * etiquetas e última atividade. Abrir a conversa e excluir ficam na ficha, um toque
 * adiante, como no protótipo.
 */
export function CartaoDoContato({ contato }: { contato: Contact }) {
  const t = useT();
  const locale = useLocaleDeData();
  const selo = contato.is_anonymized ? (
    <Badge variant="destructive">{t("Anonimizado")}</Badge>
  ) : contato.is_blocked ? (
    <Badge variant="warning">{t("Bloqueado")}</Badge>
  ) : null;
  return (
    <CartaoEmpilhado
      href={`/app/contacts/${contato.id}`}
      titulo={rotuloDoContato(contato, t)}
      apoio={contato.phone_number ? phoneForDisplay(contato.phone_number) : undefined}
      selo={selo}
      campos={[
        { rotulo: t("Email"), valor: contato.email ?? "—" },
        { rotulo: t("Tags"), valor: contato.tags.length > 0 ? contato.tags.join(", ") : "—" },
        {
          rotulo: t("Última atividade"),
          valor: contato.last_activity_at ? formatUltimaAtividade(contato.last_activity_at, locale) : "—",
        },
      ]}
    />
  );
}
