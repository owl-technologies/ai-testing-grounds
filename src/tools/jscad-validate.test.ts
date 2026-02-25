import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jscad-validate.test.'));
  try {
    const okPath = path.join(tempDir, 'valid.jscad');
    await fs.writeFile(okPath, validSource, 'utf-8');
    const okResult = await jscadValidateTool.run({ file: okPath });
    const okParsed = JSON.parse(okResult);
    assert.equal(okParsed.ok, true, 'Expected valid source to pass validation');

    const badPath = path.join(tempDir, 'invalid.jscad');
    await fs.writeFile(badPath, invalidSource, 'utf-8');
    const badResult = await jscadValidateTool.run({ file: badPath });
    const badParsed = JSON.parse(badResult);
    assert.equal(badParsed.ok, false, 'Expected invalid source to fail validation');

    const syntaxPath = path.join(tempDir, 'syntax.jscad');
    await fs.writeFile(syntaxPath, invalidSyntaxSource, 'utf-8');
    const syntaxResult = await jscadValidateTool.run({ file: syntaxPath });
    const syntaxParsed = JSON.parse(syntaxResult);
    assert.equal(syntaxParsed.ok, false, 'Expected syntax error to fail validation');
    assert.ok(syntaxParsed.error && typeof syntaxParsed.error === 'string', 'Expected syntax error to include a message');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
