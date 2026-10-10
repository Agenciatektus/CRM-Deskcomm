"use client";
import { usePathname, useSearchParams } from "next/navigation";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useMinhaDisponibilidade, useUpdateAvailability } from "@/hooks/team/useAttendants";
import { roleAtLeast } from "@/lib/auth/types";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { useTheme } from "@/lib/theme";
import { pedir } from "@/lib/ui/comandos-da-tela";

export interface AcaoDaPaleta {
  id: string;
  titulo: string;
  sub: string;
  executar: () => void;
}

/**
 * As AÇÕES da busca, na ordem do protótipo. Cada uma só aparece quando pode
 * acontecer de verdade:
 *
 *  - "Criar próximo passo": só com uma conversa aberta na Inbox (`?id=`).
 *  - Tema: sempre.
 *  - Disponibilidade: só para quem atende (a mesma régua do botão do topo) e
 *    depois de ler o estado atual: oferecer "Ficar ausente" sem saber se a
 *    pessoa está disponível seria afirmar um estado que ninguém leu.
 *  - "Ver avisos em aberto": só para quem enxerga a central (a mesma régua do
 *    sino).
 *
 * "Só conversas sem próximo passo" (do protótipo) NÃO entra: a Inbox não tem
 * esse filtro hoje.
 */
export function useAcoesDaPaleta(): AcaoDaPaleta[] {
  const t = useT();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const { user, activeOrg } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const podeAtender =
    roleAtLeast(activeOrg?.role, "agent") && user.support?.access_mode !== "support_readonly";
  const minha = useMinhaDisponibilidade(podeAtender);
  const atualizar = useUpdateAvailability(t("Disponibilidade atualizada."));
  const veAvisos = destinosDaInterface(
    activeOrg?.interface_settings,
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
  ).some((d) => d.href === "/app/ai/inbox");

  const acoes: AcaoDaPaleta[] = [];
  if (pathname?.startsWith("/app/inbox") && parametros?.get("id")) {
    acoes.push({
      id: "proximo-passo",
      titulo: t("Criar próximo passo"),
      sub: t("Para a conversa aberta"),
      executar: () => pedir("proximo-passo"),
    });
  }
  const escuro = resolvedTheme === "dark";
  acoes.push({
    id: "tema",
    titulo: escuro ? t("Usar tema claro") : t("Usar tema escuro"),
    sub: t("Aparência"),
    executar: () => setTheme(escuro ? "light" : "dark"),
  });
  if (podeAtender && minha.isSuccess) {
    const disponivel = minha.data?.data?.is_available ?? false;
    acoes.push({
      id: "disponibilidade",
      titulo: disponivel ? t("Ficar ausente") : t("Ficar disponível"),
      sub: t("Sua disponibilidade na fila"),
      executar: () => atualizar.mutate({ userId: user.id, patch: { is_available: !disponivel } }),
    });
  }
  if (veAvisos) {
    acoes.push({
      id: "avisos",
      titulo: t("Ver avisos em aberto"),
      sub: t("Central de avisos"),
      executar: () => pedir("abrir-avisos"),
    });
  }
  return acoes;
}
