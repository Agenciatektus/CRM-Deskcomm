/**
 * A UNIDADE DA TELA É MINUTO; A DO BANCO É SEGUNDO.
 *
 * O intervalo entre um disparo e o próximo é guardado em
 * `campaigns.intervalo_segundos` (o motor em `ritmo.ts` raciocina em segundos, e
 * a faixa da migration 0375 é em segundos). Mas "900" não comunica 15 minutos a
 * quem opera, e o campo em segundos já foi lido como "tempo entre a 1ª e a 2ª
 * mensagem da conversa", que ele não é. A tela passa a falar minutos; estas duas
 * funções são a única ponte, para a conversão não se espalhar campo a campo e
 * divergir entre as três telas (criar, editar, configuração).
 *
 * `minutosParaSegundos` ARREDONDA: a faixa do banco é inteira, e um operador que
 * digite "1,5" tem de virar 90s válidos, não um decimal que a API recusaria.
 */
export function segundosParaMinutos(segundos: number | null): number | null {
  return segundos === null ? null : segundos / 60;
}

export function minutosParaSegundos(minutos: number | null): number | null {
  return minutos === null ? null : Math.round(minutos * 60);
}
