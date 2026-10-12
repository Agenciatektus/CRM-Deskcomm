"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { acaoDeCriar } from "@/lib/mobile/abas";
import { usePodeCriar } from "@/lib/mobile/usePodeCriar";
import { Plus } from "@/lib/ui/icons";

/**
 * O botão flutuante "+" (o `.fab` do protótipo): 60px, raio 20, acima da barra
 * inferior e da área segura. Aparece só nas telas que têm o que criar. Até a folha
 * "Criar" (M1.4), abre a ação principal da tela (`acaoDeCriar`). Quem não pode criar
 * (viewer, suporte somente leitura) não vê o botão (`usePodeCriar`).
 */
export function BotaoCriar() {
  const t = useT();
  const acao = acaoDeCriar(usePathname() ?? "");
  const podeCriar = usePodeCriar();
  if (!acao || !podeCriar) return null;
  return (
    <Link
      href={acao.href}
      aria-label={`${t("Criar")}: ${t(acao.rotulo)}`}
      className="pele-foco pele-grad-contador fixed right-(--mb-fab-margem) bottom-[calc(var(--mb-fab-acima)+var(--mb-area-baixo))] z-30 hidden size-(--mb-fab) place-items-center rounded-(--mb-fab-raio) bg-accent text-accent-foreground shadow-pop mb:grid"
    >
      <Plus size={26} weight="bold" aria-hidden />
    </Link>
  );
}
