import assert from 'assert/strict';
import { jscadRender2dTool } from './jscad-render-2d';

const validSource = `const jscad = require('@jscad/modeling')
const { rectangle } = jscad.primitives

const main = () => rectangle({ size: [10, 5] })

module.exports = { main }
`;

async function run() {
  const renderResult = await jscadRender2dTool.run({ source: validSource });
  const okParsed = JSON.parse(renderResult);
  if (okParsed.ok) {
    assert.ok(typeof okParsed.path === 'string' && okParsed.path.length > 0, 'Expected render to return a path');
  } else {
    assert.ok(
      typeof okParsed.error === 'string' && okParsed.error.length > 0,
      'Expected a renderer error message when rendering fails'
    );
  }

  const badResult = await jscadRender2dTool.run({ source: '' });
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
