import assert from 'assert/strict';
import { jscadValidateTool } from './jscad-validate';

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

const invalidSyntaxSource = `const jscad = require('@jscad/modeling')
const { cuboid } = jscad.primitives

const main = () => {
  return cuboid({ size: [1, 1, 1] })

module.exports = { main }
`;

async function run() {
  const okResult = await jscadValidateTool.run({ source: validSource });
  const okParsed = JSON.parse(okResult);
  assert.equal(okParsed.ok, true, 'Expected valid source to pass validation');

  const badResult = await jscadValidateTool.run({ source: invalidSource });
  const badParsed = JSON.parse(badResult);
  assert.equal(badParsed.ok, false, 'Expected invalid source to fail validation');

  const syntaxResult = await jscadValidateTool.run({ source: invalidSyntaxSource });
  const syntaxParsed = JSON.parse(syntaxResult);
  assert.equal(syntaxParsed.ok, false, 'Expected syntax error to fail validation');
  assert.ok(syntaxParsed.error && typeof syntaxParsed.error === 'string', 'Expected syntax error to include a message');
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
