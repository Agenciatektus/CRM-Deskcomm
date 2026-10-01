#!/usr/bin/env bash
# Prova do relatório de sync com o upstream (scripts/upstream-sync/relatorio.sh) e do
# comparador de falhas (scripts/upstream-sync/comparar-falhas.sh), em repositório git
# DESCARTÁVEL e sem rede. Nada aqui toca o clone de quem roda.
#
#   bash tests/shell/upstream-sync-intersecao.test.sh
#
# O que está sob prova:
#   1. CONTROLE POSITIVO: migration do upstream que redefine uma constraint que a nossa
#      9001 define aparece na interseção, com o nome da nossa 9001. Sem isto, tabela vazia
#      provaria só que a sonda está morta.
#   2. CONTROLE NEGATIVO: migration do upstream que só toca `outra_constraint` NÃO aparece.
#   3. função (`create or replace function public.fn_x`) cruza com a nossa.
#   4. nome citado só em comentário `--` não conta como redefinição.
#   5. conflito textual em supabase/baseline.sql é denunciado.
#   6. comparar-falhas: vermelho novo reprova (exit 1) e nomeia o teste; sem vermelho novo
#      passa; JSON ausente é NÃO MEDIDO (exit 2), nunca verde.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELATORIO="$RAIZ/scripts/upstream-sync/relatorio.sh"
COMPARAR="$RAIZ/scripts/upstream-sync/comparar-falhas.sh"

falhas=0; casos=0
ok()   { casos=$((casos+1)); printf '  ✓ %s\n' "$1"; }
falha(){ casos=$((casos+1)); falhas=$((falhas+1)); printf '  ✗ %s\n     %s\n' "$1" "${2:-}"; }
assert_exit() { if [ "$1" = "$2" ]; then ok "$3"; else falha "$3" "exit esperado $2, veio $1"; fi; }
assert_contains() { if grep -qF -- "$2" <<<"$1"; then ok "$3"; else falha "$3" "esperava conter '$2'; saída: $(head -c 800 <<<"$1")"; fi; }
assert_not_contains() { if grep -qF -- "$2" <<<"$1"; then falha "$3" "não esperava '$2'"; else ok "$3"; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# Mesmo isolamento do git de tests/shell/colisao-de-migration.test.sh (o porquê está lá).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
unset $(git rev-parse --local-env-vars)
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_AUTHOR_NAME="Teste" GIT_AUTHOR_EMAIL="teste@exemplo.invalid"
export GIT_COMMITTER_NAME="Teste" GIT_COMMITTER_EMAIL="teste@exemplo.invalid"

r="$TMP/repo"; M="supabase/migrations"
git init -q -b principal "$r"
mkdir -p "$r/$M"
printf 'create table a (id int);\n' > "$r/supabase/baseline.sql"
printf 'create table base ();\n' > "$r/$M/20260101000000_0001_base.sql"
git -C "$r" add -A; git -C "$r" commit -qm base

# ── lado "upstream": cria a partir da base ─────────────────────────────────────────
git -C "$r" switch -q -c upstream
cat > "$r/$M/20260201000000_0387_canal_novo.sql" <<'SQL'
-- Recria o CHECK sem saber dos canais do fork.
ALTER TABLE public.channel_sessions
  DROP CONSTRAINT IF EXISTS channel_sessions_provider_check;
ALTER TABLE public.channel_sessions
  ADD CONSTRAINT channel_sessions_provider_check
  CHECK (provider IN ('meta', 'datafy'));
SQL
cat > "$r/$M/20260202000000_0390_so_outra.sql" <<'SQL'
-- antes: alter table channel_sessions drop constraint channel_sessions_provider_check;
-- e create or replace function public.fn_x(p uuid) -- só comentário, não redefine
alter table public.outra add constraint outra_constraint check (x > 0);
SQL
cat > "$r/$M/20260203000000_0391_funcao.sql" <<'SQL'
create or replace function public.fn_x(p uuid)
returns void language sql as $$ select 1 $$;
SQL
printf 'create table a (id bigint);\n' > "$r/supabase/baseline.sql"
git -C "$r" add -A; git -C "$r" commit -qm "upstream"

# ── lado "nosso" (a base do fork) ───────────────────────────────────────────────────
git -C "$r" switch -q principal
cat > "$r/$M/20260115000000_9001_canal_nosso.sql" <<'SQL'
alter table channel_sessions drop constraint if exists channel_sessions_provider_check;
alter table channel_sessions add constraint "channel_sessions_provider_check"
  check (provider in ('meta', 'verdash'));
CREATE OR REPLACE FUNCTION fn_x(p uuid) RETURNS void LANGUAGE sql AS $$ select 2 $$;
SQL
printf 'create table a (id text);\n' > "$r/supabase/baseline.sql"
git -C "$r" add -A; git -C "$r" commit -qm "nosso"

saida="$(cd "$r" && bash "$RELATORIO" principal upstream 2>&1)"; code=$?
intersecao="$(sed -n '/## Interseção/,$p' <<<"$saida")"

echo "1-4. interseção"
assert_exit "$code" 0 "o relatório roda"
assert_contains "$intersecao" '| 20260201000000_0387_canal_novo | constraint `channel_sessions_provider_check` | 20260115000000_9001_canal_nosso |' \
  "controle positivo: a 0387 do upstream aparece contra a nossa 9001"
assert_not_contains "$intersecao" "outra_constraint" "controle negativo: outra_constraint não aparece"
assert_not_contains "$intersecao" "0390_so_outra" "nome citado só em comentário não vira redefinição"
assert_contains "$intersecao" '| 20260203000000_0391_funcao | function `fn_x` | 20260115000000_9001_canal_nosso |' \
  "função recriada pelo upstream aparece contra a nossa"
assert_contains "$saida" "| Migrations novas do upstream | 3 |" "conta as 3 migrations novas"

echo "5. conflito textual"
assert_contains "$saida" "supabase/baseline.sql" "o conflito no baseline é listado"
assert_contains "$saida" "é o único arquivo que vai a produção" "e destacado"

echo "6. comparar-falhas"
cat > "$TMP/antes.json" <<'JSON'
{"testResults":[{"name":"t/a.test.ts","status":"failed","assertionResults":[{"fullName":"x","status":"passed"},{"fullName":"y","status":"failed"}]}]}
JSON
cat > "$TMP/depois.json" <<'JSON'
{"testResults":[{"name":"t/a.test.ts","status":"failed","assertionResults":[{"fullName":"x","status":"failed"},{"fullName":"y","status":"passed"}]}]}
JSON
s="$(cd "$TMP" && bash "$COMPARAR" antes.json depois.json)"; c=$?
assert_exit "$c" 1 "vermelho novo reprova"
assert_contains "$s" '`t/a.test.ts › x`' "e nomeia o teste que ficou vermelho"
assert_contains "$(sed -n '/### Consertados/,$p' <<<"$s")" '`t/a.test.ts › y`' "e o consertado"
s="$(cd "$TMP" && bash "$COMPARAR" antes.json antes.json)"; c=$?
assert_exit "$c" 0 "sem vermelho novo, passa"
s="$(cd "$TMP" && bash "$COMPARAR" antes.json nao-existe.json)"; c=$?
assert_exit "$c" 2 "JSON ausente é NÃO MEDIDO (exit 2)"

echo
if [ "$falhas" = 0 ]; then echo "upstream-sync-intersecao: $casos casos, todos verdes"; exit 0
else echo "upstream-sync-intersecao: $falhas de $casos casos vermelhos"; exit 1; fi
