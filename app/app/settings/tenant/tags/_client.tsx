"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { Info } from "@/lib/ui/icons";
import type { InventarioDeTags } from "@/lib/schemas/tags";
import { VocabularioSection } from "./_vocabulario";

/**
 * DOIS VOCABULÁRIOS, LADO A LADO E NÃO FUNDIDOS.
 *
 * `conversations.tags` marca o ATENDIMENTO (dúvida, troca, urgente) e
 * `contacts.tags` marca a PESSOA (vip, inadimplente). São listas distintas no
 * banco, editadas por dois componentes distintos do Inbox, e o comentário de
 * `ContactTagsEditor.tsx` já avisava disso.
 *
 * Abas, e não duas seções empilhadas: empilhadas, a segunda lista parece
 * continuação da primeira, e "urgente" aparecendo só na de cima leria como bug.
 * A aba torna a separação uma afirmação, não um acidente de rolagem.
 */
export function TagsClient({
  inventario,
  podeCurar,
}: {
  inventario: InventarioDeTags;
  /** admin+: renomear, mesclar e apagar. Falso esconde o que a action recusaria. */
  podeCurar: boolean;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      {!podeCurar && (
        <Card className="flex items-start gap-2 p-4 text-xs leading-relaxed text-muted-foreground">
          <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
          {t(
            "Você pode acrescentar etiquetas e tirá-las de circulação. Renomear, juntar e apagar mexem no histórico de conversas e contatos, e são de administrador.",
          )}
        </Card>
      )}

      <Card className="p-6">
        <Tabs defaultValue="conversa">
          <TabsList>
            <TabsTrigger value="conversa">{t("Conversas")}</TabsTrigger>
            <TabsTrigger value="contato">{t("Contatos")}</TabsTrigger>
          </TabsList>

          <TabsContent value="conversa" className="mt-5">
            <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
              {t(
                "Marcam o atendimento: do que a pessoa falou, como terminou. Aparecem no painel da conversa e no filtro da caixa de entrada.",
              )}
            </p>
            <VocabularioSection
              escopo="conversa"
              vocabulario={inventario.conversa}
              podeCurar={podeCurar}
              clienteReservada={false}
              substantivo={(n) => `${n} ${n === 1 ? t("conversa") : t("conversas")}`}
            />
          </TabsContent>

          <TabsContent value="contato" className="mt-5">
            <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
              {t(
                "Marcam a pessoa, e valem para todas as conversas dela. Aparecem na ficha do contato e na lista de contatos.",
              )}
            </p>
            <VocabularioSection
              escopo="contato"
              vocabulario={inventario.contato}
              podeCurar={podeCurar}
              clienteReservada={inventario.cliente_pela_agenda}
              substantivo={(n) => `${n} ${n === 1 ? t("contato") : t("contatos")}`}
            />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
