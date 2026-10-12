"use client";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { opcoesDeCriar, opcoesPermitidas, type OpcaoDeCriar } from "@/lib/mobile/abas";
import { searchable } from "@/lib/navigation/registry";

/**
 * As opções da folha "Criar" nesta tela, só as que o vínculo enxerga no menu (papel,
 * interface, módulos e capacidades: a mesma regra da busca geral). P2 do Cassio na #177.
 */
export function useOpcoesDeCriar(): OpcaoDeCriar[] {
  const rota = usePathname() ?? "";
  const { user, activeOrg } = useAuth();
  const visiveis = useMemo(
    () =>
      new Set(
        searchable(
          user.is_platform_admin && !user.support,
          activeOrg?.role ?? null,
          activeOrg?.interface_settings,
          activeOrg?.modulos_ligados ?? [],
          activeOrg?.capacidades_ligadas ?? [],
        ).map((d) => d.href),
      ),
    [user.is_platform_admin, user.support, activeOrg?.role, activeOrg?.interface_settings, activeOrg?.modulos_ligados, activeOrg?.capacidades_ligadas],
  );
  return opcoesPermitidas(opcoesDeCriar(rota), visiveis);
}
