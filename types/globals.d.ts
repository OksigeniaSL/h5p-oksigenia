// Globals the games find on the page: H5P core, and what the tests leave on the window.
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

declare var H5P: any;

interface Window {
  H5P: any;
  statements: any[];
  oscillators: number;
}

declare module '*.css';
