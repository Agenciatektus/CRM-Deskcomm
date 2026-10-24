# site/: landing page do CRM Tektus

App Next separado, dentro do repositório do CRM, **fora da imagem Docker do CRM**
(`site/` está no `.dockerignore`; o Dockerfile da LP nasce na Fase 8, junto com o roteamento) e fora do `tsconfig`, do `eslint` e do `vitest` da raiz.
Tem `package.json` e `pnpm-lock.yaml` próprios; o repositório não usa workspace do pnpm.

## Por que separado

- Mudar texto ou imagem da LP não exige reconstruir a imagem do CRM nem trocar contêineres.
- Uma imagem Docker serve todas as marcas; uma LP dentro do app apareceria em toda instalação de revendedor.
- A catraca `tests/unit/branding.test.ts` varre `app|components|hooks|lib|workers` e reprova nome de marca fixo.
- O app do CRM é `noindex`; a LP precisa ser indexável.

## Como roda

```bash
cd site
pnpm install
pnpm dev        # http://localhost:3200
pnpm typecheck
pnpm build && pnpm start
```

## Roteamento (Fase 8, ainda não ligado)

No host `crm.verdash.com.br` o Traefik manda para a LP só a raiz exata `/`, o prefixo `/_lp`
(JS, CSS, fontes e imagens saem todos por `/_lp/...`) e as rotas da própria LP. Todo o resto
continua no CRM: `/login`, `/app`, `/legal/*`, `/api/*`. A LP não pode usar nenhum nome de rota
de topo do CRM (`app`, `api`, `auth`, `legal`, `login`, `admin`, `cobranca`, `lgpd` e os demais).

## Regras

- Escura sempre, com os tokens do tema escuro do CRM (`app/globals.css`, bloco `[data-theme="dark"]`).
- Fonte: Atkinson Hyperlegible, a mesma da interface. Proibido Inter e Geist.
- Número só se real e verificável. Texto em pt-BR passa pelo humanizer.
- Nada sensível em `site/`: o fork do CRM ainda é público.
