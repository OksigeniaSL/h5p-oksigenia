# Oksigenia games for H5P

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-in%20development-yellow)
[![Sponsor](https://img.shields.io/badge/sponsor-Oksigenia-00d4ff)](https://oksigenia.com/en/open-source#sponsor)

Word games as H5P content types. Each student plays on their own, the game checks the answers and the score goes
to the gradebook, so a game counts as a graded activity in Moodle™ like any other H5P activity.

[Leer en español](README.es.md)

## Games

- **Alphabet Wheel** (`H5P.AlphabetWheel`): a clue for each letter of the alphabet. The student types the answer or
  passes the letter to the next round. One point per letter.

## Where they run

Anywhere H5P runs: the H5P activity of Moodle 4.5 or later, WordPress with the H5P plugin, and Lumi Desktop. The
games do not depend on H5P core 1.28, so they also install on sites with core 1.27.

Each release comes with an example `.h5p` per language. Uploading it installs the game on the site; that needs a
user allowed to install H5P content types (in Moodle, the capability `moodle/h5p:updatelibraries`).

## Accessibility

The whole game is played with the keyboard, the letter, the clue and the result are announced to screen readers,
nothing relies on colour alone, any timer can be paused, and the layout works at 320 px wide and at 200 % zoom.

## Development

One folder per H5P library in `packages/`, and the code the games share in `packages/shared/`, built into each
game rather than shipped as a library of its own. Each game is released on its own, with a tag such as
`alphabet-wheel-v1.0.0` and its example `.h5p` files. Node 22 or later.

```
npm install
npm test             # unit tests
npm run typecheck    # types, from the JSDoc comments
npm run dev          # the H5P dev server (h5p-cli) with every game and its examples
npm run e2e          # end-to-end tests in a browser against that server
npm run pack         # build/ with each library and dist/ with the example .h5p files
npm run lang         # language/*.json from semantics.json and the dictionaries in i18n/
```

The same sources always give the same `.h5p`, byte for byte.

## On the classroom board

The same games for the whole class at once, with the teacher keeping score, are in
[Oksigenia Classtools](https://github.com/OksigeniaSL/moodle-local_oksigeniaclasstools), the classroom board for
Moodle.

## License

MIT. © 2026 Oksigenia SL.

H5P is a registered trademark of H5P Group. Moodle™ is a registered trademark of Moodle Pty Ltd in many countries.
