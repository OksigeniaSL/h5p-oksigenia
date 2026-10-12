<?php
// Installs the H5P libraries of a package in Moodle from the command line, the way Site administration > H5P > Manage
// H5P content types does (core_h5p\helper::save_h5p, without creating any content). For setting up hosted sites.
//
//   php moodle-install-library.php --package=/tmp/alphabet-wheel-1.0.0-es.h5p --sums=/tmp/SHA256SUMS
//   php moodle-install-library.php --package=/tmp/alphabet-wheel-1.0.0-es.h5p --sha256=<hex>
//
// Options: --moodle=<folder of config.php> (default /var/www/moodle). Run it as the web server user (www-data).
// It checks the SHA-256 of the package first, and does nothing when the site already has that version of the main
// library or a newer one, so it can run again safely. Tested on Moodle 4.5 and 5.3.
//
// Exit codes: 0 installed, or already up to date; 1 the installation failed; 2 the checksum does not match;
// 3 wrong options or unreadable package.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

define('CLI_SCRIPT', true);

$options = getopt('', ['package:', 'sha256:', 'sums:', 'moodle:', 'help']);
$fail = function (int $code, string $message) {
    fwrite(STDERR, "install-library: $message\n");
    exit($code);
};
if (isset($options['help']) || empty($options['package'])) {
    echo "Usage: php moodle-install-library.php --package=<file.h5p> (--sums=<SHA256SUMS> | --sha256=<hex>) [--moodle=/var/www/moodle]\n";
    exit(isset($options['help']) ? 0 : 3);
}
$package = $options['package'];
if (!is_readable($package)) {
    $fail(3, "cannot read $package");
}

// The checksum, from the release's SHA256SUMS or given as it is.
$expected = $options['sha256'] ?? null;
if (!$expected && !empty($options['sums'])) {
    foreach (file($options['sums'], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        if (preg_match('/^([0-9a-f]{64})\s+\*?(.+)$/i', trim($line), $m) && basename($m[2]) === basename($package)) {
            $expected = $m[1];
        }
    }
    if (!$expected) {
        $fail(3, 'no line for ' . basename($package) . ' in ' . $options['sums']);
    }
}
if (!$expected) {
    $fail(3, 'give --sums or --sha256: the package is not installed without checking it');
}
$actual = hash_file('sha256', $package);
if (!hash_equals(strtolower($expected), $actual)) {
    $fail(2, "checksum mismatch for $package: expected $expected, got $actual");
}

// The main library of the package and its version, from h5p.json and its library.json.
$zip = new ZipArchive();
if ($zip->open($package) !== true) {
    $fail(3, "$package is not a zip file");
}
$h5p = json_decode((string) $zip->getFromName('h5p.json'), true);
$main = $h5p['mainLibrary'] ?? null;
$library = null;
foreach ($h5p['preloadedDependencies'] ?? [] as $dependency) {
    if (($dependency['machineName'] ?? '') === $main) {
        $folder = "{$main}-{$dependency['majorVersion']}.{$dependency['minorVersion']}";
        $library = json_decode((string) $zip->getFromName("$folder/library.json"), true);
    }
}
$zip->close();
if (!$library) {
    $fail(3, "$package has no library.json for its main library");
}
$version = [(int) $library['majorVersion'], (int) $library['minorVersion'], (int) $library['patchVersion']];
$name = $library['machineName'] . ' ' . implode('.', $version);

require(rtrim($options['moodle'] ?? '/var/www/moodle', '/') . '/config.php');
global $DB;

/** The newest version of the library on the site, or null. */
$installed = function () use ($DB, $library): ?array {
    $rows = $DB->get_records('h5p_libraries', ['machinename' => $library['machineName']], '',
        'id, majorversion, minorversion, patchversion');
    $newest = null;
    foreach ($rows as $row) {
        $v = [(int) $row->majorversion, (int) $row->minorversion, (int) $row->patchversion];
        if ($newest === null || $v > $newest) {
            $newest = $v;
        }
    }
    return $newest;
};

$before = $installed();
if ($before !== null && $before >= $version) {
    echo "$name: the site already has " . implode('.', $before) . ", nothing to do\n";
    exit(0);
}

// As the upload form: the package in the admin's draft area, then save_h5p with skipcontent.
$admin = get_admin();
\core\session\manager::set_user($admin);
$fs = get_file_storage();
$draft = [
    'contextid' => context_user::instance($admin->id)->id, 'component' => 'user', 'filearea' => 'draft',
    'itemid' => file_get_unused_draft_itemid(), 'filepath' => '/', 'filename' => basename($package),
];
$file = $fs->create_file_from_pathname($draft, $package);
$factory = new \core_h5p\factory();
$saved = \core_h5p\helper::save_h5p($factory, $file, new stdClass(), false, true);
$file->delete();

$after = $installed();
if ($saved === false || $after === null || $after < $version) {
    $errors = $factory->get_framework()->getMessages('error') ?: [];
    foreach ($errors as $error) {
        fwrite(STDERR, '  ' . (is_object($error) ? ($error->message ?? json_encode($error)) : $error) . "\n");
    }
    $fail(1, "$name was not installed");
}
echo "$name installed" . ($before ? ' (the site had ' . implode('.', $before) . ')' : '') . "\n";
exit(0);
