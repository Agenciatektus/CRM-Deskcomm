"use client";

import { useRef, useState } from "react";

import { useAuth, usePermission } from "@/hooks/auth/AuthProvider";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

import { ConteudoDoMenu } from "./ConteudoDoMenu";
import { DialogosDoMenu, type DialogoDoMenu } from "./DialogosDoMenu";
import type { AlvoDoMenu } from "./useMenuDaConversa";

interface Props {
  alvo: AlvoDoMenu | null;
  /** A conversa VIVA do alvo, lida da lista; `null` se saiu dela. */
  conversation: ConversationWithContact | null;
  onFechar: () => void;
  meuUserId: string | null;
  automaticoDaOrg?: boolean;
}

/**
 * O MENU DE CONTEXTO DA CONVERSA NA LISTA (visual v2, fase 3.6).
 *
 * Abre pelo botão direito na linha, pelo "…" que aparece no hover/foco e pela
 * tecla de menu (ou Shift+F10) na linha focada. É o `DropdownMenu` do Radix que
 * o repositório já usa, ancorado num ponto fixo: o Radix mede o menu e os
 * submenus, troca de lado na borda (para cima, para a esquerda), limita a
 * altura ao espaço da janela com rolagem própria, navega por setas (→ abre o
 * submenu, ← volta) e fecha com Esc, clique fora ou ao executar um item.
 *
 * `modal={false}`: o menu modal travaria a rolagem da página, e rolar a lista
 * é um dos jeitos de fechar (quem fecha é a lista, no `onScroll`).
 *
 * Nenhuma ação é nova: cada item chama o mesmo hook do cabeçalho, e as regras
 * de quando aparece são as dele (`regrasDoMenu`). Sem atualização otimista: os
 * hooks já corrigem a linha pelo `cacheDasConversas` quando o servidor
 * responde, e adiantar no cliente faria a linha piscar com o evento do realtime.
 */
export function MenuDaConversa({ alvo, conversation, onFechar, meuUserId, automaticoDaOrg }: Props) {
  const { user } = useAuth();
  const podeEscrever = usePermission("inbox.claim");
  const leitura = user.support?.access_mode === "support_readonly" || !podeEscrever;
  const [dialogo, setDialogo] = useState<DialogoDoMenu | null>(null);
  // Abrir uma janela a partir do menu: o foco vai para ela, não de volta à linha.
  const abrindoJanela = useRef(false);

  function abrirDialogo(d: DialogoDoMenu) {
    abrindoJanela.current = true;
    setDialogo(d);
  }

  function devolverFoco(e: Event) {
    e.preventDefault();
    if (abrindoJanela.current) abrindoJanela.current = false;
    else alvo?.origem?.focus({ preventScroll: true });
  }

  return (
    <>
      {alvo && conversation && (
        <ConteudoDoMenu
          key={alvo.vez}
          alvo={alvo}
          conversation={conversation}
          leitura={leitura}
          meuUserId={meuUserId}
          automaticoDaOrg={automaticoDaOrg}
          onFechar={onFechar}
          onAbrirDialogo={abrirDialogo}
          onDevolverFoco={devolverFoco}
        />
      )}
      <DialogosDoMenu dialogo={dialogo} onFechar={() => setDialogo(null)} />
    </>
  );
}
