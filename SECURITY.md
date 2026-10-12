# Security policy

## Reporting a vulnerability

If you find a security issue in these games, **do not open a public GitHub issue**. Use one of these instead:

1. **GitHub private vulnerability reporting** (preferred):
   <https://github.com/OksigeniaSL/h5p-oksigenia/security/advisories/new>
2. **Email**: `dev@oksigenia.cc` (PGP key
   [fingerprint `4D0E 67BD 1935 3CE2 A8E8  267F 8290 9111 546B AD97`](https://oksigenia.com/contacto_publickey.asc)).

Please include the game and its version, the platform and its version, a minimal proof of concept or reproduction
steps, and your assessment of impact.

## Response timeline

| Step | Target |
|---|---|
| Acknowledgement of the report | Within 5 business days |
| Initial assessment and severity rating | Within 10 business days |
| Patched release | Depends on severity; critical issues get out-of-band releases |

## Supported versions

Security patches land on the latest released version of each game. Older versions are not back-patched.

## Scope

This policy covers the code in this repository: the H5P libraries of the games. It does **not** cover H5P core or
the platforms that run it (Moodle, WordPress, Lumi); report those to their own projects.

Installing an H5P content type needs a trusted user, because a library runs its own JavaScript on the site. Reports
about content written by an author reaching players as markup or script (cross-site scripting) are in scope.

## Out of scope

- Configuration choices by the site administrator, such as granting the right to install H5P content types to roles
  they did not intend.
- Visual collisions with site-specific themes (file as a bug).
