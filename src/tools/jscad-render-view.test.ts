import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { jscadRenderViewTool } from './jscad-render-view';

async function run() {
  const sourcePath = path.join(process.cwd(), 'jscad', 'hip-implant.jscad');
  const outputPath = path.join(process.cwd(), 'jscad', 'hip-implant.render.png');
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  const renderResult = await jscadRenderViewTool.run({ file: sourcePath });
  const okParsed = JSON.parse(renderResult.response);
  assert.equal(okParsed.ok, true, `Expected render to succeed but got error: ${okParsed.error ?? 'unknown'}`);
  assert.equal(okParsed.path, outputPath, 'Expected render to return the expected output path');
  assert.equal(okParsed.imageBase64, 'attached', 'Expected render to indicate attached image data');
  assert.ok(fs.existsSync(outputPath), 'Expected render output file to exist');
  const base64Payload = okParsed.imageBase64.replace(/^data:image\/png;base64,/, '');
  const decoded = Buffer.from(base64Payload, 'base64');
  assert.ok(decoded.length > 0, 'Expected decoded image buffer to be non-empty');

  const badResult = await jscadRenderViewTool.run({ file: '' });
  const badParsed = JSON.parse(badResult.response);
  assert.equal(badParsed.ok, false, 'Expected empty source to fail rendering');
}

run()
  .then(() => {
    console.log('jscad-render-view tests passed');
  })
  .catch((error) => {
    console.error('jscad-render-view tests failed');
    console.error(error);
    process.exitCode = 1;
  });
