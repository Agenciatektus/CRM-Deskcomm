# Mapa de tokens: protótipo Inbox v2 x CRM (Etapa 1)

Etapa 1 do design system ("foundation-first"): trazer o design system do protótipo aprovado para dentro do CRM sem mudar nenhuma tela. Este documento é a fonte da verdade da comparação; `lib/design-system/mapa.ts` guarda só o status por tema, que a vitrine `/app/design-system` usa para pôr o selo de "diferente".

## Método

- **Protótipo, tema claro:** bloco `.app` de `docs/design/inbox-v2/Main.dc.html` (linhas 19-56) e o CSS dos componentes (linhas 100-736).
- **Protótipo, tema escuro:** a Variante Verdash de `MainVerdash.dc.html` (linhas 743-817), que é o escuro aprovado; o que ela não sobrescreve vem do `.app.dark` de `Main.dc.html` (linhas 58-89).
- **CRM:** `app/globals.css` em `origin/dev` (f027292b1) e as classes de `components/ui`.
- Cores do protótipo convertidas de oklch para hex com `oklchParaHex` (`lib/branding/rampa.ts`), a mesma conversão da régua de contraste. **Igual** = distância OKLab ≤ 0,01 (invisível); acima disso, **diferente**.
- `color-mix` do protótipo que depende da marca foi calculado com a marca padrão do CRM (Sage `#506d48` no claro, `#82a077` no escuro) para comparar a FÓRMULA, e não a cor de marca. A cor de marca padrão em si é uma linha própria.
- Status: **igual**, **diferente** (existe nos dois com valor ou forma diferente), **novo** (o protótipo tem, o CRM não tinha e esta etapa criou; existe, mas nenhuma tela usa ainda), **falta** (o protótipo tem e o CRM continua sem), **só CRM** (o protótipo não desenhou).

## Contagem

| Categoria | Igual | Diferente | Novo | Falta | Só CRM | Total |
|---|---:|---:|---:|---:|---:|---:|
| Cor | 13 | 16 | 6 | 0 | 2 | 37 |
| Tipografia | 4 | 5 | 1 | 0 | 0 | 10 |
| Espaçamento | 1 | 4 | 0 | 1 | 0 | 6 |
| Raios | 3 | 8 | 0 | 0 | 0 | 11 |
| Sombras e elevação | 4 | 4 | 0 | 0 | 0 | 8 |
| Foco | 2 | 3 | 0 | 0 | 0 | 5 |
| Degradês e ruído | 5 | 2 | 0 | 0 | 1 | 8 |
| Movimento | 1 | 4 | 0 | 2 | 0 | 7 |
| **Tokens (soma)** | **33** | **46** | **7** | **3** | **3** | **92** |
| Componentes (estados, abaixo) | 2 | 27 | 1 | 0 | 4 | 34 |

Leitura rápida: as **superfícies, textos e linhas já são iguais** nos dois temas (a pele do escuro, PRs #144/#145, e a conversão anterior acertaram a base). O que separa o CRM do protótipo é **forma** (raio, peso, padding), **cores de estado no claro** e o **desenho de cada componente** (menu, diálogo, toast, campos).

## 1. Cor

| # | Protótipo | CRM | Claro: protótipo | Claro: CRM | Escuro: protótipo | Escuro: CRM | Status |
|---|---|---|---|---|---|---|---|
| 1 | `--chrome` | `--color-bg` | `#eef1f5` | `#eef1f5` | `#0d0e11` | `#0d0e11` | igual |
| 2 | `--surface` | `--color-surface` | `#ffffff` | `#ffffff` | `#181a1c` | `#181a1c` | igual |
| 3 | `--surface-2` | `--color-surface-elevated` | `#f5f7f9` | `#f5f7f9` | `#1f2225` | `#1f2225` | igual |
| 4 | `--thread` | `--color-thread` (novo). Telas: `.fundo-do-fio` usa `--color-bg` no claro e `--pele-fio` no escuro | `#f2f5f8` | `#eef1f5` | `#111315` | `#111315` | novo nesta etapa |
| 5 | `--ink` | `--color-text` | `#171d26` | `#171d26` | `#f8f8f8` | `#f8f8f8` | igual |
| 6 | `--ink-2` | `--color-text-muted` | `#474d58` | `#474d58` | `#c8cbce` | `#c8cbce` | igual |
| 7 | `--ink-3` | `--color-text-subtle` | `#606671` | `#606671` | `#a1a5aa` | `#a1a5aa` | igual |
| 8 | `--line` | `--color-border` | `#e0e3e8` | `#e0e3e8` | `#292c2f` | `#292c2f` | igual |
| 9 | `--line-2` | `--color-border-strong` | `#cdd1d7` | `#cdd1d7` | `#3a3d41` | `#3a3d41` | igual |
| 10 | `--hover` | `--color-hover` (novo). Telas: `hover:bg-accent-soft` / `bg-surface-elevated` | `#eaedf2` | — | `#212326` | — | novo nesta etapa |
| 11 | `--accent` (padrão) | `--color-accent` (injetada por `lib/branding/css.ts`) | `#0e7a5f` | `#506d48` (Sage 600) | `#2690b1` (DS Verdash) | `#82a077` (Sage 400) | diferente (só o padrão; a injeção da marca é igual) |
| 12 | `--accent-fg` | `--color-accent-fg` | `#ffffff` | `#ffffff` | `#f8f8f8` | `#161510` (o primário usa `--pele-grad-fg` `#ffffff`) | diferente (escuro) |
| 13 | `--accent-soft` | `--color-accent-soft` | 11% da marca na superfície (`#eaeee9`) | `--color-accent-100` (`#e4ebe0`) | 20% na superfície | `rgba(130,160,119,0.16)` | diferente (claro) |
| 14 | `--accent-soft-2` | `--color-accent-soft-2` (novo, `@theme`) | 20% | — | 30% | — | novo nesta etapa |
| 15 | `--accent-text` | `--color-accent-text` (novo, `@theme`). Telas: classe `TEXTO_ACCENT` (`text-accent-700 dark:text-accent-300`) | 88% da marca + preto (`#425b3b`) | `#41573b` | `#69cee6` fixo | `#a4ba9a` (segue a marca) | novo nesta etapa; escuro diferente |
| 16 | `--tint` | `--color-tint` (novo) | texto 6% | — | branco 8% | — | novo nesta etapa |
| 17 | `--ok` | `--color-success-fg` | `#287c42` | `#41673f` | `#41ce90` | `#41ce90` | diferente (claro) |
| 18 | `--ok-bg` | `--color-success-bg` | `#dff6e2` | `rgba(90,138,95,0.12)` ≈ `#ebf1ec` | `#0a3723` | `#0a3723` | diferente (claro) |
| 19 | `--warn` | `--color-warning-fg` | `#824c00` | `#875a1a` | `#ffb848` | `#ffb846` | diferente (claro) |
| 20 | `--warn-bg` | `--color-warning-bg` | `#ffeed2` | `rgba(176,122,43,0.12)` ≈ `#f6efe6` | `#412805` | `#412805` | diferente (claro) |
| 21 | `--warn-line` | `--color-warning-line` (novo). Telas: nota usa `border-warning/60` | `#e3be80` | — | `#8d5d1c` | — | novo nesta etapa |
| 22 | `--crit` | `--color-error-fg` | `#b02a2d` | `#8a3a2e` | `#fa8785` | `#fa8785` | diferente (claro) |
| 23 | `--crit-bg` | `--color-error-bg` | `#ffe9e6` | ≈ `#f5e9e8` | `#521c1d` | `#521c1d` | diferente (claro) |
| 24 | `--info` | `--color-info-fg` | `#0077bc` | `#355d72` | `#65a7fa` | `#65a7fa` | diferente (claro) |
| 25 | `--info-bg` | `--color-info-bg` | `#e1f1ff` | ≈ `#e9eff2` | `#182e4b` | `#182e4b` | diferente (claro) |
| 26 | — | `--color-success/warning/error/info` (sólidos, fundo de botão) | — | `#5a8a5f` … | — | `#82a077` … | só CRM |
| 27 | `--av1..6`, `--av1i..6i` | `--color-avatar-N`, `-fg` | iguais (pior caso `#00474a` x `#00484c`) | | iguais | | igual |
| 28 | `--bub-in` | bolha de entrada `bg-surface` + borda | `#ffffff` | `#ffffff` | `#1f2225` (surface-2) | `#181a1c` (surface) | diferente (escuro) |
| 29 | `--bub-out` | `bg-accent-soft` / `--pele-bolha-saida` | 15% da marca (`#e3e8e2`) | `#e4ebe0` | 30% da marca na superfície | `--pele-bolha-saida` (mesma fórmula) | diferente (claro) |
| 30 | `--bub-ai` | `bg-accent/5` + `border-accent/35` / `--pele-bolha-ia` | 7% (`#f2f4f1`), borda 26% | 5% (`#f6f8f6`), borda 35% | `#171e22`, borda `--grad` | `#1c2227`, borda `--pele-grad` | diferente (claro) |
| 31 | `.chan-wa`, `.chan-ig` | `ChannelLogo` (hex arbitrário) | disco `#2e9e52`/`#d03275` com ícone branco | ícone `#128c4a`/`#c13584` sobre superfície | idem | ícone `#25d366`/`#f472b6` | diferente |
| 32 | `--grad` | `--pele-grad` | — | — | `#2a52d8 → #2b8cad → #2bc88f` | idem | igual |
| 33 | — | `--pele-grad-texto`, `--pele-grad-texto-hover` (AA para texto branco) | — | — | — | `#2a52d8 → #157f9f → #0c845c` | só CRM |
| 34 | `--grad-soft` | `--pele-grad-soft` | — | — | 24% / 18% | idem | igual |
| 35 | `--noise` | `--pele-ruido` | — | — | 3,5% branco, 3px | idem | igual |
| 36 | fundo `.app.dark` (2 radiais) | `.pele-moldura` | — | — | idem | idem | igual |
| 37 | `.pal-scrim` (sobreposição) | `--color-overlay`; diálogos usam `bg-black/80` | tinta 32% + `blur(2px)` | `rgba(23,29,38,0.42)`; diálogo preto 80% | idem | `rgba(0,0,0,0.6)`; diálogo preto 80% | diferente |

## 2. Tipografia

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | Família: Atkinson Hyperlegible **Next** (400 a 700) | `--font-atkinson` = Atkinson Hyperlegible v1, embarcada só em 400 e 700 (`app/layout.tsx`) | diferente |
| 2 | Mono: Atkinson Hyperlegible Mono (400/500) | `--font-mono` = IBM Plex Mono (400/500) | diferente |
| 3 | Escala 10,5 / 12 / 13 / 14 / 15 / 16 / 17 / 20 | Tailwind cobre 12, 14, 16, 20; 10,5, 13, 15 e 17 só como valor arbitrário (16 usos de `text-[13/15/17px]`) | novo nesta etapa (tokens `text-rail/meta/label/ui/message/title-sm/md/lg`) |
| 4 | Título de página 20/700/-0,01em | `text-2xl font-semibold` (24/600) | diferente |
| 5 | Interface 14/1,45 | `text-sm` 14/1,43 | igual |
| 6 | Mensagem 15/1,42 | `text-[15px] leading-[1.42]` (`bolha/estilo.ts`) | igual |
| 7 | Pesos 400, 500, 600, 700 reais | 500 e 600 aproximados pelo navegador (fonte só tem 400 e 700) | diferente |
| 8 | Botão e rótulo 13/600 | `Button` `text-sm font-medium` (14/500) | diferente |
| 9 | Meta 12/600 | `text-xs font-semibold` nas pílulas | igual |
| 10 | Números em mono tabular | `font-mono` + `tabular-nums` (e `code/kbd` na base) | igual (família no item 2) |

## 3. Espaçamento

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | Base 4: 4, 8, 12, 16, 20, 24, 32, 48 | `--space-1` … `--space-12` | igual |
| 2 | Respiro da linha da lista `--row-py` 12 | `--density-py` 16 | diferente |
| 3 | Modo compacto (8) | não existe | falta |
| 4 | Botão: padding 14 (sm 10) | `px-4` 16 (sm `px-3` 12) | diferente |
| 5 | Campo `.inp`: padding 11 | `Input` `px-4` 16 | diferente |
| 6 | Popover `.pop`/`.ctxm`: padding 6 | `PopoverContent` `p-4` 16; `DropdownMenuContent` `p-1` 4 | diferente |

## 4. Raios

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | Pílula 6 | `--radius-pill` (novo); pílulas da lista `rounded-md` 8 | diferente |
| 2 | Botão 9 (sm 8) | `Button` `rounded-sm` 4 | diferente |
| 3 | Campo 9 (`.inp`), busca 10 | `Input`/`Textarea` `rounded-sm` 4; `<select>` e `SelectTrigger` 8 | diferente |
| 4 | Menu 14 (`.ctxm`), popover 12 (`.pop`) | `DropdownMenu`/`Popover` `rounded-md` 8; `SelectContent` 12 | diferente |
| 5 | Balão 18, canto de quem envia 6 | `rounded-2xl` 16, canto `rounded-*-md` 8 | diferente |
| 6 | Cartão `.work` 14 (16 no escuro Verdash) | `Card` `rounded-lg` 12 | diferente |
| 7 | Paleta/diálogo `.pal` 16 | `DialogContent` `sm:rounded-lg` 12 (0 no celular) | diferente |
| 8 | Chip e etiqueta: cheio | `rounded-full` | igual |
| 9 | Avatar: cheio | `rounded-full` | igual |
| 10 | Status `.status` 10 em 20px de altura | `Badge` `rounded-full` | igual |
| 11 | Raio do anel de foco 6 | `:focus-visible` `--radius-sm` 4 | diferente |

Tokens novos: `--radius-pill` 6, `--radius-control` 9, `--radius-field` 10, `--radius-menu` 14, `--radius-bubble` 18, `--radius-bubble-tail` 6 (utilitários `rounded-pill`, `rounded-control`…).

## 5. Sombras e elevação

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | `--shadow-pop` claro `0 12px 32px -8px` /22% + `0 2px 6px` /8% | `--shadow-lg` (mesma geometria; cor `rgb(16,24,40)` x `#11161f`) | igual (mas popover usa `shadow-md`) |
| 2 | `--shadow-pop` escuro com anel `0 0 0 1px var(--line-2)` | `--shadow-lg` escuro sem o anel | diferente (`--shadow-pop` criado) |
| 3 | `--shadow-bub` claro `0 1px 1px` /6% | bolhas `shadow-xs` `0 1px 2px` /5% | diferente (`--shadow-bubble` criado) |
| 4 | `--shadow-bub` escuro `none` | `shadow-xs` escuro `rgba(0,0,0,0.35)` | diferente |
| 5 | `--drop` (sombra dura de 4px) | `--pele-drop` | igual |
| 6 | `.work` com brilho interno de 1px | `.pele-cartao` | igual |
| 7 | `.btn-primary` escuro: brilho interno + `0 6px 16px -8px` azul | `shadow-xs` | diferente |
| 8 | `.toast` com `--shadow-pop` | sonner `shadow-lg` | igual |

## 6. Foco

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | Claro: `outline 2px var(--accent)`, afastado 2, raio 6 | `outline 2px var(--color-accent-500)` (parada fixa), raio 4; componentes com `ring-2 ring-accent-500` | diferente |
| 2 | Escuro: `oklch(0.68 0.1 225)` | `--pele-foco` `#48a5c7` no `:focus-visible`; mas `ring-accent-500`/`ring-ring` dos componentes seguem a marca | diferente |
| 3 | Campo: borda accent + `0 0 0 3px var(--accent-soft)` | `Input`: borda `accent-500` + `ring-2 ring-accent-soft` | diferente |
| 4 | `<select>`: idem | borda accent + `3px` accent 22% | igual |
| 5 | Escuro, busca e composer: borda e `3px` /22% de `oklch(0.6 0.1 225)` | `.pele-foco` | igual |

## 7. Degradês e ruído

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | `--grad` | `--pele-grad` | igual |
| 2 | `--grad-soft` | `--pele-grad-soft` | igual |
| 3 | `--noise` | `--pele-ruido` (+ `background-size: 3px`) | igual |
| 4 | Fundo `.app.dark` | `.pele-moldura` | igual |
| 5 | `.thread`/`.msgs` escuros (brilho + pontos) | `.fundo-do-fio` + `.trama-do-fio` | igual |
| 6 | `.btn-primary` escuro com `--grad` | `--pele-grad-texto` (meio e ponta escurecidos para o branco passar AA) | diferente (intencional, decisão de 10/10) |
| 7 | `.chip-ai` escuro: texto `--accent-text` `#69cee6` | `--pele-grad-soft-fg` `#8fdcef` | diferente |
| 8 | Claro: fio sem brilho | `.fundo-do-fio` claro com brilho de 10% da marca | só CRM |

## 8. Movimento

| # | Protótipo | CRM | Status |
|---|---|---|---|
| 1 | `--ease` `cubic-bezier(0.22, 1, 0.36, 1)` | `--ease-out` `cubic-bezier(0.2, 0, 0, 1)` | diferente (`--ease-emphasized` criado) |
| 2 | Transições de 150ms | `duration-fast` 120ms | diferente (`--duration-ui` criado) |
| 3 | `popIn` 160ms (sobe 4px, escala 0,98) em popover e menu | `animate-in`/`zoom-in-95` sem `tailwindcss-animate`: nada anima | falta |
| 4 | `toastIn` 200ms | animação própria do sonner | diferente |
| 5 | `slideIn` 220ms no painel lateral | `Sheet` sem animação (mesma causa do 3) | falta |
| 6 | `.btn:active` desce 1px | `active:translate-y-px` | igual |
| 7 | `prefers-reduced-motion` zera toda animação | só pontos (`.card-pulse`, agenda) | diferente |

## 9. Estados por componente

Hover, foco e clique não se congelam na tela: a vitrine mostra cada um ao vivo. Os valores ficam aqui.

| Componente | Estado | Protótipo | CRM hoje | Status |
|---|---|---|---|---|
| Botão primário (`.btn-primary`) | padrão | accent, branco, 36px, raio 9, 14/600, padding 14 | accent, `text-accent-foreground`, 44px (celular) / 36px (desktop), raio 4, 14/500, padding 16 | diferente |
| | hover | accent 86% + preto | `bg-accent-hover` (parada 700) | diferente |
| | foco | outline 2px accent | `ring-2 ring-accent-500 ring-offset-2` | diferente |
| | ativo | desce 1px | desce 1px | igual |
| | desativado | fundo `--line-2`, texto `--ink-3` | 50% de opacidade (escuro: `border-strong` + `text-subtle`, igual ao protótipo) | diferente (claro) |
| | carregando | — | ícone `CircleNotch` girando + desativado | só CRM |
| | escuro | `--grad`, branco, brilho | `--pele-grad-texto`, branco, hover escurece só o fundo | diferente (intencional) |
| Botão secundário (`.btn-ghost`) | padrão | borda `--line-2`, fundo surface | `secondary`: borda `border`, fundo `surface-elevated` | diferente |
| | hover | fundo `--hover` | borda e texto accent | diferente |
| Botão de perigo (`.btn-danger`) | padrão / hover | `--crit` + branco (escuro: texto escuro); hover 86% + preto | `bg-error text-white`; hover `brightness-95` | diferente |
| Botão de ícone (`.icon-btn`) | padrão / hover / ligado | 36px raio 9, hover `--hover`, ligado accent-soft + accent-text | `size="icon"` 44/36px raio 4, hover `accent-soft` + accent | diferente |
| Campo (`.inp`) | padrão | 38px, borda `--line-2`, fundo surface, raio 9 | 40px, borda `border`, fundo `bg`, raio 4 | diferente |
| | hover | — | borda `border-strong` | só CRM |
| | foco | borda accent + 3px accent-soft | borda accent-500 + 2px accent-soft | diferente |
| | erro | borda crit + 3px crit-bg (DS) | `aria-invalid`: borda error + anel error-bg | igual |
| | desativado | — | 55% de opacidade | só CRM |
| Área de texto (`.obs`) | padrão / foco | fundo surface-2, raio 10, 14,5px; foco vira surface | igual ao `Input` (fundo `bg`, raio 4) | diferente |
| `<select>` nativo | padrão / foco / desativado | `.inp` | `@layer base` no padrão do `.inp` (38px, `border-strong`, raio 8) | diferente (raio 8 x 9) |
| Select (Radix) | gatilho / item marcado | `.inp` / item `--hover` | 38px raio 8, item marcado `accent-soft` | diferente |
| Caixa de seleção (`.chk`) | marcada / desmarcada | 16px raio 4, borda `--line-2`, marcada accent | nativa `accent-primary` | diferente |
| Opção (radio) | — | não desenhado | nativa `accent-primary` | só CRM |
| Switch (`.switch`) | desligado / ligado / desativado | 32x18, trilho `--line-2`, ligado accent, bola branca; escuro `--grad` | 36x20, trilho `input`, ligado `primary`, bola `background`; escuro `pele-grad-ativo` | diferente (claro) |
| Chip (`.chip`) | desligado / hover / ligado / desativado | 30px, borda `--line-2`, hover borda `--ink-3`; ligado accent; desativado tracejado 40% | **criado**: `components/ui/chip.tsx` | novo nesta etapa |
| Pílula (`.pill`) | espera, IA, sem dono, tarefa | 22px, raio 6, 12/600, tons info/warn/crit, IA accent-soft | `MetaDaConversa`: 22px, raio 8, 12/600, mesmos tons | diferente (raio, cores de estado do claro) |
| Selo de status (`.status`) | aberta / fechada | 12/600, padding 8, `--ok-bg`/`--ok` | `Badge`: 12/500, padding 12, variantes | diferente |
| Controle segmentado (`.seg`) | normal / ativo | trilho surface-2, item ativo em cartão, 30px 13/600 | `AbasDaInbox` (mesmo desenho, pele no escuro) | igual |
| Abas (`.pn-tab`) | normal / ativa / hover | texto `--ink-3`, ativa `--ink` + sublinhado 2px accent | `Tabs`: cartão `bg-background` + `shadow-sm` | diferente |
| Cartão (`.work`) | — | raio 14, borda `--line`; escuro sombra dura | `Card` raio 12, `shadow-xs`; `pele-cartao` opcional | diferente |
| Avatar (`.av`) | sigla e cor | 40px, 6 pares | `AvatarDoContato`, os mesmos 6 pares | igual |
| Selo do canal (`.chan`) | — | disco colorido 18px, ícone branco, anel surface | `ChannelLogo`: ícone colorido sobre surface | diferente |
| Dica (tooltip) | — | não desenhada (usa `title`) | `TooltipContent` com fundo accent | só CRM |
| Popover (`.pop`) | aberto | raio 12, padding 6, `--shadow-pop`, `popIn` | raio 8, padding 16, `shadow-md`, ruído no escuro, sem animação | diferente |
| Menu (`.ctxm`/`.mi`) | item normal / hover / perigo / desativado | raio 14; item 34px raio 8, hover `--hover`; perigo crit + crit-bg | raio 8; item raio 4, foco `bg-accent` (marca sólida) + `accent-foreground` | diferente |
| Diálogo (`.pal`) | aberto | surface, raio 16, `--shadow-pop`, véu tinta 32% + blur | `bg-background` (moldura, não superfície), raio 12, `shadow-lg`, véu preto 80% | diferente |
| AlertDialog (`.confirm`) | aberto | confirmação dentro do menu, botões à direita | modal como o `Dialog` | diferente |
| Painel lateral (drawer) | aberto | painel surface com `--shadow-pop`, `slideIn` | `Sheet` `bg-background`, `shadow-lg`, sem animação | diferente |
| Aviso (`.toast`) | com Desfazer | fundo `--ink`, texto surface, raio 12, embaixo no centro, Desfazer em accent 45% + branco | sonner `richColors`, embaixo no centro, cartão claro | diferente |
| Skeleton | — | não desenhado | `bg-primary/10` pulsando | só CRM |
| Tabela | — | não desenhada | `Table` shadcn | só CRM |
| Vazio (`.list-empty`/`.empty-teach`) | — | título 15 forte + texto ink-2; `.empty-teach` tracejado | `EmptyState` (ícone, título, apoio, ações) | diferente |
| Bolha recebida | — | surface + borda; escuro surface-2 | `classesDaBolha('entrada')`: surface + borda | diferente (escuro) |
| Bolha enviada | — | 15% da marca; escuro 30% | `accent-soft`; escuro `--pele-bolha-saida` | diferente (claro) |
| Bolha da IA | — | 7% + borda 26%; escuro borda `--grad` | `accent/5` + borda 35%; escuro `pele-bolha-ia` | diferente (claro) |
| Nota interna | — | warn-bg, borda tracejada `--warn-line`, raio 18 | `NoteCard`: warning-bg, `border-warning/60`, raio 16, 14px | diferente |
| Divisor de dia (`.day`) | — | surface, raio 12, `--shadow-bub` | `rounded-full` + `shadow-xs`; escuro `pele-dia` | diferente (claro) |

## 10. Tokens criados nesta etapa (só adição)

Nenhuma tela consome estes nomes ainda. Valores claro / escuro.

| Token | Claro | Escuro | Onde |
|---|---|---|---|
| `--color-hover` | `#eaedf2` | `#212326` | `:root`, `[data-theme=light]`, `[data-theme=dark]`, ponte no `@theme` |
| `--color-thread` | `#f2f5f8` | `#111315` | idem |
| `--color-tint` | `rgba(23,29,38,0.06)` | `rgba(255,255,255,0.08)` | idem |
| `--color-warning-line` | `#e3be80` | `#8d5d1c` | idem |
| `--color-accent-soft-2` | `color-mix(accent 20%, surface)` | 30% | montado no `@theme` com `--mix-accent-soft-2` |
| `--color-accent-text` | `color-mix(accent 88%, preto)` | `#69cee6` | montado no `@theme` com `--mix-accent-text` e `--accent-text-alvo` |
| `--shadow-pop` | geometria do protótipo | com anel `--color-border-strong` | três blocos + ponte |
| `--shadow-bubble` | `0 1px 1px 0 rgba(17,22,31,0.06)` | `none` | três blocos + ponte |
| `--radius-pill/control/field/menu/bubble/bubble-tail` | 6 / 9 / 10 / 14 / 18 / 6 | iguais | `:root` + ponte |
| `--font-size-rail/meta/label/ui/message/title-sm/md/lg`, `--line-height-ui/message` | 10,5 … 20; 1,45 / 1,42 | iguais | `:root` + `--text-*` no `@theme` |
| `--ease-emphasized`, `--duration-ui` | `cubic-bezier(0.22,1,0.36,1)`, 150ms | iguais | `:root`, ponte e `@utility duration-ui` |

Os dois derivados da marca são montados no `@theme inline`, e não no `:root`: um `var(--color-accent)` declarado no `:root` seria resolvido no `<html>`, e a marca da organização (injetada no `<body>`) nunca chegaria a ele.

Também aditivo: `body [data-theme="dark"]` repete os tokens da pele (`--pele-*`, `--gradient-primary`) para uma subárvore escura dentro de página clara. Cópia vigiada por `tests/unit/pele-escura-em-subarvore.test.ts`.

## 11. Propostas de mudança de VALOR (aguardam aprovação)

Nada abaixo foi aplicado. Cada linha muda token ou componente que as telas já usam. "Arquivos" = arquivos de `app/` e `components/` que usam o componente.

| # | O quê | Atual | Proposto | Afeta |
|---|---|---|---|---|
| 1 | Raio, peso e padding do `Button` | `rounded-sm` (4), `font-medium`, `px-4` | `rounded-control` (9), `font-semibold`, `px-3.5`; `sm` com raio 8 | 330 arquivos com `<Button>` |
| 2 | Fonte do produto | Atkinson Hyperlegible v1 400/700 + IBM Plex Mono | Atkinson Hyperlegible **Next** 400/500/600/700 + Atkinson Hyperlegible Mono (versionadas em `app/fonts/`) | todas as telas, e-mail não |
| 3 | `Input`/`Textarea` | 40px, `rounded-sm`, `bg-bg`, borda `border`, `ring-2` | 38px, `rounded-control` (textarea `rounded-field`), `bg-surface` (textarea `surface-elevated` como `.obs`), borda `border-strong`, foco borda accent + anel 3px `accent-soft`, `px-3` | 145 + 51 arquivos |
| 4 | Item do `DropdownMenu` | foco `bg-accent` + `accent-foreground`, raio 4; menu raio 8, `shadow-md/lg` | foco `bg-hover` + `text`, raio 8, altura 34; menu `rounded-menu`, `shadow-pop`, padding 6; item de perigo em `error-fg` + `error-bg` | 19 arquivos (menus de contexto, conta, ações) |
| 5 | Cores de estado do claro | `success-fg #41673f`, `warning-fg #875a1a`, `error-fg #8a3a2e`, `info-fg #355d72`; `-bg` em `rgba` 12% | `#287c42`, `#824c00`, `#b02a2d`, `#0077bc`; `-bg` `#dff6e2`, `#ffeed2`, `#ffe9e6`, `#e1f1ff` (mesma régua AA a refazer em `lib/branding/contraste.ts`) | 116 arquivos com `success/warning/error/info-fg/-bg` |
| 6 | `Dialog`, `AlertDialog`, `Sheet` | fundo `bg-background`, raio 12 (0 no celular), `shadow-lg`, véu `bg-black/80` | fundo `bg-surface`, `rounded-xl` (16), `shadow-pop`, véu `--color-overlay` + `backdrop-blur-xs` | 50 + 41 + 15 arquivos |
| 7 | Toast | cartão claro do sonner (`richColors`) | invertido: fundo `text`, letra `surface`, raio 12, ação Desfazer em `color-mix(accent 45%, branco)` | 174 arquivos chamam `toast` |
| 8 | Pílula e `Badge` | pílula raio 8; `Badge` `px-3`, `font-medium` | pílula `rounded-pill` (6); `Badge` `px-2`, `font-semibold` | `MetaDaConversa` + 102 arquivos com `<Badge>` |
| 9 | Abas (`Tabs`) | cartão shadcn | sublinhado de 2px na marca (`.pn-tab`; no escuro `pele-grad-traco`) | 14 arquivos |
| 10 | Anel de foco | `accent-500` fixo, raio 4 | `--color-accent` em vigor, raio 6; componentes trocam `ring-accent-500` por `ring-accent` | `:focus-visible` global + 36 arquivos |
| 11 | Curva e duração | `--ease-out`, 120ms | `--ease-emphasized`, 150ms; instalar a animação de entrada (`popIn`/`slideIn`) que hoje não existe | todas as transições |
| 12 | `Card` | `rounded-lg` (12) | `rounded-menu` (14) | 136 arquivos |
| 13 | Bolhas | raio 16/8, `shadow-xs`; claro: saída `accent-soft`, IA 5% + borda 35% | `rounded-bubble`/`-tail`, `shadow-bubble`; saída 15%, IA 7% + borda 26%; entrada no escuro `surface-elevated` | `bolha/estilo.ts`, `NoteCard`, divisor de dia |
| 14 | `Switch` | 36x20, bola `bg-background` | 32x18, bola branca | 44 arquivos |
| 15 | Respiro da linha | `--density-py` 16 | 12, com modo compacto 8 | lista da Inbox |

## 12. Os 10 desvios mais visíveis

1. **Botões quadrados e finos**: raio 4 contra 9 e peso 500 contra 600 em 330 arquivos (proposta 1).
2. **Fonte**: a v1 da Atkinson sem 500/600 faz todo `font-medium`/`font-semibold` sair aproximado (proposta 2).
3. **Campos**: fundo da moldura em vez de branco, raio 4 e anel de 2px (proposta 3).
4. **Menu com hover na marca sólida**: o item focado vira um bloco da cor do revendedor (proposta 4).
5. **Cores de estado apagadas no claro**: verde-oliva, ocre e azul-petróleo onde o protótipo tem verde, âmbar e azul vivos (proposta 5).
6. **Diálogos e painel lateral** no tom da moldura, com véu preto de 80% (proposta 6).
7. **Toast** claro e genérico onde o protótipo tem o aviso escuro com Desfazer em destaque (proposta 7).
8. **Pílulas e selos** mais redondos e mais leves (proposta 8).
9. **Abas em cartão** onde o protótipo sublinha (proposta 9).
10. **Foco** numa parada fixa da Sage, mesmo com outra marca (proposta 10).

## 13. O que a vitrine não representa

- **Hover, foco e clique congelados**: CSS não deixa forçar pseudo-classe; cada linha tem o exemplo vivo e os valores estão na seção 9.
- **Camadas no tema do painel**: diálogo, menu, popover, dica e toast montam em portal no `<body>` (nenhum componente de `components/ui` aceita `container`), então no lado a lado abrem no tema do app. Nos modos Claro e Escuro abrem certas.
- **Lado a lado com o app escuro** (corrigido no fix da vitrine): os dois painéis levam `data-theme`; o `dark:` e as classes `pele-*` recortam a subárvore clara (`:not(:where([data-theme="dark"] [data-theme="light"] …))`), e a marca de cada tema chega ao painel por `ESCOPO_DO_PAINEL` (`lib/branding/css.ts`). Ainda seguem o tema do app dentro do painel claro: `::selection`, a cor do anel de `:focus-visible`, a barra de rolagem e a lista aberta do `<select>` nativo (regras de pseudo-elemento e de `@layer base`).
- **Link para o protótipo**: é referência (arquivo:linha + seletor), não link. O protótipo mora em `docs/`, que não vai para a imagem, e precisa do runtime de design que o app não serve; a cerca de hosts (`tests/unit/branding.test.ts`) também não aceita URL de repositório no código que embarca.
- **Divisor de dia e de novas mensagens**: são marcação inline em `components/inbox/fio/ConteudoDaLinha.tsx`, sem componente; a vitrine repete as mesmas classes. Extrair os dois é tarefa da etapa de substituição.
- **Bolhas** usam `classesDaBolha` (a fonte das classes do fio), não a `LinhaDaMensagem` inteira, que exige mensagem do banco, contexto do fio e permissões.

## 14. Cobertura dos quadros DS na vitrine

A vitrine segue 1:1 a ordem e os títulos de `DesignSystem.dc.html` (painel claro) e `DesignSystemVerdash.dc.html` (painel escuro), com índice de âncoras no topo. Cada seção mostra o selo do mapa e a referência arquivo:linha do quadro do seu tema. Os componentes são os do CRM, alimentados por amostras (`lib/design-system/amostras/`). A API da vitrine (`app/app/design-system/_componentes/ApiDaVitrine.ts`) responde no navegador às chamadas que eles fazem. Enquanto a página está aberta, TODA escrita para `/api/` fica no navegador, venha de onde vier, e também qualquer leitura com o prefixo das amostras na URL ou no corpo (P1-1 do Cassio na #164: o "Conversar com" do cartão de contato fazia `fetch` direto com o id só no corpo). O « e o alfinete da barra de exemplo trocam um estado local, sem a Server Action do menu real. Medido no Chromium: zero requisição para `/api/` ao abrir a página e ao clicar em Ganho, Perdido, Marcar todos resolvidos, Compareceu, menu da conversa e busca.

| Seção do quadro | Situação | Por quê |
|---|---|---|
| Cor: Neutros | coberta | |
| Cor: Tema escuro desenhado / Atmosfera | coberta | Radiais da moldura, `pele-ruido`, sombra dura e brilho do fio, com as classes da pele |
| Cor: Destaque | coberta | O título do painel escuro fica sem o nome da marca ("gradiente da logo"), para não exibir marca fixa a um revendedor |
| Cor: Estados | coberta | Com o contraste AA medido |
| Tipografia | coberta | |
| Espaço | coberta | |
| Forma | coberta | Sombras, foco e movimento (que o quadro não tem) ficam aqui, marcados como "só no CRM" |
| Navegação em 2 colunas | coberta | A barra real, recolhida e fixada. Fixar não grava a preferência na vitrine |
| Módulos e páginas | coberta | Tabela gerada do catálogo real, com o acesso de quem olha |
| Componentes básicos (Botões, Indicadores e pílulas, Navegação e campos) | coberta | |
| Mensagens: Tipos cobertos | parcial | Todos os tipos renderizam, com a mídia gerada no navegador. A reação aparece como bolha própria porque o CRM não a prende à mensagem reagida |
| Coluna do lead | coberta | O painel inteiro (`CRMSidePanel`), com tarefa atrasada e sem próximo passo |
| Seletor de data e horário | coberta | |
| Negócio (aba Negócios) | coberta | |
| Menu da conversa | coberta (por botão) | Abre em portal e se mede no ponto do clique |
| Central de avisos | coberta | Fixa na página |
| Busca geral (Ctrl K) | coberta (por botão) | Contatos, conversas e leads vêm das amostras; escolher um resultado navega para um id que não existe |
| Aviso com Desfazer | coberta | É o toast do app |
| Divisórias reguláveis | coberta | Os pegadores só aparecem a partir de 1536 px, como na Inbox |
| Layout da Inbox | parcial | Diagrama e tabela com as medidas reais. A Inbox não foi montada em miniatura: ela depende de realtime, rota e mais de dez leituras do servidor |
| Regras que aprendemos no protótipo | coberta | Com a situação do CRM em cada regra. A regra 5 foi reescrita ("arrastar não perde o ponteiro"): o CRM cumpre com captura do ponteiro, e não com ouvinte na janela |
