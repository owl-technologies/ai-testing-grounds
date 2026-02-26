import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { applyPatchTool } from './apply-patch';

const initialContent = 'line1\nline2\nline3\n';
const updatedContent = 'line1\nline2b\nline3\n';

async function run() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apply-patch.test.'));
  try {
    const filePath = path.join(tempDir, 'example.jscad');
    await fs.writeFile(filePath, initialContent, 'utf-8');

    const updatePatch = [
      '*** Begin Patch',
      `*** Update File: ${filePath}`,
      '@@',
      ' line1',
      '-line2',
      '+line2b',
      ' line3',
      '*** End Patch',
    ].join('\n');

    const updateResult = await applyPatchTool.run({ patch: updatePatch });
    const updateParsed = JSON.parse(updateResult);
    assert.equal(updateParsed.ok, true, 'Expected update patch to succeed');
    assert.equal(updateParsed.file, updatedContent, 'Expected apply-patch to return updated content');

    const updatedFile = await fs.readFile(filePath, 'utf-8');
    assert.equal(updatedFile, updatedContent, 'Expected file contents to be updated');

    const addedPath = path.join(tempDir, 'added.jscad');
    const addPatch = [
      '*** Begin Patch',
      `*** Add File: ${addedPath}`,
      '+alpha',
      '+beta',
      '*** End Patch',
    ].join('\n');

    const addResult = await applyPatchTool.run({ patch: addPatch });
    const addParsed = JSON.parse(addResult);
    assert.equal(addParsed.ok, true, 'Expected add patch to succeed');
    assert.equal(addParsed.file, 'alpha\nbeta\n', 'Expected add patch to return file content');

    const addedFile = await fs.readFile(addedPath, 'utf-8');
    assert.equal(addedFile, 'alpha\nbeta\n', 'Expected new file to be created');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

run()
  .then(() => {
    console.log('apply-patch tests passed');
  })
  .catch((error) => {
    console.error('apply-patch tests failed');
    console.error(error);
    process.exitCode = 1;
  });
