"use client";
import Link from "next/link";
import { useRef, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import { Archive, ArrowRight, DotsThree, MagnifyingGlass, Pause } from "@/lib/ui/icons";

interface Props {
  /** A busca dentro da conversa (#1793). Ausente: quem monta o cabeçalho não a oferece. */
  onBuscar?: () => void;
  buscaAberta?: boolean;
  /**
   * O foco volta ao GATILHO deste menu quando a busca fecha. É o mesmo ref que
   * antes apontava para a lupa: a lupa mora aqui dentro agora, e um item de menu
   * fechado não recebe foco.
   */
  botaoRef?: RefObject<HTMLButtonElement | null>;
  pausar?: { onPausar: () => void; pendente: boolean };
  arquivar?: { onArquivar: () => void; pendente: boolean };
  contatoId?: string | null;
  /**
   * A coluna do lead está na tela a partir do `xl`? Só então "Ver contato" se
   * cala ali, porque o painel tem o seu. Com o painel fechado, esta é a porta.
   */
  painelVisivel?: boolean;
}

/**
 * O "Mais" do cabeçalho: o que é ferramenta de LEITURA ou gesto de exceção.
 *
 * Ficam visíveis na barra as ações do fluxo normal de atendimento (assumir,
 * liberar, devolver, transferir, lembrar, fechar). Aqui entram a busca, a pausa
 * do automático (que só existe quando a conversa já tem dono e o robô segue de
 * pé, um caso de exceção), arquivar e a porta para a ficha do contato abaixo do
 * `xl`. Nenhuma delas sumiu: só mudaram de lugar, e o menu não aparece vazio.
 */
export function MaisAcoes({
  onBuscar,
  buscaAberta,
  botaoRef,
  pausar,
  arquivar,
  contatoId,
  painelVisivel = true,
}: Props) {
  const t = useT();
  // Escolher "Buscar" monta o campo com `autoFocus`, e o Radix, ao fechar o
  // menu, devolveria o foco ao gatilho logo em seguida, tirando-o do campo.
  const escolheuBusca = useRef(false);
  if (!onBuscar && !pausar && !arquivar && !contatoId) return null;

  return (
    // `modal={false}`: Arquivar abre um AlertDialog a partir deste menu, e o menu
    // modal do Radix pode deixar `pointer-events: none` no body quando os dois fecham.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={botaoRef}
          size="sm"
          variant="ghost"
          className="w-9 px-0"
          aria-label={t("Mais ações")}
          title={t("Mais ações")}
        >
          <DotsThree size={18} weight="bold" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60"
        onCloseAutoFocus={(e) => {
          if (escolheuBusca.current) e.preventDefault();
          escolheuBusca.current = false;
        }}
      >
        {onBuscar && (
          <DropdownMenuItem
            onSelect={() => {
              escolheuBusca.current = !buscaAberta;
              onBuscar();
            }}
          >
            <MagnifyingGlass size={14} aria-hidden />
            {buscaAberta ? t("Fechar busca") : t("Buscar nesta conversa")}
          </DropdownMenuItem>
        )}
        {pausar && (
          <DropdownMenuItem
            disabled={pausar.pendente}
            data-testid="pausar-o-automatico"
            // Este item NUNCA aparece sem dono (`podePausar` exige dono): prometer
            // "você assume" seria prometer o que a rota não faz. Com dono, ela só
            // cala o automático, nunca rouba a conversa de quem a tem.
            title={t("O atendimento automático para nesta conversa. O dono não muda.")}
            onSelect={pausar.onPausar}
          >
            <Pause size={14} aria-hidden />
            {pausar.pendente ? t("Pausando...") : t("Pausar o automático")}
          </DropdownMenuItem>
        )}
        {contatoId && (
          // `xl:hidden` só com o painel lateral aberto: a partir de 1280px ele já
          // tem "Ver contato" para o mesmo contato, a um palmo. Abaixo disso, ou
          // com o painel fechado, esta é a porta.
          <DropdownMenuItem asChild className={painelVisivel ? "xl:hidden" : undefined}>
            <Link href={`/app/contacts/${contatoId}`}>
              <ArrowRight size={14} aria-hidden />
              {t("Ver contato")}
            </Link>
          </DropdownMenuItem>
        )}
        {arquivar && (
          <>
            {(onBuscar || pausar || contatoId) && <DropdownMenuSeparator />}
            <DropdownMenuItem disabled={arquivar.pendente} onSelect={arquivar.onArquivar}>
              <Archive size={14} aria-hidden />
              {arquivar.pendente ? t("Arquivando...") : t("Arquivar")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
