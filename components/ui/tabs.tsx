"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Abas do quadro DS (DesignSystem.dc.html, "Navegação e campos"), em duas formas:
 *
 *  - `sublinhado` (padrão), o `.tabs`: fila com sublinhado de 2px na marca na
 *    aba ativa (no escuro, o degradê da logo);
 *  - `segmento`, o `.seg`: trilho surface-2 com borda e raio 10, e a opção ativa
 *    num cartão surface. É o controle segmentado (Fila, Minhas, Todas).
 */
export type VarianteDasAbas = "sublinhado" | "segmento"

/** O trilho do controle segmentado (`.seg`). */
export const CLASSES_DO_SEGMENTO =
  "pele-seg flex gap-0.5 rounded-field border border-border bg-surface-elevated p-0.75"

/** Uma opção do controle segmentado (`.seg button`); ativa por `data-state` ou `data-ativa`. */
export const CLASSES_DA_OPCAO_DO_SEGMENTO = cn(
  "pele-seg-item inline-flex h-7.5 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-2",
  "text-label font-semibold text-text-muted transition-colors duration-ui hover:text-text",
  "data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-[0_1px_2px_rgb(17_22_31/0.08),0_0_0_1px_var(--color-border)]",
  "data-[ativa=true]:bg-surface data-[ativa=true]:text-text data-[ativa=true]:shadow-[0_1px_2px_rgb(17_22_31/0.08),0_0_0_1px_var(--color-border)]",
)

const ContextoDaVariante = React.createContext<VarianteDasAbas>("sublinhado")

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variante?: VarianteDasAbas }
>(({ className, variante = "sublinhado", ...props }, ref) => (
  <ContextoDaVariante.Provider value={variante}>
    <TabsPrimitive.List
      ref={ref}
      data-variante={variante}
      className={cn(
        variante === "segmento"
          ? CLASSES_DO_SEGMENTO
          : // `max-w-full overflow-x-auto` porque uma fila de abas cresce com o
            // produto e nunca encolhe: no detalhe do agente são SEIS, e em 390px
            // de largura a fila mede 814px — a página inteira passava a rolar na
            // horizontal. Aqui e não na tela do agente de propósito: TODA
            // `TabsList` do app tem a mesma fragilidade.
            //
            // A linha de baixo é sombra interna, e não `border-b`, porque o
            // `overflow-x-auto` cortaria o traço da aba ativa.
            "inline-flex max-w-full items-center gap-0.5 overflow-x-auto text-text-subtle shadow-[inset_0_-1px_0_var(--color-border)]",
        className
      )}
      {...props}
    />
  </ContextoDaVariante.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variante = React.useContext(ContextoDaVariante)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none",
        variante === "segmento"
          ? cn(CLASSES_DA_OPCAO_DO_SEGMENTO, "flex-1")
          : cn(
              // `.tabs span` do quadro DS: 40px, padding 9, 13/600 em `ink-3`; a
              // ativa em `ink` com sublinhado de 2px na marca (no escuro, o
              // degradê da logo).
              "relative inline-flex h-10 items-center justify-center whitespace-nowrap px-2.25 text-label font-semibold text-text-subtle transition-colors duration-ui hover:text-text disabled:opacity-50 data-[state=active]:text-text",
              "after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent dark:data-[state=active]:after:bg-(image:--pele-grad)",
            ),
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
