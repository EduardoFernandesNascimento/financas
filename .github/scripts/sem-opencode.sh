#!/usr/bin/env bash
# CI sem-opencode (PROTOCOLO §7, MEM-005): .opencode e .claude nunca entram no repositório do projeto.
# Falha se as pastas estão na árvore avaliada ou se algum commit novo (do PR ou do push) as adiciona ou altera.
# Remover as pastas passa: é assim que se limpa um vazamento.
#
# Uso: bash .github/scripts/sem-opencode.sh <commit avaliado> [<base>]
#      base = base do PR ou o "before" do push; vazio ou zeros no primeiro push
# Instalado por instalar.sh; chamado por .github/workflows/sem-opencode.yml.
set -euo pipefail

HEAD_SHA="${1:?informe o commit avaliado}"
BASE="${2:-}"
[ "$BASE" = "0000000000000000000000000000000000000000" ] && BASE=""

# Repositório-fonte da esteira (P13): lá as pastas são o produto. Vale a marca que já está na base,
# não a que o próprio PR traz: um PR não pode se dispensar da verificação.
MARCA_EM="${BASE:-$HEAD_SHA}"
# ls-tree com a ref e o caminho separados: "<ref>:<caminho>" vira lista de caminhos no Git Bash do Windows
if [ -n "$(git ls-tree --name-only "$MARCA_EM" -- .esteira-fonte 2>/dev/null)" ]; then
  echo "✓ repositório-fonte da esteira (.esteira-fonte em ${MARCA_EM:0:7}): verificação não se aplica"
  exit 0
fi

falhou=0
arvore="$(git ls-tree -r --name-only "$HEAD_SHA" -- .opencode .claude | head -n 20)"
if [ -n "$arvore" ]; then
  echo "::error::.opencode ou .claude na árvore de ${HEAD_SHA:0:7} (PROTOCOLO §7)"
  echo "$arvore" | sed 's/^/    /'
  echo "    Corrija com: git rm -r -q --cached .opencode .claude"
  falhou=1
fi
if [ -n "$BASE" ] && git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  commits="$(git log --format=%h --diff-filter=AMRC "$BASE..$HEAD_SHA" -- .opencode .claude)"
  if [ -n "$commits" ]; then
    echo "::error::commits novos que adicionam ou alteram .opencode ou .claude: $(echo $commits)"
    echo "    O conteúdo continua legível no histórico. Reescrever esses commits é decisão humana (PROTOCOLO §7)."
    falhou=1
  fi
fi
[ "$falhou" = 0 ] && echo "✓ .opencode e .claude fora da árvore${BASE:+ e dos commits novos}"
exit "$falhou"
