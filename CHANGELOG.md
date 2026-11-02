# Changelog

Each game has its own versions and tags (`alphabet-wheel-v1.0.0`).

## Alphabet Wheel, not released yet

- A game taken up again comes into view with the focus where it goes on: the answer field or the button that resumes it.
  Before, what was typed went nowhere until the field was tapped.
- On a touch screen, a tapped button no longer stays lit as if the pointer were still over it.

## Number Line, not released yet

- On a touch screen, a tapped button no longer stays lit as if the pointer were still over it.

## Number Line 1.0.1 (1 November 2026)

- The whole round comes into view at the start, down to its buttons. Before, on a common laptop screen below the header of a
  page, only the sum showed and the line and the buttons were out of view.
- «Next» comes into view with the line above it, clear of the fixed bars of a page.
- A game taken up again comes into view with the focus on the first thing to press.

## Number Line 1.0.0 (1 November 2026)

First release of `H5P.NumberLine`: addition, subtraction, times tables, whole numbers and fractions as jumps on a number
line. The jumps are the answer, not a question before them. Each game makes up its own numbers.

- What to practise is chosen by the author or, by default, on the first screen: addition and subtraction up to 20 or 100,
  times tables, whole numbers up to 1000 and fractions. There is also a free line with no points, for a board.
- Three pieces to choose from, so it does not feel childish at any age: a spring with a face, a rocket and a plain die.
- Each round goes to the report of the activity and the score to the gradebook. No clock; the level goes up with three good
  rounds in a row; a wrong try shows where it landed.
- Jumps with the buttons or drawn with a finger. Keyboard, screen readers, dark mode of the page, 320 px wide.
- Eight languages for players and authors, each with an example.

## Alphabet Wheel 1.0.2 (1 November 2026)

- The next step stays in view. After «Start», the clue and the answer field could stay below the edge of the window, in
  most sizes other than a wide screen. The wheel now goes beside the panel in narrower frames and stays small above it on
  a phone, and the game brings the field into view.
- The end screen has its buttons before the list of letters, not after it.
- It follows the dark mode of the page around it, as Moodle 5.3 can have it, and changes along with it.
- The sounds start lower, for classrooms with many devices at once, and there is a volume control next to the speaker,
  the same for every game of the device.
- Double taps on the buttons do not zoom on touch screens.
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
