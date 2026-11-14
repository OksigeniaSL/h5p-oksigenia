# Changelog

Each game has its own versions and tags (`alphabet-wheel-v1.0.0`).

## Alphabet Wheel 1.0.9 (not released yet)

- Letter tiles instead of typing, for players who are still learning to write, as a teacher who plays the wheel with
  the youngest pupils of his school did by hand in each clue: the letters of the answer come jumbled on a rack, under
  the places of the word, and they tap them in order. A tile goes to the first empty place, and a letter of the word,
  tapped, goes back to its tile; the key at the end of the rack erases the last one, where a keyboard has it. Spaces,
  hyphens and apostrophes are already in their place. «Check» with places still empty asks for the missing letters and
  does not lose the letter. There is no answer field, so no keyboard covers a tablet or a phone; with a keyboard, a
  letter key takes its tile and the backspace erases. The tiles show the answer as it is written, with its capitals
  and accents, and are a finger wide on a phone; beside the wheel, a long word narrows them to keep one row. Authors
  tick «Letter tiles instead of typing», under the list of letters.
- The counts and «Finish» share the last line, which leaves more room on a board.
- On a slow machine (a board, a site under load) the next step comes into view even when the frames of the platform
  grow late: the game looks again one and two seconds later, and still not after the player has touched anything.
- When the time ran out, the game ended twice: it sent its result twice, and Moodle kept two attempts in the same
  second. It ends once.

Versions 1.0.7 and 1.0.8 were test versions on a development site, not released.

## Number Line 1.0.5 (not released yet)

- On a slow machine (a board, a site under load) the next step comes into view even when the frames of the platform
  grow late: the game looks again one and two seconds later, and still not after the player has touched anything.

## Balance Scale 1.0.2 (not released yet)

- On a slow machine (a board, a site under load) the next step comes into view even when the frames of the platform
  grow late: the game looks again one and two seconds later, and still not after the player has touched anything.

## Alphabet Wheel 1.0.6 (13 November 2026)

- A picture can be the clue of a letter, beside its text or instead of it, as a teacher asked. With the wheel beside
  the clue, it goes in the middle of the wheel, so it does not push the answer field down, with the letter as a badge
  under it. On a phone, where the wheel is above, it goes beside the clue, just above the answer field, where the
  keyboard does not cover it. The end screen shows it next to its clue. Authors write what the picture shows, without the answer, and screen readers read it with the
  clue. The example wheels have two drawings: the sun beside its text and the moon alone.
- The letter just answered jumps when it is right and shakes a little when it is wrong, never the whole screen, and
  not at all when the system asks for less motion. Each right answer in a row rings a little higher.
- On a phone, the answer field and the clue above it come back into view after each answer: the keyboard stays open
  over the lower half, and the Moodle app does not make the page smaller for it.
- A double tap on a slow board counts once: for 400 ms after a move, «Pass» and an empty answer do nothing, so the next
  letter is not passed unseen and the result of the last one stays.
- The volume has a wide slider with a big thumb, easy to touch on a board, and it is dimmed while the sound is muted.
- In a frame of another site, whose page it cannot read (as in the Moodle app's online player), it follows the dark
  mode of the device. A package exported by Moodle, which carries the library's name as its title, shows no title.
- The dark mode of the page comes from the same styles as in the other games.
- Texts of the game with an apostrophe or quotes (in French and Italian) showed as codes such as «&#039;» once the
  package was uploaded to a platform, which keeps them that way; they show as text again. In French and Italian the
  result reads well with any number: «Lettres trouvées : 1 sur 26».

Versions 1.0.4 and 1.0.5 were test versions on a development site, not released.

## Number Line 1.0.4 (13 November 2026)

- The piece lands with weight: it squashes a little on its foot and comes back with a small bounce, not when the system
  asks for less motion. Each right round in a row rings a little higher.
- The volume has a wide slider with a big thumb, easy to touch on a board, and it is dimmed while the sound is muted.
- In a frame of another site, whose page it cannot read (as in the Moodle app's online player), it follows the dark
  mode of the device. A package exported by Moodle, which carries the library's name as its title, shows no title.
- Texts of the game with an apostrophe or quotes (in English, French and Italian) showed as codes such as «&#039;» once
  the package was uploaded to a platform, which keeps them that way; they show as text again.

Version 1.0.3 was a test version on a development site, not released.

## Balance Scale 1.0.1 (13 November 2026)

- Texts of the game with an apostrophe or quotes (in English, French and Italian) showed as codes such as «&#039;» once
  the package was uploaded to a platform, which keeps them that way; they show as text again.
- The volume slider is dimmed while the sound is muted, so a muted game does not look as if it sounded low.

## Balance Scale 1.0.0 (7 November 2026)

The first version: equalities on a two-pan balance, where what is put on the scale is the answer and the equality is
written under it with =, < or >.

- Four topics, three levels each (featherweight, middleweight and heavyweight): equalities with the gap on either side,
  in the order of Rittle-Johnson et al. (2011); equal groups; sharing out every weight; and the mystery bag, with whole
  positive numbers and sums only. A free balance with no points, for a board.
- The scale leans at once by default, and the round ends when it balances: 2 points without taking any weight off, 1
  with one or two. As an option, it is held until it is let go: 2 points at the first go, 1 at the second. After that,
  the game does it together, with no points. The usual mistake (putting what the other side weighs) is explained at
  once, and every hint says what is missing and where.
- A round that does not go well comes back two rounds later with other numbers, marked as a review in the report.
- Three painted scales to choose from, remembered on the device: a market, a laboratory and a pencil drawing on squared
  paper. The weights grow with what they weigh, and their numbers are text, crisp at any size.
- The instructions recorded in Spanish and English, at the volume of the game; in other languages, the text alone.
- The volume starts at a quarter and has its own wide slider, easy to touch on a board.
- It fits on classroom boards (1280 × 600, 960 × 540, 1366 × 768, 1517 × 717 and 1115 × 555 under the bar of a page) and
  in browsers without container queries, such as Firefox 98.
- In a frame of another site, whose page it cannot read (as in the Moodle app's online player), it follows the dark mode
  of the device. A package exported by Moodle, which carries the library's name as its title, shows no title.

## Alphabet Wheel 1.0.3 (3 November 2026)

For classroom boards:

- The page no longer moves under a press. The game brings the next step into view and looks again a moment later,
  when the frames around it have grown; on a slow machine that late move could come between pressing a button and
  letting go. Once the player presses something, the page now stays put.
- In browsers without container queries, such as the Firefox 98 of some boards with Android 8, the letters around the
  wheel were tiny, the one in the middle was the size of the text, and the wheel stayed above the clue. It now looks the
  same as anywhere else.
- A full-screen button, with larger letters where the screen is tall enough for them. In full screen, a button to come
  out of it: H5P hides its own there, and a board has no Esc key.
- At 960 × 540 the answer field and its two buttons stay on one row, and the game fits on the screen.
- On a touch screen, a tapped button no longer stays lit as if the pointer were still over it.

And:

- A game taken up again comes into view with the focus where it goes on: the answer field or the button that resumes it.
  Before, what was typed went nowhere until the field was tapped.

## Number Line 1.0.2 (3 November 2026)

For classroom boards:

- The page no longer moves under a press. The game brings the next step into view and looks again a moment later,
  when the frames around it have grown; on a slow machine that late move could come between pressing a button and
  letting go. Once the player presses something, the page now stays put.
- A round fits on the screen of a board, 1280 × 600 or 960 × 540 below the bar of a page, also once answered: the hint
  goes beside the sum, the help beside the jumps and the message beside «Next». Before, an answer made the round taller
  than the screen.
- Full screen holds the whole round, with the text as large as the height allows, and a button to come out of it: H5P
  hides its own there, and a board has no Esc key.
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
