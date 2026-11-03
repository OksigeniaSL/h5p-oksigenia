// What the checks of classroom boards share: the sizes, the answers of the example wheel, and the dev server.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../tools/packages.mjs';

/**
 * Boards measured in a school in November 2026 leave 1280×624 to the page with the browser bars, less inside an LMS,
 * and a Moodle activity leaves a game 1115×555 of that. A Chromebook mirrored on a board gives 1366×768, or 1517×717
 * with its size at 90 %.
 * @type {[number, number][]}
 */
export const SIZES = [[1280, 600], [960, 540], [1366, 768], [1517, 717], [1115, 555]];

/**
 * The fixed top bar of an LMS page, which stays over the game when it is scrolled up. 1115×555 is already what is left
 * under it.
 * @param {number} width
 * @returns {number}
 */
export const barAt = (width) => (width === 1115 ? 0 : 60);

export const answers = Object.fromEntries(JSON.parse(readFileSync(
  join(ROOT, 'packages/alphabet-wheel/content/es/content/content.json'), 'utf8',
)).items.map((it) => [it.letter, it.answer]));

/**
 * Starts the dev server of the built games and waits for it.
 * @param {string} port
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
export async function serve(port) {
  const server = spawn(process.execPath, [join(ROOT, 'tools/dev.mjs'), '--port', port, '--no-watch'], { stdio: 'ignore' });
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/view/h5p-alphabet-wheel/alphabet-wheel-es?session=null`)).ok) {
        return server;
      }
    } catch {
      // Not up yet.
    }
    if (i > 240) {
      server.kill();
      throw new Error('the dev server did not start');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
