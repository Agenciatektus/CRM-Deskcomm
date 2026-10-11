/**
 * Quem vê a vitrine do design system (`/app/design-system`).
 *
 * A vitrine é ferramenta de quem desenha e mantém o produto, não tela de uso:
 * não tem entrada no menu e mostra tokens e componentes soltos. O pedido era
 * "admin ou acima, e o padrão de staff/dev se houver, o mais restritivo". O
 * padrão de staff existe (`settings/atualizacao/page.tsx`: só o dono do servidor,
 * `is_platform_admin`, com `notFound()`), e ele é o mais restritivo, então é ele.
 *
 * Em sessão de SUPORTE o `is_platform_admin` é do operador que está olhando a
 * organização de outro, não de quem a organização tem como dono. Mesma regra de
 * `settings/marca/page.tsx` (`is_platform_admin && !user.support`).
 */
export function podeVerDesignSystem(
  user: { is_platform_admin?: boolean | null; support?: unknown } | null | undefined,
): boolean {
  if (!user) return false;
  return user.is_platform_admin === true && !user.support;
}
