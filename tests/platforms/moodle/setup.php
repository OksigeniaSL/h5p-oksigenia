<?php
// Throwaway test data: a course, a fictitious student and an H5P activity with the given package.
// Run inside the container as www-data: php setup.php <package.h5p> <grademethod>
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT
define('CLI_SCRIPT', true);
require('/var/www/moodle/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir . '/enrollib.php');

[, $package, $grademethod] = $argv + [null, null, 3];
$admin = get_admin();
\core\session\manager::set_user($admin);

$course = $DB->get_record('course', ['shortname' => 'AW-TEST']);
if (!$course) {
    $course = create_course((object) ['fullname' => 'Rueda de letras: pruebas (datos ficticios)', 'shortname' => 'AW-TEST',
        'category' => 1, 'format' => 'topics', 'numsections' => 1]);
}
$student = $DB->get_record('user', ['username' => 'alumno1']);
if (!$student) {
    $id = user_create_user((object) ['username' => 'alumno1', 'password' => 'Alumno-1-ficticio', 'firstname' => 'Lucía',
        'lastname' => 'Pruebas', 'email' => 'alumno1@example.org', 'auth' => 'manual', 'confirmed' => 1,
        'mnethostid' => $CFG->mnet_localhost_id], true, false);
    $student = $DB->get_record('user', ['id' => $id]);
}
$instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', MUST_EXIST);
enrol_get_plugin('manual')->enrol_user($instance, $student->id, $DB->get_field('role', 'id', ['shortname' => 'student']));

$draftid = file_get_unused_draft_itemid();
get_file_storage()->create_file_from_pathname(['contextid' => context_user::instance($admin->id)->id, 'component' => 'user',
    'filearea' => 'draft', 'itemid' => $draftid, 'filepath' => '/', 'filename' => basename($package)], $package);
$cm = create_module((object) [
    'modulename' => 'h5pactivity', 'module' => $DB->get_field('modules', 'id', ['name' => 'h5pactivity']),
    'course' => $course->id, 'section' => 1, 'visible' => 1, 'name' => 'Rueda de letras',
    'introeditor' => ['text' => '', 'format' => FORMAT_HTML, 'itemid' => 0],
    'packagefile' => $draftid, 'grade' => 10, 'grademethod' => (int) $grademethod,
    'enabletracking' => 1, 'displayoptions' => 0, 'reviewmode' => 1,
]);
echo json_encode(['course' => (int) $course->id, 'cmid' => (int) $cm->coursemodule, 'student' => (int) $student->id,
    'moodle' => $CFG->release]) . "\n";
