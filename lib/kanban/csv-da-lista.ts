/**
 * EXPORTAR OS SELECIONADOS EM CSV, no navegador (barra em lote do Funil).
 *
 * Sem rota nova: os dados já estão na tela, e exportar só o que a pessoa vê é a
 * regra (o recorte e a ordem da Lista). Separador `;` e vírgula decimal, que é o
 * que o Excel em português abre em colunas; BOM para os acentos.
 */
export function celulaCsv(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  // Fórmula no começo vira texto: CSV aberto no Excel não executa nada. `+`/`-`
  // seguidos de dígito ficam (telefone "+55…"): número não é fórmula.
  const seguro = /^(?:[=@\t\r]|[+-](?![\d ]))/.test(texto) ? `'${texto}` : texto;
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function montarCsv(linhas: Array<Array<string | number | null | undefined>>): string {
  return "\uFEFF" + linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n");
}

export function baixarCsv(nomeDoArquivo: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeDoArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
