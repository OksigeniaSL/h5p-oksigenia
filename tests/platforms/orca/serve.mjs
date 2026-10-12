// Serves the Spanish example wheel with the H5P engine of @lumieducation/h5p-server and the H5P core of the dev server
// (.h5p-dev), in the page itself, for the Orca check. Prints the URL and runs until it is stopped.
//
//   node tests/platforms/orca/serve.mjs [--port 8093]
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import * as LumiH5P from '@lumieducation/h5p-server';
import { h5pAjaxExpressRouter } from '@lumieducation/h5p-express';
import express from 'express';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packages, ROOT } from '../../../tools/packages.mjs';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8093;
const core = join(ROOT, '.h5p-dev', 'libraries', 'h5p-php-library');
const wheel = packages().find((p) => p.name === 'alphabet-wheel');
const work = mkdtempSync(join(tmpdir(), 'h5p-orca-'));
const config = new LumiH5P.H5PConfig(undefined, { baseUrl: '/h5p', contentUserStateSaveInterval: false });
const editor = LumiH5P.fs(config, join(work, 'libraries'), join(work, 'tmp'), join(work, 'content'));
const user = { id: '1', name: 'Lucía Pruebas', email: 'alumno1@example.org', type: 'local',
  canInstallRecommended: true, canUpdateAndInstallLibraries: true, canCreateRestricted: true };
const pkg = readFileSync(join(ROOT, 'dist', `alphabet-wheel-${wheel.version}-es.h5p`));
const { metadata, parameters } = await editor.uploadPackage(pkg, user);
const contentId = await editor.saveOrUpdateContent(undefined, parameters, metadata,
  `H5P.AlphabetWheel ${wheel.library.majorVersion}.${wheel.library.minorVersion}`, user);
const player = new LumiH5P.H5PPlayer(editor.libraryStorage, editor.contentStorage, config);

const app = express();
app.use((req, res, next) => {
  req.user = user;
  next();
});
app.use('/h5p', h5pAjaxExpressRouter(editor, core, join(core, '..', 'h5p-editor-php-library')));
app.get('/play', async (req, res) => {
  const html = await player.render(contentId, user, 'es');
  res.send(html.replace('<html', '<html lang="es"'));
});
app.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/play`));
