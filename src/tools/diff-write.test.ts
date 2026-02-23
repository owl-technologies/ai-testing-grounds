import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { diffWriteTool } from './diff-write';

const initialContent = 'line1\nline2';
const updatedContent = 'line1\nline3';

async function run() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-write.test.'));
  const filePath = path.join(tempDir, 'wheel.jscad');
  await fs.writeFile(filePath, initialContent, 'utf-8');

  try {
    const result = await diffWriteTool.run({
      before: initialContent,
      after: updatedContent,
      path: filePath,
    });

    const parsed = JSON.parse(result);
    assert.equal(parsed.ok, true, 'Expected diff-write tool to succeed');
    assert.equal(parsed.file, updatedContent, 'Expected diff-write to return the modified file');

    const fileContents = await fs.readFile(filePath, 'utf-8');
    assert.equal(fileContents, updatedContent, 'Expected file contents to be overwritten');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

run()
  .then(() => {
    console.log('diff-write tests passed');
  })
  .catch((error) => {
    console.error('diff-write tests failed');
    console.error(error);
    process.exitCode = 1;
  });
