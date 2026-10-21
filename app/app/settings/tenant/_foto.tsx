"use client";
/**
 * A FOTO da empresa, na tela Organização (admin da empresa).
 *
 * É a imagem que entra no lugar da sigla no trilho, no seletor de organização e
 * no celular. Não é a marca white-label (`/app/settings/marca`, só do admin da
 * plataforma): esta é da empresa do cliente, e só da organização ativa.
 */
import { CampoDeFoto } from "@/components/fotos/CampoDeFoto";
import { siglaDaOrganizacao } from "@/components/shell/TenantSwitcher";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";

export function FotoDaOrganizacao({ urlInicial, nome }: { urlInicial: string | null; nome: string }) {
  const t = useT();
  return (
    <Card className="max-w-xl p-6">
      <CampoDeFoto
        id="foto-da-organizacao"
        rotulo={t("Foto da organização")}
        rota="/api/v1/organizacao/foto"
        campoDaResposta="foto_url"
        urlInicial={urlInicial}
        substituto={siglaDaOrganizacao(nome)}
        forma="quadrado"
        ajuda={t("Aparece no lugar da sigla da empresa no menu e no seletor de organização. PNG, JPG ou WebP, até 1 MB.")}
      />
    </Card>
  );
}
