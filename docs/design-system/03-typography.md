# 03 — Tipografia

> **Source of truth:** `app/layout.tsx` (`atkinson`, `atkinsonMono`, via `next/font/local`), `app/globals.css` (`--font-sans`, `--font-mono`, `--font-size-*`, `--text-*`). Arquivos das fontes em `app/fonts/`.

## Por que Atkinson Hyperlegible

A fonte de display + body do produto é **Atkinson Hyperlegible Next**, da família criada pelo Braille Institute com um único objetivo: **maximizar a distinção entre caracteres similares** para usuários com baixa visão.

Razões da escolha:

- **Acessibilidade-first.** `0` vs `O`, `1` vs `l` vs `I`, `rn` vs `m`, `B` vs `8` — todos disambiguados por design. Crítico em CRM onde número de pedido (`#01430`) e código de cliente (`Bl0OO1`) precisam ser lidos sem ambiguidade.
- **Humanista, não geométrica.** Curvas levemente abertas, terminais não-mecânicos. Diferencia do par Inter/Geist (geométrico, dominante no SaaS atual).
- **Baseline alta, x-height generosa.** Confortável em 12–13px, que é onde acontece boa parte da UI operacional (timestamps, helpers, dados de tabela).
- **Mesma família display + body.** Reduz cognição na hierarquia: o que muda é peso e tamanho, não tipo.

A fonte para **dados monoespaçados** é **Atkinson Hyperlegible Mono**, da mesma família: mantém a desambiguação de caracteres nos IDs e valores.

## Stack completo

```css
--font-sans: var(--font-atkinson), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono: var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

`--font-atkinson` e `--font-mono` são injetadas por `next/font/local` em `app/layout.tsx`, a partir de arquivos versionados em `app/fonts/` (o build não depende do Google). Use sempre a custom property, nunca o nome da fonte.

**Pesos carregados** (Atkinson Hyperlegible Next): 200, 300, 400, 500, 600, 700, 800. Body é 400; ênfase e títulos usam 600 ou 700 conforme o papel (ver escala).

**Pesos carregados** (Atkinson Hyperlegible Mono): 400, 500, 700.

Só o estilo normal está carregado. Itálico é sintetizado pelo navegador; por isso o uso é raro (ver Itálico).

> `app/design/lib/fonts.ts` carrega outras famílias (Bricolage, Jakarta, Fraunces e afins) só para a vitrine em `app/design`. Não são fontes do produto.

## Escala tipográfica

Papéis definidos em `app/globals.css` (`--font-size-*`, `--line-height-*`, `--text-*`). Cada papel já leva tamanho, peso e entrelinha: `text-title-lg` sozinho é 20px / 700 / -0,01em. Um `font-*` explícito vence o peso do papel.

| Token | Tamanho | Peso | Tracking | Uso |
|-------|---------|------|----------|-----|
| `text-rail` | 10.5px | 600 | -0.01em | Rótulo mínimo (trilho, contador) |
| `text-meta` | 12px | 600 | 0 | Timestamp, badge, microcopy |
| `text-label` | 13px | 600 | 0 | Label de campo, helper, texto secundário |
| `text-ui` | 14px | 400 | 0 | **Default UI**: copy de botão, item de lista (entrelinha 1.45) |
| `text-message` | 15px | 400 | 0 | Corpo de mensagem na conversa (entrelinha 1.42) |
| `text-title-sm` | 16px | 700 | 0 | Título de card, grupo de formulário |
| `text-title-md` | 17px | 700 | 0 | Título de seção |
| `text-title-lg` | 20px | 700 | -0.01em | Título de página, de modal |

**Regras de uso:**

- Não invente tamanhos intermediários. Se `ui` e `message` não cabem, repense o layout.
- `tracking` só onde o token já define (`rail` e `title-lg`). Não sobrescreva sem motivo.
- **Line-height nunca abaixo de 1.4** em prosa.

## Numerais

Aplique `tabular-nums` (utilitário Tailwind, `font-variant-numeric: tabular-nums`) em:

- IDs de pedido (`#12.443`)
- Preços (`R$ 247,90`)
- Datas e horários (`14:32`, `28/04`)
- Contadores em colunas (`Pedidos: 1.247`)
- Qualquer número em tabela ou lista alinhada

**Mantenha proporcional (default):**
- Números em prosa (`Você tem 3 conversas pendentes`)
- Números pequenos isolados em meio a texto

## Itálico

Itálico tem **uso semântico**, não decorativo, e é sintetizado (a fonte só carrega o estilo normal):

✅ Sim — citar texto literal (`A cliente disse: "ainda não chegou"`)
✅ Sim — termo técnico em primeira ocorrência
✅ Sim — placeholder explicativo (`exemplo: nome do produto`)

❌ Não — destacar palavras pra "dar charme"
❌ Não — em headings (nunca)
❌ Não — em microcopy de botão

## Hierarquia em UI real

Exemplo canônico: **item de inbox**.

```tsx
<div className="ds-list-item">
  <Avatar />
  <div className="body">
    <span className="title">João Silva — Pedido #12.443</span>          {/* text-ui, peso forte via .title */}
    <span className="preview">"Olá, ainda não recebi rastreio…"</span>  {/* text-label, text-muted */}
  </div>
  <div className="meta">
    <span className="ts tabular-nums">14:32</span>                       {/* text-meta, tabular */}
    <Badge variant="success">Resolvido</Badge>
  </div>
</div>
```

Detalhes a observar:
- O nome da pessoa e o ID do pedido convivem na mesma linha porque hierarquia é dada por `weight` + `text-muted`, não por tamanho diferente.
- Timestamp em `text-meta` + `tabular-nums` para alinhar verticalmente entre rows.

Outro exemplo: **header de view**.

```tsx
<header>
  <h1 className="text-title-lg">Inbox</h1>                        {/* 20px / 700 */}
  <p className="text-label text-muted">42 conversas abertas · 3 vencendo SLA</p>
</header>
```

## Acessibilidade

- **Tamanho mínimo:** 12px (`text-meta`). `text-rail` (10.5px) só para rótulo curto ou contador, nunca para frase.
- **Line-height mínimo:** 1.4 em prosa.
- **Contraste:** `--color-text-muted` (`#474d58` claro / `#c8cbce` escuro) serve a UI e a prosa curta; `--color-text-subtle` (`#606671` claro / `#a1a5aa` escuro) só em apoio de 14px+. Os valores vêm de `app/globals.css`; releia lá antes de citar.
- **Truncate:** sempre com `text-overflow: ellipsis` + `white-space: nowrap` + `min-width: 0`. Tooltip com texto completo no hover (`<Tooltip>` shadcn).

## E-mails

Os e-mails transacionais não usam estas classes: o layout (`lib/email/layout.ts`) leva estilo inline e a pilha `'Atkinson Hyperlegible Next','Atkinson Hyperlegible',system-ui,'Segoe UI',Arial,sans-serif`. Inventário e regras: `docs/email/transacionais.md`.

## Como consumir em código

```tsx
// Tailwind (mapeado no `@theme inline` de app/globals.css)
<h1 className="text-title-lg">Inbox</h1>
<p className="text-label text-muted">42 abertas</p>
<span className="font-mono text-label tabular-nums">#12.443</span>
```
