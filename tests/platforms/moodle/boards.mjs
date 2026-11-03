// Classroom boards, inside a Moodle activity: at 1280×600, 960×540 and 1366×768 (what boards measured in a school leave
// to the page, and a Chromebook mirrored on one), the game in play fits under Moodle's fixed bar, before and after an
// answer; the full-screen button of H5P puts it on the whole screen, and the game's own button brings it back, since
// H5P hides its buttons in full screen and a board has no Esc key. tests/boards/boards.mjs checks the same outside an
// LMS, and with the styles of an old browser.
//
// @copyright 2026 Oksigenia SL <dev@oksigenia.cc>
// @license   MIT

/** @type {[number, number][]} */
export const BOARD_SIZES = [[1280, 600], [960, 540], [1366, 768]];
/** Moodle's fixed top bar. */
const BAR = 60;

/**
 * @param {Object} o
 * @param {import('@playwright/test').Page} o.page
 * @param {import('@playwright/test').FrameLocator} o.game The frame of the game.
 * @param {string} o.root The root element of the game (`.aw`, `.nl`).
 * @param {() => Promise<void>} o.open Opens the activity.
 * @param {() => Promise<void>} o.start Starts or takes up a game.
 * @param {() => Promise<void>} o.answer Answers once.
 * @param {() => Promise<void>} o.leave Leaves the game so the next opening starts clean.
 * @param {(name: string, ok: boolean, detail?: string) => void} o.check
 * @param {string} o.shots Folder for screenshots.
 * @param {string} o.name Short name for the screenshots.
 */
export async function boardChecks({ page, game, root, open, start, answer, leave, check, shots, name }) {
  const height = (locator) => locator.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  const fullScreen = () => page.evaluate(() => !!document.fullscreenElement);
  for (const [width, tall] of BOARD_SIZES) {
    await page.setViewportSize({ width, height: tall });
    await open();
    await start();
    await page.waitForTimeout(800);
    const playing = await height(game.locator(root));
    check(`board ${width}×${tall}: the game in play fits under Moodle's bar`, playing <= tall - BAR, `${playing} of ${tall - BAR} px`);
    await answer();
    await page.waitForTimeout(800);
    const answered = await height(game.locator(root));
    check(`board ${width}×${tall}: and after an answer`, answered <= tall - BAR, `${answered} of ${tall - BAR} px`);
    await page.screenshot({ path: `${shots}/moodle-${name}-board-${width}x${tall}.png` });

    await game.locator('.h5p-enable-fullscreen').click();
    await page.waitForTimeout(1200);
    const inside = await game.locator(root).evaluate((node) => ({
      bottom: Math.round(node.getBoundingClientRect().bottom), screen: window.innerHeight,
    }));
    check(`board ${width}×${tall}: full screen holds the whole game`, await fullScreen() && inside.bottom <= inside.screen + 1,
      `ends at ${inside.bottom} of ${inside.screen}`);
    await page.screenshot({ path: `${shots}/moodle-${name}-board-${width}x${tall}-full.png` });
    await game.locator(`${root}-exit-full`).click();
    await page.waitForTimeout(1200);
    check(`board ${width}×${tall}: the game's own button leaves full screen`, !await fullScreen()
      && !await game.locator('.h5p-fullscreen').count());
    await leave();
  }
  await page.setViewportSize({ width: 1200, height: 1000 });
}
