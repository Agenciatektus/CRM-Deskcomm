/**
 * Capacidade de LOJA ONLINE AO VIVO: saldo e preço direto da Nuvemshop, não do acervo copiado.
 */
import { declararTools } from "./tipos";

export const TOOLS_LOJA_AO_VIVO = declararTools([
  {
    name: "crm_check_store_stock",
    category: "read",
    rotulo: "Ver estoque e preço na loja online",
    explicacao:
      "Consulta a loja online na hora e informa preço, promoção, link e quantas peças restam de cada tamanho e cor, para o assistente não prometer o que a loja não tem.",
    oQueToca: "Loja online conectada",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
]);
