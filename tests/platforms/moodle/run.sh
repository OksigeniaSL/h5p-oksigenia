#!/bin/sh
# Plays the Alphabet Wheel in a throwaway Moodle and checks attempts, grades and resume (check.mjs).
#
#   tests/platforms/moodle/run.sh 4.5|5.3
#
# Needs Docker, the built example packages (npm run pack) and the oksigenia/moodle image of the branch. The site gets
# random passwords, runs with capped memory and CPU (compose.yaml) and is removed with its volumes at the end, also
# when something fails. Screenshots go to $H5P_PLATFORM_DIR/report-moodle-<branch> (default ~/.cache/h5p-oksigenia).
#
# @copyright 2026 Oksigenia <dev@oksigenia.cc>
# @license   MIT
set -eu

branch=${1:?usage: run.sh 4.5|5.3}
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
work=${H5P_PLATFORM_DIR:-$HOME/.cache/h5p-oksigenia}/moodle
package="$root/dist/alphabet-wheel-$(node -p "const l=require('$root/packages/alphabet-wheel/library.json');[l.majorVersion,l.minorVersion,l.patchVersion].join('.')")-es.h5p"
[ -f "$package" ] || { echo "No $package: run «npm run pack» first" >&2; exit 1; }

mkdir -p "$work"
cp "$here/compose.yaml" "$work/compose.yaml"
db_password=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
admin_password="Admin-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
umask 077
cat > "$work/.env" <<ENV
MOODLE_IMAGE=oksigenia/moodle:$branch
DB_PASSWORD=$db_password
DB_ROOT_PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
ADMIN_PASSWORD=$admin_password
ENV
compose() { docker compose --project-directory "$work" -f "$work/compose.yaml" "$@"; }
# H5P_KEEP=1 leaves the site running to look into a failure; remove it then with the same compose project.
if [ "${H5P_KEEP:-}" = 1 ]; then
  trap 'echo "Site kept: docker compose --project-directory $work down -v"' EXIT
else
  trap 'compose down -v >/dev/null 2>&1 || true; rm -f "$work/.env"' EXIT INT TERM
fi

compose up -d
echo "Waiting for Moodle $branch to install…"
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' h5p-moodle-moodle-1 2>/dev/null)" = healthy ]; do
  i=$((i + 1))
  [ $i -lt 120 ] || { echo "Moodle did not start" >&2; compose logs --tail 30 moodle >&2; exit 1; }
  sleep 5
done

# The library first, as a hosted site gets it: with the command-line installer, checked against the checksums.
c=h5p-moodle-moodle-1
(cd "$root/dist" && sha256sum "$(basename "$package")") > "$work/SHA256SUMS"
docker cp "$root/tools/moodle-install-library.php" $c:/tmp/install-library.php
docker cp "$package" $c:/tmp/$(basename "$package")
docker cp "$work/SHA256SUMS" $c:/tmp/SHA256SUMS
docker exec $c chown www-data /tmp/install-library.php /tmp/$(basename "$package") /tmp/SHA256SUMS
install() { docker exec -u www-data $c php /tmp/install-library.php --package=/tmp/$(basename "$package") "$@"; }
install --sums=/tmp/SHA256SUMS | grep -q 'installed$' || { echo "FAIL the installer did not install the library" >&2; exit 1; }
echo "ok   the command-line installer installs the library"
install --sums=/tmp/SHA256SUMS | grep -q 'nothing to do' || { echo "FAIL a second run did not leave it as it was" >&2; exit 1; }
echo "ok   a second run does nothing"
code=0; install --sha256=0000000000000000000000000000000000000000000000000000000000000000 2>/dev/null || code=$?
[ "$code" = 2 ] || { echo "FAIL a wrong checksum gave exit code $code, not 2" >&2; exit 1; }
echo "ok   a wrong checksum stops it (exit code 2)"

docker cp "$here/setup.php" h5p-moodle-moodle-1:/tmp/setup.php
docker cp "$package" h5p-moodle-moodle-1:/tmp/alphabet-wheel-es.h5p
docker exec h5p-moodle-moodle-1 chown www-data /tmp/setup.php /tmp/alphabet-wheel-es.h5p
cmid=$(docker exec -u www-data h5p-moodle-moodle-1 php /tmp/setup.php /tmp/alphabet-wheel-es.h5p 3 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s.trim().split("\n").pop()).cmid))')

node "$here/check.mjs" --url http://localhost:8096 --cmid "$cmid" --container h5p-moodle-moodle-1 --db h5p-moodle-db-1 \
  --db-password "$db_password" --admin-password "$admin_password" --shots "$work/../report-moodle-$branch"

# Never downgrade: with a newer version on the site (a copy marked 1.0.99), the released package leaves it alone.
python3 - "$package" "$work/newer.h5p" <<'PY'
import json, sys, zipfile
src, dst = sys.argv[1:3]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename.endswith('/library.json') and item.filename.count('/') == 1:
            lib = json.loads(data)
            lib['patchVersion'] = 99
            data = json.dumps(lib).encode()
        zout.writestr(item.filename, data)
PY
docker cp "$work/newer.h5p" $c:/tmp/newer.h5p
docker exec $c chown www-data /tmp/newer.h5p
docker exec -u www-data $c php /tmp/install-library.php --package=/tmp/newer.h5p --sha256="$(sha256sum "$work/newer.h5p" | cut -d' ' -f1)" | grep -q 'installed' \
  || { echo "FAIL the newer copy did not install" >&2; exit 1; }
install --sums=/tmp/SHA256SUMS | grep -q 'already has 1.0.99' || { echo "FAIL the released package touched a newer version" >&2; exit 1; }
echo "ok   with a newer version on the site, the installer leaves it alone"
