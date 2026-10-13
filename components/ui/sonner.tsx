"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * O "Aviso com Desfazer" do quadro DS, INVERTIDO por tema: no claro, cartão na
 * cor do texto (escuro) com letra clara; no escuro, cartão quase branco com
 * letra escura. É o mesmo par de tokens (`bg-text text-surface`), que cada tema
 * inverte sozinho. A ação (Desfazer) vem em 700: no claro a marca clareada
 * (`color-mix(accent 45%, branco)`); no escuro o azul do primary Verdash na
 * parada 700 (o `.app.dark .toast button` do Main usa o accent, 3,5:1 sobre o
 * cartão claro; a 700 dá 5,4:1 e passa AA). Embaixo, no centro, 5 segundos.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Embaixo, acima do indicador de início do iPhone no app instalado. Os números
      // são os padrões do sonner (24px; 16px no celular); no desktop o `env()` vale 0.
      offset={{ bottom: "calc(24px + var(--mb-area-baixo, 0px))" }}
      // No celular, acima da barra inferior quando ela está na tela (`--mb-casca-baixo`).
      mobileOffset={{ bottom: "calc(16px + var(--mb-casca-baixo, 0px))" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast !gap-3.5 !rounded-lg !border-0 !bg-text !py-2.5 !pl-4 !pr-2.5 !text-ui !text-surface !shadow-pop",
          description: "!text-surface/80",
          actionButton:
            "!h-auto !bg-transparent !px-2 !py-1 !text-ui !font-bold !text-[color-mix(in_oklch,var(--color-accent)_45%,white)] dark:!text-accent-700 hover:!bg-[oklch(0.5_0_0/0.18)]",
          cancelButton: "!bg-transparent !text-surface/80",
          closeButton: "!border-0 !bg-text !text-surface",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
