# Contributing to Oksigenia games for H5P

Thanks for taking the time. These games are free software and we want them to stay simple, accessible and useful in
a real classroom. A few things to keep in mind before opening a pull request.

## Code

- One folder per H5P library. What the games share is built into each game, not shipped as a library of its own.
- License header in each source file: MIT, copyright `Oksigenia <dev@oksigenia.cc>`.
- Code, comments and commit messages in **English**. The texts players and authors see live in the translation
  files of each library (`language/*.json`).
- No external services, no CDN, no tracking, no WebP images (H5P does not accept them).
- Nothing may rely on colour alone, and everything must work with the keyboard and a screen reader.

## Before your first commit

Turn on the repository hooks once in your clone:

```
git config core.hooksPath .githooks
```

## Pull requests

- One topic per pull request, with a short explanation of why and how it was tested.
- Reference an issue when one exists.
- Raise the patch version in `library.json` and add a `CHANGELOG.md` entry when the change reaches users.

## Reporting bugs

Open an issue with the game and its version, the platform (Moodle, WordPress, Lumi…) and its version, the browser,
the screen size and a minimal reproduction. A screenshot helps.

## License

By contributing you agree your changes are licensed under the MIT license, the same license as the games.
