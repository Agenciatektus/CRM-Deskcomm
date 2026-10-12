"use client";
import { BotaoDeDisponibilidade } from "@/components/shell/BotaoDeDisponibilidade";
import { SidebarContent } from "@/components/shell/Sidebar";
import { TenantSwitcher } from "@/components/shell/TenantSwitcher";
import { UserMenu } from "@/components/shell/UserMenu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/hooks/i18n/useT";
import type { FunilDoMenu } from "@/lib/navigation/funis-no-menu";

/**
 * A aba "Mais" (tela 9 do protótipo): o menu inteiro do CRM (o mesmo `SidebarContent`
 * da gaveta que saiu, com o filtro de papel e de módulo dele), com organização,
 * Disponível e o menu do usuário (perfil, tema, sair) no topo. Folha de tela cheia,
 * de baixo para cima. Canais (tela 10) é Conexões, no molde de página.
 */
export function MenuMais({
  aberto,
  aoMudar,
  funis,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  funis: readonly FunilDoMenu[];
}) {
  const t = useT();
  return (
    <Sheet open={aberto} onOpenChange={aoMudar}>
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] flex-col gap-0 p-0 pt-(--mb-area-topo) pb-(--mb-area-baixo)"
      >
        <SheetTitle className="sr-only">{t("Mais")}</SheetTitle>
        <div className="flex items-center gap-2 border-b border-border py-2 pr-12 pl-3">
          <TenantSwitcher />
          <div className="flex-1" />
          <BotaoDeDisponibilidade />
          <UserMenu />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarContent onNavigate={() => aoMudar(false)} funis={funis} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
