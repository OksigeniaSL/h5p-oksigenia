# Changelog

Each game has its own versions and tags (`alphabet-wheel-v1.0.0`).

## Alphabet Wheel, not released yet

- The text kept for screen readers is hidden with `clip-path`, instead of the deprecated `clip`.

## Alphabet Wheel 1.0.1 (12 October 2026)

Screen readers, after listening to the game with Orca:

- Each clue is read once, after the result of the previous letter. The answer field no longer points to the clue as
  its description, which screen readers read again whenever it changed, before the result.
- At the end, the focus carries what happened with the last letter, the message and the score, read once; before,
  the score could be cut off.

## Alphabet Wheel 1.0.0 (12 October 2026)

First release of `H5P.AlphabetWheel`.

- One clue for each letter of the alphabet: the player types the answer or passes the letter to the next round, with
  an optional clock that can be paused. One point per letter.
- Answers checked by the rules of their language: capitals and accents can be ignored, the letters of the language
  (Ñ, Ä, Å…) always count apart, and alternative answers are accepted.
- Scores for the platform: one `answered` xAPI statement per game, as a fill-in with one gap per letter; in Moodle,
  one attempt per game with every letter in the attempts report. The Question type contract and resume are
  implemented.
- A cheer at the end that matches the score, sounds made in the browser with a mute button, and the light, dark and
  site themes and sizes of H5P core 1.28.
- Keyboard play, screen reader announcements, no state by colour alone, from 320 px and at 200 % zoom.
- English, Spanish, German, French, Italian, Dutch, Brazilian Portuguese and Swedish, with an example wheel in each.
- No other H5P library needed; core API 1.24. Tested on Moodle 4.5.15 and 5.3.0, WordPress 7.1.3 with the H5P plugin
  1.17.9, and the engine of Lumi Desktop 1.0.3 on core 1.27.
