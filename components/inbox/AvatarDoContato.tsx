"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { classeDaCorDoAvatar } from "@/lib/inbox/cor-do-avatar";
import { cn } from "@/lib/utils";

interface Props {
  /** O contato (só o que o avatar lê). `null` = sem contato, só as iniciais. */
  contato: { id: string; avatar_storage_path?: string | null; is_anonymized?: boolean } | null;
  /** As iniciais já calculadas por quem chama (cada tela tem o seu fallback). */
  iniciais: string;
  /** Semente da cor quando não há id (o nome exibido). */
  nome?: string;
  /** Tamanho e tipografia: `h-10 w-10 text-[13px]`, `h-12 w-12 text-base`… */
  className?: string;
}

/**
 * O avatar do contato com COR POR PESSOA, o mesmo nas três telas que mostram a
 * pessoa (lista, cabeçalho da conversa e painel do lead).
 *
 * Um componente só, e não a classe repetida nas três: a regra tem duas partes
 * que precisam andar juntas (a foto quando existe, a cor estável quando não) e
 * três cópias divergiriam na primeira correção.
 *
 * Contato anonimizado (LGPD) não mostra foto, e a cor sai do id do mesmo jeito:
 * a cor não identifica ninguém fora desta tela.
 */
export function AvatarDoContato({ contato, iniciais, nome, className }: Props) {
  const temFoto = !!contato?.avatar_storage_path && !contato?.is_anonymized;
  return (
    <Avatar className={cn("h-10 w-10 text-[13px]", className)}>
      {/* Só monta a <img> quando existe arquivo: sem isso o browser pediria a
          rota para TODO contato sem foto e levaria 404 em cada um. O
          AvatarFallback do Radix cobre a imagem que não carrega. */}
      {temFoto && contato ? (
        <AvatarImage src={`/api/v1/contacts/${contato.id}/avatar`} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback
        data-testid="avatar-do-contato"
        className={cn("font-bold", classeDaCorDoAvatar(contato?.id ?? nome))}
      >
        {iniciais}
      </AvatarFallback>
    </Avatar>
  );
}
