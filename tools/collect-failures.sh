#!/usr/bin/env bash
# Usage: collect-failures.sh <repo-root> <out.tsv>   -> lines: package<TAB>file<TAB>test name
set -uo pipefail
ROOT=$(realpath "$1"); OUT=$(realpath -m "$2"); : > "$OUT"
export PATH=~/.local/node24/bin:$PATH HOME=${TEST_HOME:-/tmp/zcf-home}; mkdir -p "$HOME"
cd "$ROOT/apps/zcode-cli/packages"
for d in */; do d=${d%/}; [ -f "$d/package.json" ] || continue
  t=$(node -p "require('./$d/package.json').scripts?.test||''"); [ -n "$t" ] || continue
  name=$(node -p "require('./$d/package.json').name")
  if [[ "$t" == *vitest* ]]; then
    pre=""; [[ "$t" == *generate-libs* ]] && (cd $d && node scripts/generate-libs.mjs >/dev/null 2>&1)
    dir=$(echo "$t" | grep -oE 'vitest( run)? [a-z]+' | awk '{print $NF}'); [ "$dir" = run ] && dir=""
    (cd $d && timeout 1800 npx vitest run $dir --maxWorkers=4 --reporter=json --outputFile=/tmp/zcf-$d.json >/tmp/zcf-$d.log 2>&1)
    node -e '
      const fs=require("fs"),p=require("path");let j;try{j=JSON.parse(fs.readFileSync(process.argv[1]))}catch{console.log(process.argv[2]+"\t<no-json>\t<run failed>");process.exit()}
      for(const f of j.testResults){const rel=p.relative(process.argv[3],f.name);
        if(f.status==="failed"&&!f.assertionResults.some(a=>a.status==="failed"))console.log(process.argv[2]+"\t"+rel+"\t<file load error>");
        for(const a of f.assertionResults) if(a.status==="failed") console.log(process.argv[2]+"\t"+rel+"\t"+a.fullName.replace(/\s+/g," "));}
    ' /tmp/zcf-$d.json "$name" "$PWD/$d" >> "$OUT"
  else
    files=$(echo "$t" | grep -oE 'tests/[^ ]+' ); runner="node --disable-warning=DEP0205 --import tsx --test"
    [[ "$t" == tsx* ]] && runner="npx tsx --disable-warning=DEP0205 --test"
    for f in $(cd $d && ls -d $files 2>/dev/null | grep -E "\.(test|node-test)\.(ts|mjs)$"); do
      (cd $d && timeout 900 $runner --test-reporter=tap "$f" > /tmp/zcf-tap.txt 2>&1)
      grep -E '^ *not ok [0-9]+ - ' /tmp/zcf-tap.txt | sed -E 's/^ *not ok [0-9]+ - //; s/ # .*//' | sort -u | while read -r n; do printf '%s\t%s\t%s\n' "$name" "$f" "$n"; done >> "$OUT"
    done
  fi
done
sort -u -o "$OUT" "$OUT"; wc -l "$OUT"
