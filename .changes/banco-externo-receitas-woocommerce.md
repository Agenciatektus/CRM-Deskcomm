---
impacto: capacidade_nova
secao: adicionado
titulo: A receita da loja WooCommerce busca vários itens, no plural e pelo resumo do produto
---

O assistente consulta a loja WooCommerce separando cada item pedido em um termo (ex.: `termos: ["camiseta", "sorvete"]`). Cada termo aceita o plural (`camisetas` encontra `camiseta`) e busca também no resumo do produto (`post_excerpt`), não só no título e SKU. O teto passa a ser o limite por termo vezes o número de termos (até 20 itens). Não exige nenhuma ação de quem opera a instalação.
