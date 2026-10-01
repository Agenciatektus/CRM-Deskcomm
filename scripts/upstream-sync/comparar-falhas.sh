#!/usr/bin/env bash
# Compara duas saídas JSON do vitest (`vitest run --reporter=json --outputFile=<arq>`).
#
#   bash scripts/upstream-sync/comparar-falhas.sh <antes.json> <depois.json>
#
# "Vermelho novo": falha em <depois> e NÃO falhava em <antes> (passava, ou nem existia).
# "Consertados":   falhava em <antes> e não falha em <depois>.
# Teste é identificado por <arquivo relativo ao cwd> › <fullName>; arquivo que nem carrega
# (erro de import/sintaxe) entra como "<arquivo> › (arquivo não carregou)".
#
# Saída em markdown. Exit 1 se houver vermelho novo; exit 2 se um JSON faltar ou não ler
# (sem medição, nunca verde).
set -euo pipefail
if [ $# -ne 2 ]; then echo "uso: $0 <antes.json> <depois.json>" >&2; exit 2; fi

node - "$1" "$2" <<'JS'
const fs = require('fs');
const path = require('path');
const [antesArq, depoisArq] = process.argv.slice(2);

function falhas(arq) {
  let dados;
  try { dados = JSON.parse(fs.readFileSync(arq, 'utf8')); }
  catch (e) { console.log(`NÃO MEDIDO: não consegui ler ${arq} (${e.message})`); process.exit(2); }
  if (!Array.isArray(dados.testResults)) { console.log(`NÃO MEDIDO: ${arq} não tem testResults`); process.exit(2); }
  const set = new Set();
  let total = 0;
  for (const tr of dados.testResults) {
    const rel = path.relative(process.cwd(), tr.name || '?').split(path.sep).join('/');
    const asserts = tr.assertionResults || [];
    total += asserts.length;
    for (const a of asserts) {
      if (a.status === 'failed') set.add(`${rel} › ${a.fullName || a.title}`);
    }
    if (tr.status === 'failed' && !asserts.some(a => a.status === 'failed')) {
      set.add(`${rel} › (arquivo não carregou)`);
    }
  }
  return { set, total };
}

const antes = falhas(antesArq);
const depois = falhas(depoisArq);
const novos = [...depois.set].filter(k => !antes.set.has(k)).sort();
const consertados = [...antes.set].filter(k => !depois.set.has(k)).sort();

const lista = (xs) => xs.length ? xs.map(x => `- \`${x}\``).join('\n') : '_nenhum_';
console.log('## Comparação de testes (dev × merge com o upstream)\n');
console.log(`| | antes | depois |\n|---|---|---|\n| testes | ${antes.total} | ${depois.total} |\n| falhando | ${antes.set.size} | ${depois.set.size} |\n`);
console.log(`### Vermelho novo (${novos.length})\n\n${lista(novos)}\n`);
console.log(`### Consertados (${consertados.length})\n\n${lista(consertados)}`);
process.exit(novos.length ? 1 : 0);
JS
