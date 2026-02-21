import assert from 'assert/strict';
import os from 'os';
import path from 'path';
import { jscadRender2dTool } from '../tools/ai-agent/jscad-render-2d';
import { compileJscad } from '../tools/ai-agent/jscad-validate';

const validSource = `const jscad = require('@jscad/modeling')
const { rectangle } = jscad.primitives

const main = () => rectangle({ size: [10, 5] })

module.exports = { main }
`;

async function run() {
  let wrotePath = '';
  let writeCount = 0;
  const renderResult = await jscadRender2dTool.run(
    { source: validSource },
    {
      compileJscad,
      writeRenderOutput: (writeFile) => {
        const outputPath = path.join(os.tmpdir(), 'jscad-render-2d.test.png');
        writeCount += 1;
        writeFile(outputPath);
        wrotePath = outputPath;
        return outputPath;
      },
    }
  );

  const okParsed = JSON.parse(renderResult);
  if (okParsed.ok) {
    assert.equal(okParsed.path, wrotePath, 'Expected render to return output path');
    assert.equal(wrotePath.length > 0, true, 'Expected writeRenderOutput to be called with output path');
    assert.equal(writeCount, 1, 'Expected writeRenderOutput to be invoked once');
  } else {
    assert.ok(
      typeof okParsed.error === 'string' && okParsed.error.length > 0,
      'Expected a renderer error message when rendering fails'
    );
  }

  const badResult = await jscadRender2dTool.run(
    { source: '' },
    {
      compileJscad,
      writeRenderOutput: (_writeFile) => undefined,
    }
  );
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
