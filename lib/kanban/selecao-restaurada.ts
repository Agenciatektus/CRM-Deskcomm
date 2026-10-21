/**
 * O que o DESFAZER de uma ação em lote devolve à seleção (barra do Funil).
 *
 * As ações que limpam a seleção ao agendar (ganho, outro funil, próximo passo)
 * devolvem, no Desfazer, o que estava marcado — mas os 5 s do aviso não são um
 * instante parado:
 *
 *  - um negócio da seleção antiga pode ter sumido do quadro nesse meio-tempo
 *    (excluído por outra pessoa, levado para outro funil). Devolvê-lo marcaria
 *    um id que a tela não mostra, e a próxima ação em lote o mandaria à rota;
 *  - a pessoa pode ter começado uma seleção NOVA. Sobrescrevê-la jogaria fora o
 *    que ela acabou de marcar.
 *
 * Por isso: só devolve quando a seleção atual está vazia, e só os ids que ainda
 * existem no quadro.
 */
export function selecaoRestaurada(
  atual: readonly string[],
  devolver: readonly string[],
  noQuadro: ReadonlySet<string>,
): string[] {
  if (atual.length > 0) return [...atual];
  return devolver.filter((id) => noQuadro.has(id));
}
