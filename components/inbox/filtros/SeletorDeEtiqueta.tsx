"use client";

import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { PontoDaEtiqueta } from "@/components/tags/PontoDaEtiqueta";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import type { ModoDeEtiqueta } from "@/lib/inbox/marcador-da-conversa";
import { cn } from "@/lib/utils";

interface Props {
  etiquetas: readonly string[];
  opcoes: readonly string[];
  tagMode?: ModoDeEtiqueta;
  onAlternar: (tag: string) => void;
  onLimpar: () => void;
  onModo: (modo: ModoDeEtiqueta | undefined) => void;
}

/**
 * O filtro de etiqueta, com E/OU (#1274). Mora dentro do popover de filtros.
 *
 * ⚠️ POR QUE É UM `DropdownMenu` E NÃO UM `Select`. O `Select` do Radix é de
 * escolha ÚNICA e FECHA o menu a cada item: para duas etiquetas o operador teria
 * de reabrir entre a primeira e a segunda. O `DropdownMenuCheckboxItem` marca e
 * NÃO fecha. O gatilho mantém `aria-label="Filtrar por tag"`, porque quem procura
 * o controle (e o teste `inbox-filtro-de-tag-nao-desmonta`) acha por ele.
 */
export function SeletorDeEtiqueta({ etiquetas, opcoes, tagMode, onAlternar, onLimpar, onModo }: Props) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 w-full min-w-0 truncate rounded-md border border-border bg-surface-elevated px-3 text-left text-xs shadow-none",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            etiquetas.length > 0 && "border-accent bg-accent-soft text-accent",
          )}
          aria-label={t("Filtrar por tag")}
        >
          {etiquetas.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              {/* O CHIP da primeira + o resto resumido: a largura não cabe três.
                  A cor é a mesma que a lista mostra ao lado. */}
              <ChipDeEtiqueta tag={etiquetas[0]!} className="h-5 px-1.5 text-[11px]" />
              {etiquetas.length > 1 && (
                <span className="tabular-nums text-[11px]">+{etiquetas.length - 1}</span>
              )}
            </span>
          ) : (
            t("Todas as tags")
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("Todas as tags")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={onLimpar}>{t("Todas as tags")}</DropdownMenuItem>
        {/* O E/OU só aparece havendo DUAS etiquetas: com uma só o parâmetro não
            muda o resultado, e um controle que não muda nada é um controle morto. */}
        {etiquetas.length > 1 && (
          <>
            <DropdownMenuSeparator />
            {/* Rádio, e não item comum: marca o modo ATIVO (e só ele) e expõe
                `aria-checked` a quem usa leitor de tela. */}
            <DropdownMenuRadioGroup
              value={tagMode === "ou" ? "ou" : "e"}
              onValueChange={(modo) => onModo(modo === "ou" ? "ou" : undefined)}
            >
              <DropdownMenuRadioItem value="e">{t("Todas (E)")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ou">{t("Qualquer uma (OU)")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        {opcoes.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag}
            checked={etiquetas.includes(tag)}
            onCheckedChange={() => onAlternar(tag)}
            onSelect={(e) => e.preventDefault()}
          >
            {/* Ponto, não chip: a opção é uma linha estreita. O nome é o que se
                lê; a cor só acelera o reconhecimento. */}
            <span className="inline-flex items-center gap-2">
              <PontoDaEtiqueta tag={tag} />
              {tag}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
