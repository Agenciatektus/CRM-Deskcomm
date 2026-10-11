"use client";

import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";

import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

export function SecaoSobreposicoes({ tema }: { tema: Tema }) {
  const t = useT();
  const avisar = () =>
    toast(t("Conversa arquivada"), {
      action: { label: t("Desfazer"), onClick: () => toast(t("Desfeito")) },
    });
  return (
    <Secao
      id={`camadas-${tema}`}
      titulo={t("Camadas por cima da página")}
      apoio={t("Abra cada uma para ver. Elas nascem no fim da página, então seguem o tema da página.")}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Exemplo nome="Tooltip" mapa="comp:tooltip" tema={tema}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary">{t("Passe o mouse")}</Button>
            </TooltipTrigger>
            <TooltipContent>{t("Arquivar conversa (E)")}</TooltipContent>
          </Tooltip>
        </Exemplo>
        <Exemplo nome="Popover" mapa="comp:popover" tema={tema}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">{t("Lembrar depois")}</Button>
            </PopoverTrigger>
            <PopoverContent className="flex flex-col gap-2">
              <p className="text-label font-semibold text-text-subtle">{t("Lembrar depois")}</p>
              <Button variant="ghost" className="justify-start">{t("Em 1 hora")}</Button>
              <Button variant="ghost" className="justify-start">{t("Amanhã às 9h")}</Button>
            </PopoverContent>
          </Popover>
        </Exemplo>
        <Exemplo nome={t("Menu (DropdownMenu)")} mapa="comp:menu" tema={tema}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">{t("Mais ações")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60">
              <DropdownMenuLabel>Mariana Couto</DropdownMenuLabel>
              <DropdownMenuItem>
                {t("Assumir conversa")}
                <DropdownMenuShortcut>A</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                {t("Marcar como não lida")}
                <DropdownMenuShortcut>U</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>{t("Desativado")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-error-fg">{t("Excluir lead")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Exemplo>
        <Exemplo nome="Dialog" mapa="comp:dialog" tema={tema}>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t("Abrir diálogo")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Transferir conversa")}</DialogTitle>
                <DialogDescription>{t("Escolha quem vai continuar o atendimento.")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button>{t("Transferir")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Exemplo>
        <Exemplo nome="AlertDialog" mapa="comp:alert-dialog" tema={tema}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t("Excluir lead")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("Excluir este lead?")}</AlertDialogTitle>
                <AlertDialogDescription>{t("O histórico da conversa continua; só o negócio sai do funil.")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
                <AlertDialogAction>{t("Excluir")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Exemplo>
        <Exemplo nome="Sheet" mapa="comp:sheet" tema={tema}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">{t("Abrir painel lateral")}</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Mariana Couto</SheetTitle>
                <SheetDescription>{t("O painel do lead no celular abre assim.")}</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </Exemplo>
        <Exemplo nome={t("Aviso com Desfazer (toast)")} mapa="comp:toast" tema={tema}>
          <Button variant="secondary" onClick={avisar}>
            {t("Mostrar aviso")}
          </Button>
        </Exemplo>
      </div>
    </Secao>
  );
}
