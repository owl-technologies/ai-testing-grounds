import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { diffPatchTool } from './diff-patch';

const initialContent = 'line1\nline2';
const updatedContent = 'line1\nline3';

async function run() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-patch.test.'));
  const filePath = path.join(tempDir, 'wheel.jscad');
  await fs.writeFile(filePath, initialContent, 'utf-8');
  const patch = [
    '@@ -1,2 +1,2 @@',
    ' line1',
    '-line2',
    '+line3',
  ].join('\n');

  try {
    const result = await diffPatchTool.run({
      file: filePath,
      patch,
    });

    const parsed = JSON.parse(result.response);
    assert.equal(parsed.ok, true, 'Expected diff-patch tool to succeed');
    assert.equal(parsed.file, updatedContent, 'Expected diff-patch to return the modified file');

    const fileContents = await fs.readFile(filePath, 'utf-8');
    assert.equal(fileContents, updatedContent, 'Expected file contents to be patched');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

run()
  .then(() => {
    console.log('diff-patch tests passed');
  })
  .catch((error) => {
    console.error('diff-patch tests failed');
    console.error(error);
    process.exitCode = 1;
  });
