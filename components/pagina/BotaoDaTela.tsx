"use client";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";

import { Plus } from "@/lib/ui/icons";

/**
 * O botão flutuante da tela no celular (o `.fab` do protótipo, as mesmas medidas do
 * `BotaoCriar` da casca): a ação principal da página, quando a casca não oferece a
 * folha "Criar" para a rota. Só existe abaixo de 760px (`hidden mb:grid`); no desktop
 * a ação fica no cabeçalho da página.
 */
export function BotaoDaTela({
  rotulo,
  aoTocar,
  icone: Icone = Plus,
}: {
  rotulo: string;
  aoTocar: () => void;
  icone?: ComponentType<{ size?: number; weight?: "bold"; "aria-hidden"?: boolean }>;
}) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      aria-label={rotulo}
      className="pele-foco pele-grad-contador fixed right-(--mb-fab-margem) bottom-[calc(var(--mb-fab-acima)+var(--mb-area-baixo))] z-30 hidden size-(--mb-fab) place-items-center rounded-(--mb-fab-raio) bg-accent text-accent-foreground shadow-pop mb:grid"
    >
      <Icone size={26} weight="bold" aria-hidden />
    </button>
  );
}

/** O `BotaoDaTela` que leva a uma rota (a tela de criar), com navegação do app. */
export function BotaoDaTelaParaRota({ rotulo, href }: { rotulo: string; href: string }) {
  const router = useRouter();
  return <BotaoDaTela rotulo={rotulo} aoTocar={() => router.push(href)} />;
}
