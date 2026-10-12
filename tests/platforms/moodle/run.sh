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

docker cp "$here/setup.php" h5p-moodle-moodle-1:/tmp/setup.php
docker cp "$package" h5p-moodle-moodle-1:/tmp/alphabet-wheel-es.h5p
docker exec h5p-moodle-moodle-1 chown www-data /tmp/setup.php /tmp/alphabet-wheel-es.h5p
cmid=$(docker exec -u www-data h5p-moodle-moodle-1 php /tmp/setup.php /tmp/alphabet-wheel-es.h5p 3 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s.trim().split("\n").pop()).cmid))')

node "$here/check.mjs" --url http://localhost:8096 --cmid "$cmid" --container h5p-moodle-moodle-1 --db h5p-moodle-db-1 \
  --db-password "$db_password" --admin-password "$admin_password" --shots "$work/../report-moodle-$branch"
