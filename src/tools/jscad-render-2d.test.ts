import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { jscadRender2dTool } from './jscad-render-2d';

async function run() {
  const sourcePath = path.join(process.cwd(), 'jscad', 'hip-implant.jscad');
  const outputPath = path.join(process.cwd(), 'jscad', 'hip-implant.render.png');
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  const renderResult = await jscadRender2dTool.run({ file: sourcePath });
  const okParsed = JSON.parse(renderResult);
  assert.equal(okParsed.ok, true, `Expected render to succeed but got error: ${okParsed.error ?? 'unknown'}`);
  assert.equal(okParsed.path, outputPath, 'Expected render to return the expected output path');
  assert.ok(fs.existsSync(outputPath), 'Expected render output file to exist');

  const badResult = await jscadRender2dTool.run({ file: '' });
  const badParsed = JSON.parse(badResult);
  assert.equal(badParsed.ok, false, 'Expected empty source to fail rendering');
}

run()
  .then(() => {
    console.log('jscad-render-2d tests passed');
  })
  .catch((error) => {
    console.error('jscad-render-2d tests failed');
    console.error(error);
    process.exitCode = 1;
  });
