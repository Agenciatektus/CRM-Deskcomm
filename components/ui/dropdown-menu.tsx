"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex h-8.5 cursor-default select-none items-center gap-2.5 whitespace-nowrap rounded-md px-2 text-[13.5px] outline-hidden focus:bg-hover data-[state=open]:bg-hover [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

/**
 * `folhaNoCelular` (aqui e no `DropdownMenuContent`): abaixo de 760px o menu vira
 * FOLHA INFERIOR (regra em globals.css, com as medidas do protótipo mobile). Acima,
 * o menu de sempre.
 */
type ComFolha = { folhaNoCelular?: boolean }

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & ComFolha
>(({ className, folhaNoCelular, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    data-folha-no-celular={folhaNoCelular ? "" : undefined}
    className={cn(
      "pele-ruido z-50 min-w-[8rem] overflow-hidden rounded-menu border border-border bg-surface p-1.5 text-text shadow-pop data-[state=open]:animate-pop-in origin-(--radix-dropdown-menu-content-transform-origin)",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & ComFolha
>(({ className, sideOffset = 4, folhaNoCelular, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      data-folha-no-celular={folhaNoCelular ? "" : undefined}
      sideOffset={sideOffset}
      className={cn(
        // `.ctxm` do quadro DS: raio 14, padding 6, `--shadow-pop`, entra com o
        // `popIn` (160ms, sobe 4px).
        "pele-ruido z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-menu border border-border bg-surface p-1.5 text-text shadow-pop",
        "data-[state=open]:animate-pop-in origin-(--radix-dropdown-menu-content-transform-origin)",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    /** `destructive` é o `.mi.danger` do quadro: texto e ícone crit, hover crit-bg. */
    variant?: "default" | "destructive"
  }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    data-variant={variant}
    className={cn(
      // `.mi` do quadro DS: 34px, raio 8, 13,5px, hover `--hover` (e não a
      // marca cheia, que transformava o item focado num bloco do revendedor).
      "relative flex h-8.5 cursor-default select-none items-center gap-2.5 whitespace-nowrap rounded-md px-2 text-[13.5px] text-text outline-hidden transition-colors focus:bg-hover focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-text-muted",
      "data-[variant=destructive]:text-error-fg data-[variant=destructive]:focus:bg-error-bg data-[variant=destructive]:focus:text-error-fg data-[variant=destructive]:[&>svg]:text-error-fg",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex h-8.5 cursor-default select-none items-center whitespace-nowrap rounded-md pl-8 pr-2 text-[13.5px] text-text outline-hidden transition-colors focus:bg-hover focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex h-8.5 cursor-default select-none items-center whitespace-nowrap rounded-md pl-8 pr-2 text-[13.5px] text-text outline-hidden transition-colors focus:bg-hover focus:text-text data-[disabled]:pointer-events-none data-[disabled]:text-text-subtle",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 pb-1 pt-1.5 text-meta font-semibold text-text-subtle",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("mx-0.5 my-1 h-px bg-border", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) => {
  return (
    // O atalho do item como tecla em caixinha (`.mi kbd` do quadro DS).
    <kbd
      className={cn(
        "ml-auto rounded-[5px] border border-b-2 border-border bg-surface-elevated px-1 font-sans text-[11px] text-text-subtle",
        className,
      )}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
