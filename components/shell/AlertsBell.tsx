"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { destinosDaInterface } from "@/lib/navigation/interface";

import { useAgentInbox } from "@/hooks/ai/useAgentInbox";
import { useSonsDaCentral } from "@/hooks/notifications/useSonsDaCentral";
import { useT } from "@/hooks/i18n/useT";
import { Bell } from "@/lib/ui/icons";
import { roleAtLeast } from "@/lib/auth/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { CentralDeAvisos } from "./CentralDeAvisos";

/**
 * Sino da central de avisos (Operação Visível F1): contador de avisos abertos
 * do runtime do agente no header; o clique abre a central num popover
 * (`CentralDeAvisos`), com a página `/app/ai/inbox` no rodapé.
 */
export function AlertsBell() {
  const { user, activeOrg } = useAuth();
  if (
    !destinosDaInterface(
      activeOrg?.interface_settings,
      user.is_platform_admin && !user.support,
      activeOrg?.role ?? null,
    ).some((d) => d.href === "/app/ai/inbox")
  )
    return null;
  return <VisibleAlertsBell />;
}
function VisibleAlertsBell() {
  const t = useT();
  const { activeOrg } = useAuth();
  const [aberto, setAberto] = useState(false);
  const { data } = useAgentInbox("open");
  // O som da organização para a etapa que avisa e o pedido de pessoa.
  useSonsDaCentral(data?.items);
  const count = data?.open_count ?? 0;
  // A mesma régua da página `/app/ai/inbox`: resolve quem é `agent` ou acima.
  const podeResolver = roleAtLeast(activeOrg?.role ?? null, "agent");

  // Popover em vez de link (T13-T20): a central abre por cima da tela em que a
  // pessoa está, e a página inteira continua no rodapé ("Abrir a central
  // completa").
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            count > 0
              ? `${t("Central de avisos")} — ${count} ${t("em aberto")}`
              : t("Central de avisos")
          }
          aria-haspopup="dialog"
          data-testid="alerts-bell"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-accent-soft data-[state=open]:text-foreground lg:h-9 lg:w-9"
        >
          <Bell size={18} aria-hidden />
          {count > 0 ? (
            <span
              data-testid="alerts-bell-count"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-destructive-foreground"
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[396px] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl p-0 shadow-lg"
      >
        <CentralDeAvisos podeResolver={podeResolver} onFechar={() => setAberto(false)} />
      </PopoverContent>
    </Popover>
  );
}
