#!/bin/sh
# What a screen reader says while the Alphabet Wheel is played with the keyboard: Orca in a container, with its own
# virtual screen and no access to the host's screen, sound or input, reads the Spanish example in Firefox ESR; the
# speech it would give is cut out step by step from its debug log.
#
#   tests/platforms/orca/run.sh
#
# Needs Docker, the built example packages (npm run pack) and the dev server's H5P core (.h5p-dev, npm run dev once).
# Output: $H5P_PLATFORM_DIR/orca (default ~/.cache/h5p-oksigenia/orca): orca.log, steps.log and speech.txt.
#
# @copyright 2026 Oksigenia <dev@oksigenia.cc>
# @license   MIT
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
out=${H5P_PLATFORM_DIR:-$HOME/.cache/h5p-oksigenia}/orca
port=8093
rm -rf "$out" && mkdir -p "$out" && chmod 777 "$out"

docker image inspect h5p-oksigenia-orca >/dev/null 2>&1 || docker build -q -t h5p-oksigenia-orca "$here" >/dev/null

node "$here/serve.mjs" --port $port > "$out/server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT INT TERM
i=0
until grep -q '/play' "$out/server.log"; do i=$((i + 1)); [ $i -lt 60 ] || { cat "$out/server.log" >&2; exit 1; }; sleep 1; done

docker run --rm --network host --memory 2g --cpus 2 -e URL="http://127.0.0.1:$port/play" \
  -v "$out:/out" -v "$here/session.sh:/session.sh:ro" h5p-oksigenia-orca sh /session.sh

node -e '
const fs = require("fs");
const [dir] = process.argv.slice(1);
const log = fs.readFileSync(dir + "/orca.log", "latin1");
const steps = fs.readFileSync(dir + "/steps.log", "utf8").trim().split("\n").map((l) => { const [at, ...n] = l.split("\t"); return { at: Number(at), name: n.join("\t") }; });
const out = [];
steps.forEach((s, i) => {
  const piece = Buffer.from(log, "latin1").subarray(s.at, i + 1 < steps.length ? steps[i + 1].at : undefined).toString("utf8");
  const said = [...piece.matchAll(/SPEECH OUTPUT: \x27(.*)\x27/g)].map((m) => m[1]).filter((x) => x.trim());
  out.push(`## ${s.name}`, ...said.map((x) => `- ${x}`), "");
});
fs.writeFileSync(dir + "/speech.txt", out.join("\n"));
console.log(out.join("\n"));
' "$out"
