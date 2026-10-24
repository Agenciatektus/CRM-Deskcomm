# scripts/

CLI utilities pra operação local e de produção.

## Lista

- `seed-tenant.ts` — Cria um tenant manualmente (modo BPO). Placeholder; implementação na Spec 01.
- `habilitar-fzap-nativo.ts` — Habilita/desabilita o modo nativo (FZAP) de UMA organização: grava a pasta do FZAP e o token dela cifrado em `verdash_fzap_pastas`. Dry-run por padrão (`--aplicar` escreve); token só por `FZAP_PASTA_TOKEN`, nunca por argumento; `--desabilitar` remove a linha. Ver `docs/runbooks/fzap-pastas-e-habilitar-org-crm.md` (workspace Tektus).

## Convenções

- Todos em TypeScript (executar via `npx tsx scripts/<nome>.ts`)
- Sempre validar input com Zod
- Logar via `console.error` (stderr) pra mensagens operacionais; `console.log` (stdout) só pra output estruturado consumível por pipe
- Operações destrutivas exigem flag `--confirm` ou prompt interativo
- Toda mutação relevante gera entrada em `api_audit_log` com `actor=script:<nome>`
