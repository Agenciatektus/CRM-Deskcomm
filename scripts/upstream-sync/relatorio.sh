#!/usr/bin/env bash
# Relatório de distância e risco entre o nosso fork e o upstream (melgarafael/DeskcommCRM).
#
#   bash scripts/upstream-sync/relatorio.sh <base-ref> <upstream-ref>
#   ex.: bash scripts/upstream-sync/relatorio.sh origin/dev upstream/main
#
# Imprime markdown em stdout. Só LÊ o repositório (merge-tree não toca a árvore).
#
# A seção que importa é a INTERSEÇÃO: o risco nº 1 de um sync é migration do upstream que
# reescreve CHECK/função/policy/type que uma das nossas 9xxx também define — o upstream
# recria o objeto sem a nossa parte e o baseline sai sem ela, sem conflito textual nenhum
# (casos reais: 0368/0387 em channel_sessions_provider_check, 0394 em
# followup_flow_pointers_surface_check, 0477/0482/0483/0497 em
# fn_lgpd_cascade_redact_contact sem a linha da 9008). A tabela é a lista de leitura
# obrigatória da curadoria; ela NÃO diz que houve regressão, diz onde olhar.
#
# Extração por grep/sed, de propósito simples: comentários `--` saem, o arquivo vira uma
# linha só (pega definição quebrada em várias linhas), tudo em minúsculas, sem `public.`.
# Não pega SQL dinâmico (EXECUTE format(...)) nem nomes montados em string.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "uso: $0 <base-ref> <upstream-ref>" >&2
  exit 2
fi
BASE="$1"; UP="$2"
DIR_MIG="supabase/migrations"

git rev-parse --verify -q "$BASE^{commit}" >/dev/null || { echo "ref inexistente: $BASE" >&2; exit 2; }
git rev-parse --verify -q "$UP^{commit}"   >/dev/null || { echo "ref inexistente: $UP" >&2; exit 2; }

# Objetos que um SQL define/redefine/remove. stdin: SQL. stdout: "tipo<TAB>nome", únicos.
extrair_objetos() {
  local plano
  plano="$(sed 's/--.*$//' | tr '\r\n\t' '   ' | tr 'A-Z' 'a-z' | tr -s ' ')"
  {
    # policies: o nome pode vir entre aspas com espaços; a chave inclui a tabela,
    # porque nomes como "select own" se repetem em tabelas diferentes.
    grep -oE '(create|drop|alter) policy (if exists )?("[^"]+"|[a-z0-9_]+) on ("?public"?\.)?"?[a-z0-9_]+' <<<"$plano" \
      | sed -E 's/^(create|drop|alter) policy (if exists )?//; s/ on ("?public"?\.)?/@/; s/"//g; s/^/policy\t/' || true
    local sem_aspas; sem_aspas="$(tr -d '"' <<<"$plano")"
    grep -oE '(add|drop|rename|validate) constraint (if (not )?exists )?[a-z0-9_]+' <<<"$sem_aspas" \
      | sed -E 's/^.* //; s/^/constraint\t/' || true
    grep -oE '(create (or replace )?|drop |alter )function (if exists )?(public\.)?[a-z0-9_]+' <<<"$sem_aspas" \
      | sed -E 's/^.* //; s/^public\.//; s/^/function\t/' || true
    grep -oE '(create|drop|alter) type (if exists )?(public\.)?[a-z0-9_]+' <<<"$sem_aspas" \
      | sed -E 's/^.* //; s/^public\.//; s/^/type\t/' || true
  } | sort -u
}

MB="$(git merge-base "$BASE" "$UP")"
MB_DESC="$(git describe --tags "$MB" 2>/dev/null || echo 'sem tag alcançável')"
ULTIMA_TAG="$(git describe --tags --abbrev=0 "$UP" 2>/dev/null || echo 'nenhuma')"
A_FRENTE="$(git rev-list --count "$BASE..$UP")"
ATRAS="$(git rev-list --count "$UP..$BASE")"
STAT="$(git diff --shortstat "$MB" "$UP" || true)"
mapfile -t NOVAS < <(git diff --name-only --diff-filter=A "$MB" "$UP" -- "$DIR_MIG" | grep -E '\.sql$' | sort || true)

echo "# Sync com o upstream: \`$UP\` → \`$BASE\`"
echo
echo "Gerado em $(date -u +%Y-%m-%dT%H:%MZ) por \`scripts/upstream-sync/relatorio.sh\`."
echo
echo "## Distância"
echo
echo "| Medida | Valor |"
echo "|---|---|"
echo "| Commits do upstream que a base não tem | $A_FRENTE |"
echo "| Commits nossos que o upstream não tem | $ATRAS |"
echo "| merge-base | \`$(git rev-parse --short=12 "$MB")\` ($MB_DESC) |"
echo "| \`$UP\` | \`$(git rev-parse --short=12 "$UP")\` |"
echo "| Tag mais recente do upstream | $ULTIMA_TAG |"
echo "| Arquivos/linhas (merge-base → upstream) | ${STAT:- nada} |"
echo "| Migrations novas do upstream | ${#NOVAS[@]} |"
echo

echo "## Conflitos textuais (git merge-tree)"
echo
set +e
MT_SAIDA="$(git merge-tree --write-tree --name-only --no-messages "$BASE" "$UP" 2>&1)"
MT_CODE=$?
set -e
if [ "$MT_CODE" -eq 0 ]; then
  echo "Nenhum: o merge entra sem conflito textual. (Isso NÃO cobre a interseção abaixo.)"
elif [ "$MT_CODE" -eq 1 ]; then
  mapfile -t CONFL < <(tail -n +2 <<<"$MT_SAIDA" | sed '/^$/d')
  echo "**${#CONFL[@]} arquivo(s) em conflito.**"
  if printf '%s\n' "${CONFL[@]}" | grep -qx 'supabase/baseline.sql'; then
    echo
    echo "> ⚠️ \`supabase/baseline.sql\` está entre eles: é o único arquivo que vai a produção."
  fi
  echo
  echo '```'
  printf '%s\n' "${CONFL[@]}"
  echo '```'
else
  echo "NÃO MEDIDO: git merge-tree saiu com $MT_CODE."
  echo
  echo '```'
  echo "$MT_SAIDA" | head -20
  echo '```'
fi
echo

echo "## Interseção: migrations do upstream × nossas 9xxx"
echo
# Nossos objetos, na base: "tipo<TAB>nome<TAB>migration"
NOSSOS="$(
  git ls-tree -r --name-only "$BASE" -- "$DIR_MIG" | grep -E '/[0-9]+_9[0-9]{3}_[^/]*\.sql$' | sort \
  | while IFS= read -r f; do
      git show "$BASE:$f" | extrair_objetos | sed "s|\$|\t$(basename "$f" .sql)|"
    done
)"
N_NOSSAS="$(git ls-tree -r --name-only "$BASE" -- "$DIR_MIG" | grep -cE '/[0-9]+_9[0-9]{3}_[^/]*\.sql$' || true)"
LINHAS=""
for f in ${NOVAS[@]+"${NOVAS[@]}"}; do
  objs="$(git show "$UP:$f" | extrair_objetos)"
  [ -n "$objs" ] || continue
  m="$(awk -F'\t' -v mig="$(basename "$f" .sql)" '
        NR==FNR { k=$1"\t"$2; nossas[k] = (k in nossas) ? nossas[k]", "$3 : $3; next }
        { k=$1"\t"$2; if (k in nossas) printf "| %s | %s `%s` | %s |\n", mig, $1, $2, nossas[k] }
      ' <(printf '%s\n' "$NOSSOS") <(printf '%s\n' "$objs"))"
  [ -n "$m" ] && LINHAS+="$m"$'\n'
done
echo "Cruzou ${#NOVAS[@]} migration(s) nova(s) do upstream com $N_NOSSAS nossa(s) 9xxx."
echo
if [ -z "$LINHAS" ]; then
  echo "Nenhum objeto em comum."
else
  echo "**Leitura obrigatória antes do merge** — cada linha é um objeto que o upstream redefine e que uma 9xxx nossa também define:"
  echo
  echo "| Migration do upstream | Objeto em comum | Nossa(s) 9xxx |"
  echo "|---|---|---|"
  printf '%s' "$LINHAS"
fi
