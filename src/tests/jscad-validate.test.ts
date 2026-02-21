import assert from 'assert/strict';
import { compileJscad, jscadValidateTool } from '../tools/ai-agent/jscad-validate';

const validSource = `const jscad = require('@jscad/modeling')
const { cuboid } = jscad.primitives

const main = () => cuboid({ size: [1, 1, 1] })

module.exports = { main }
`;

const invalidSource = `const jscad = require('@jscad/modeling')
const { cuboid } = jscad.primitives

const notMain = () => cuboid({ size: [1, 1, 1] })

module.exports = { notMain }
`;

async function run() {
  const okResult = await jscadValidateTool.run(
    { source: validSource },
    { compileJscad, writeRenderOutput: (_writeFile) => undefined }
  );
  const okParsed = JSON.parse(okResult);
  assert.equal(okParsed.ok, true, 'Expected valid source to pass validation');

  const badResult = await jscadValidateTool.run(
    { source: invalidSource },
    { compileJscad, writeRenderOutput: (_writeFile) => undefined }
  );
  const badParsed = JSON.parse(badResult);
  assert.equal(badParsed.ok, false, 'Expected invalid source to fail validation');
}

run()
  .then(() => {
    console.log('jscad-validate tests passed');
  })
  .catch((error) => {
    console.error('jscad-validate tests failed');
    console.error(error);
    process.exitCode = 1;
  });
