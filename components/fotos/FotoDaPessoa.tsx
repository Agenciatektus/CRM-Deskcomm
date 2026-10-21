"use client";
/**
 * A foto de uma pessoa da equipe com as INICIAIS por baixo.
 *
 * Por baixo é o `Avatar` do Radix: a imagem só entra quando terminou de carregar,
 * e um 404 (a pessoa não subiu foto — o caso comum) deixa as iniciais onde estão,
 * sem piscar nem mostrar ícone de imagem quebrada. Por isso a URL pode ser pedida
 * para qualquer pessoa: a rota responde 404 guardável e o fallback assume.
 *
 * `className` é a caixa de cada tela (tamanho, cor e fonte das iniciais), passada
 * INTEIRA e sem `cn`: o tailwind-merge confunde as escalas próprias de texto do
 * produto com cor e descarta a cor das iniciais. Sem foto, o disco é o de antes.
 */
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { urlDaFotoDoUsuario } from "@/lib/fotos/foto";

export function FotoDaPessoa({
  userId,
  url,
  iniciais,
  className,
}: {
  /** Quem é — a foto vem da rota que confere a organização. */
  userId?: string | null;
  /** URL já conhecida (a da própria sessão), que vence `userId`. */
  url?: string | null;
  iniciais: string;
  className: string;
}) {
  const src = url ?? (userId ? urlDaFotoDoUsuario(userId) : null);
  return (
    <AvatarPrimitive.Root className={`${className} overflow-hidden`} aria-hidden>
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback>{iniciais}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
