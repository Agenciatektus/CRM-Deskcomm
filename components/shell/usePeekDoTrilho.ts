"use client";
import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { NavGroupId } from "@/lib/navigation/registry";

/**
 * O estado da barra de duas colunas: qual grupo o trilho pediu e, com a barra
 * recolhida, se a coluna está aberta por cima do conteúdo (o "peek").
 *
 * Num hook só porque as regras de abrir e fechar se cruzam (rota, expandir,
 * Esc, foco, clique fora) e cada uma esquecida deixa uma sobreposição presa
 * na tela, cobrindo o começo da lista que a pessoa está lendo.
 */
export function usePeekDoTrilho({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const [escolhido, setEscolhido] = useState<NavGroupId | null>(null);
  const [aberto, setAberto] = useState(false);
  /**
   * Trocou de rota → o grupo volta a ser o da rota e o peek fecha. Expandiu ou
   * recolheu → o peek fecha (expandida, a coluna já está no fluxo; recolher com
   * ele aberto deixaria a sobreposição surgir sozinha).
   *
   * Ajuste DURANTE o render (o padrão do React para "resetar quando uma prop
   * muda"), e não `useEffect`: com efeito, a primeira pintura da tela nova
   * ainda mostraria o grupo antigo.
   */
  const [visto, setVisto] = useState({ pathname, collapsed });
  if (visto.pathname !== pathname || visto.collapsed !== collapsed) {
    if (visto.pathname !== pathname) setEscolhido(null);
    setAberto(false);
    setVisto({ pathname, collapsed });
  }

  const peekAberto = collapsed && aberto;
  const raiz = useRef<HTMLDivElement>(null);
  const coluna = useRef<HTMLDivElement>(null);
  const botoes = useRef(new Map<NavGroupId, HTMLButtonElement>());
  const grupoDoPeek = useRef<NavGroupId | null>(null);

  // Ao abrir (ou trocar o grupo com ele aberto), o foco vai para a 1ª tela da
  // coluna: quem abriu pelo teclado está a um Tab do que procurava, e não a
  // cinco botões de grupo de distância.
  useEffect(() => {
    if (!peekAberto) return;
    coluna.current?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [peekAberto, escolhido]);

  // Clique fora fecha. `pointerdown`, e não `mousedown`: é o mesmo instante para
  // mouse, caneta e toque, e chega antes de o clique ativar o que está atrás.
  useEffect(() => {
    if (!peekAberto) return;
    function aoApontar(e: PointerEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("pointerdown", aoApontar);
    return () => document.removeEventListener("pointerdown", aoApontar);
  }, [peekAberto]);

  /**
   * Esc fecha e devolve o foco ao botão do grupo. Escutado NA RAIZ, e não no
   * `document`: assim só vale com o foco dentro da barra, e um Esc que o ⌘K ou
   * um modal já trataram (`defaultPrevented`) não fecha o peek de carona.
   */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!peekAberto || e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    setAberto(false);
    if (grupoDoPeek.current) botoes.current.get(grupoDoPeek.current)?.focus();
  }

  /**
   * O foco saiu da barra inteira (trilho + coluna) → fecha. Só com destino
   * CONHECIDO fora dela: `relatedTarget` nulo é clique em área sem foco (o
   * título da coluna, por exemplo), e quem cuida de clique é o `pointerdown`.
   */
  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!peekAberto) return;
    const destino = e.relatedTarget as Node | null;
    if (destino && raiz.current && !raiz.current.contains(destino)) setAberto(false);
  }

  /** Clique num grupo do trilho. `mostrado` é o grupo que a coluna exibe agora. */
  function escolher(id: NavGroupId, mostrado: NavGroupId | null) {
    setEscolhido(id);
    if (!collapsed) return;
    // Recolhida: o mesmo botão abre e fecha a sobreposição do grupo dele.
    if (peekAberto && mostrado === id) {
      setAberto(false);
    } else {
      grupoDoPeek.current = id;
      setAberto(true);
    }
  }

  return {
    escolhido,
    peekAberto,
    escolher,
    fechar: () => setAberto(false),
    colunaRef: coluna,
    raizRef: raiz,
    onKeyDown,
    onBlur,
    registrarBotao: (id: NavGroupId) => (el: HTMLButtonElement | null) => {
      if (el) botoes.current.set(id, el);
      else botoes.current.delete(id);
    },
  };
}
