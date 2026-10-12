#!/bin/sh
# Plays the Alphabet Wheel in a throwaway WordPress with the official H5P plugin and checks results and resume
# (check.mjs).
#
#   tests/platforms/wordpress/run.sh
#
# Needs Docker and the built example packages (npm run pack). WP-CLI is downloaded once and checked against its
# published SHA-512. The site gets random passwords, runs with capped memory and CPU (compose.yaml) and is removed with
# its volumes at the end, also when something fails. Screenshots go to $H5P_PLATFORM_DIR/report-wordpress.
#
# @copyright 2026 Oksigenia <dev@oksigenia.cc>
# @license   MIT
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
base=${H5P_PLATFORM_DIR:-$HOME/.cache/h5p-oksigenia}
work=$base/wordpress
package="$root/dist/alphabet-wheel-$(node -p "const l=require('$root/packages/alphabet-wheel/library.json');[l.majorVersion,l.minorVersion,l.patchVersion].join('.')")-es.h5p"
[ -f "$package" ] || { echo "No $package: run «npm run pack» first" >&2; exit 1; }
WPCLI_VERSION=2.12.0

mkdir -p "$work" "$base/wp-cli"
if [ ! -f "$base/wp-cli/wp-cli-$WPCLI_VERSION.phar" ]; then
  url="https://github.com/wp-cli/wp-cli/releases/download/v$WPCLI_VERSION/wp-cli-$WPCLI_VERSION.phar"
  curl -sSLf "$url" -o "$base/wp-cli/download.phar"
  expected=$(curl -sSLf "$url.sha512")
  echo "$expected  $base/wp-cli/download.phar" | sha512sum -c - >/dev/null
  mv "$base/wp-cli/download.phar" "$base/wp-cli/wp-cli-$WPCLI_VERSION.phar"
fi

cp "$here/compose.yaml" "$work/compose.yaml"
admin_password="Admin-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
student_password="Alumno-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
db_password=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
umask 077
cat > "$work/.env" <<ENV
DB_PASSWORD=$db_password
DB_ROOT_PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
ENV
compose() { docker compose --project-directory "$work" -f "$work/compose.yaml" "$@"; }
# H5P_KEEP=1 leaves the site running to look into a failure; remove it then with the same compose project.
if [ "${H5P_KEEP:-}" = 1 ]; then
  trap 'echo "Site kept: docker compose --project-directory $work down -v"' EXIT
else
  trap 'compose down -v >/dev/null 2>&1 || true; rm -f "$work/.env"' EXIT INT TERM
fi

compose up -d
i=0
until curl -s -o /dev/null http://localhost:8098/wp-admin/install.php; do
  i=$((i + 1))
  [ $i -lt 60 ] || { echo "WordPress did not start" >&2; exit 1; }
  sleep 2
done

c=h5p-wordpress-wordpress-1
docker cp "$base/wp-cli/wp-cli-$WPCLI_VERSION.phar" $c:/usr/local/bin/wp
docker exec $c chmod 755 /usr/local/bin/wp
wp() { docker exec -u www-data $c wp "$@"; }
wp core install --url=http://localhost:8098 --title='Pruebas H5P (datos ficticios)' --admin_user=admin \
  --admin_password="$admin_password" --admin_email=admin@example.org --skip-email
wp plugin install h5p --activate
wp option update h5p_save_content_state 1
# The plugin asks for consent to talk to the H5P Hub before showing the upload form: a test site answers no.
wp option update h5p_has_request_user_consent 1
wp option update h5p_hub_is_enabled 0
wp user create alumno1 alumno1@example.org --role=subscriber --user_pass="$student_password" --first_name=Lucía \
  --last_name=Pruebas
docker cp "$package" $c:/tmp/alphabet-wheel-es.h5p

node "$here/check.mjs" --url http://localhost:8098 --container $c --db h5p-wordpress-db-1 --db-password "$db_password" \
  --admin-password "$admin_password" --student-password "$student_password" --package "$package" \
  --shots "$base/report-wordpress"
