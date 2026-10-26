import { respostaDePonte } from "@/lib/auth/ponte-de-volta";
import { marcaDaSaida } from "@/lib/branding/saida";
import { destinoDaVoltaDoInstagram } from "@/lib/channels/instagram/direto-retorno";

/**
 * A volta do "Conectar com o Instagram": é ESTA a `return_url` cadastrada para o parceiro.
 *
 * Quem chega é o NAVEGADOR devolvido pela plataforma, navegação vinda de outro site, onde o
 * cookie de sessão (`sameSite: "strict"`) não viaja. Mandar a plataforma direto à página
 * autenticada levaria quem acabou de consentir ao login. Mesmo remédio das outras voltas
 * (`lib/auth/ponte-de-volta.ts`): um documento nosso dispara a navegação seguinte.
 *
 * Diferença: a `conclusao` vem no FRAGMENTO (`#conclusao=`), que o servidor nunca recebe.
 * A ponte o repassa à página no próprio navegador, em JavaScript. Da query só passam
 * `pedido` (UUID), `status` (ok|erro) e `motivo` (lista fechada); o resto é descartado.
 * Sem efeito nenhum: concluir é a rota autenticada.
 */
export async function GET(request: Request) {
  const destino = destinoDaVoltaDoInstagram(new URL(request.url).searchParams);
  const marca = await marcaDaSaida(null);
  return respostaDePonte(destino, marca.nome, "Voltando para suas conexões…", true);
}
