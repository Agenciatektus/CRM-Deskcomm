---
impacto: nada_mudou
secao: corrigido
titulo: Os CSVs de auditoria e de empresas abrem como texto em qualquer planilha
---

O CSV de empresas (Administração) já punha uma aspa simples na frente da célula que começa com `=`, `+`, `-`, `@`, TAB ou CR. É isso que faz a planilha mostrar o conteúdo como texto, e não como fórmula. A regra agora vale também para cada trecho que começa depois de `;`, `,` ou de uma quebra de linha, porque é por esses caracteres que planilhas como o Excel em português dividem as colunas. O CSV de auditoria, que não tinha regra nenhuma, passa a usar a mesma. Número puro continua sem aspa, como o telefone com `+55` e os números dentro do JSON da coluna `metadata`. Nada muda na tela nem no banco.
