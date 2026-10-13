"use client";
import { PontoDaEtiqueta } from "@/components/tags/PontoDaEtiqueta";
import { Button } from "@/components/ui/button";
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
import { type ModoDeEtiqueta } from "@/lib/inbox/marcador-da-conversa";

/** O filtro de etiquetas da lista de contatos: várias, com E/OU (#1274). */
export function FiltroDeEtiquetas({
  tags,
  setTags,
  tagMode,
  setTagMode,
  tagOptions,
}: {
  tags: string[];
  setTags: (tags: string[]) => void;
  tagMode: ModoDeEtiqueta | undefined;
  setTagMode: (modo: ModoDeEtiqueta | undefined) => void;
  tagOptions: string[];
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={tagOptions.length === 0}>
          {tags[0] ? <PontoDaEtiqueta tag={tags[0]} className="mr-2" /> : null}
          {/* Resumo, e não a lista inteira: o gatilho tem a largura do filtro de
              origem ao lado. Uma etiqueta mostra o nome; duas mostram a
              primeira e o resto em contagem. */}
          {tags.length === 0
            ? `${t("Tag")}: ${t("todas")}`
            : tags.length === 1
              ? `${t("Tag")}: ${tags[0]}`
              : `${t("Tag")}: ${tags[0]} +${tags.length - 1}`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("Tag")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setTags([]);
            setTagMode(undefined);
          }}
        >
          {t("Todas")}
        </DropdownMenuItem>
        {/* O E/OU so aparece com DUAS etiquetas: com uma so o parametro nao
            muda o resultado, e um controle que nao muda nada e pior do que
            nenhum. */}
        {tags.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={tagMode === "ou" ? "ou" : "e"}
              onValueChange={(modo) => setTagMode(modo === "ou" ? "ou" : undefined)}
            >
              <DropdownMenuRadioItem value="e">{t("Todas (E)")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ou">{t("Qualquer uma (OU)")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        {/* `DropdownMenuCheckboxItem` marca e NAO fecha o menu — e o
            `onSelect` com `preventDefault` trava esse comportamento, porque
            o item de checkbox fecha por padrao. Sem isso, escolher a segunda
            etiqueta exigiria reabrir o menu. */}
        {tagOptions.map((tagOption) => (
          <DropdownMenuCheckboxItem
            key={tagOption}
            checked={tags.includes(tagOption)}
            onCheckedChange={() => {
              const escolhida = tags.includes(tagOption);
              const proximas = escolhida
                ? tags.filter((et) => et !== tagOption)
                : [...tags, tagOption];
              setTags(proximas);
              // O modo so faz sentido com DUAS: com uma so ele nao muda o
              // resultado, e o `&modo=ou` na URL seria ruido.
              setTagMode(proximas.length > 1 ? tagMode : undefined);
            }}
            onSelect={(e) => e.preventDefault()}
          >
            <PontoDaEtiqueta tag={tagOption} className="mr-2" />
            {tagOption}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
