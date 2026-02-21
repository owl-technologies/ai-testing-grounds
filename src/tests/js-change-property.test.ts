import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { jsChangePropertyTool } from '../tools/ai-agent/js-change-property';

const initialSource = `class MyClass {
  constructor() {
    this.value = 1;
  }

  foo() {
    return this.value;
  }
}

function main() {
  return 1;
}

const obj = {
  bar() {
    return 2;
  },
};

module.exports = { MyClass, main, obj };
`;

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tools-'));
  const filePath = path.join(tempDir, 'sample.js');
  fs.writeFileSync(filePath, initialSource, 'utf-8');

  const constructorResult = await jsChangePropertyTool.run(
    {
      filePath,
      target: 'MyClass.constructor',
      replacement: 'this.value = 42;\nthis.extra = true;'
    },
    {
      compileJscad: async () => ({}),
      writeRenderOutput: (_writeFile) => undefined,
    }
  );
  const constructorParsed = JSON.parse(constructorResult);
  assert.equal(constructorParsed.ok, true, 'Expected constructor replacement to succeed');

  const afterConstructor = fs.readFileSync(filePath, 'utf-8');
  assert.ok(afterConstructor.includes('this.value = 42;'), 'Expected constructor body to be updated');
  assert.ok(afterConstructor.includes('this.extra = true;'), 'Expected constructor body to include new statement');

  const mainResult = await jsChangePropertyTool.run(
    {
      filePath,
      target: 'main',
      replacement: 'function main() { return 7; }'
    },
    {
      compileJscad: async () => ({}),
      writeRenderOutput: (_writeFile) => undefined,
    }
  );
  const mainParsed = JSON.parse(mainResult);
  assert.equal(mainParsed.ok, true, 'Expected main replacement to succeed');

  const afterMain = fs.readFileSync(filePath, 'utf-8');
  assert.ok(afterMain.includes('function main() { return 7; }'), 'Expected main replacement to update function declaration');

  const emptyPath = path.join(tempDir, 'empty.jscad');
  fs.writeFileSync(emptyPath, '', 'utf-8');
  const fileResult = await jsChangePropertyTool.run(
    {
      filePath: emptyPath,
      target: 'file',
      replacement: 'const main = () => 1;\nmodule.exports = { main };',
    },
    {
      compileJscad: async () => ({}),
      writeRenderOutput: (_writeFile) => undefined,
    }
  );
  const fileParsed = JSON.parse(fileResult);
  assert.equal(fileParsed.ok, true, 'Expected whole-file replacement to succeed');

  const afterFile = fs.readFileSync(emptyPath, 'utf-8');
  assert.ok(afterFile.includes('module.exports = { main }'), 'Expected file replacement to write new content');
}

run()
  .then(() => {
    console.log('js-change-property tests passed');
  })
  .catch((error) => {
    console.error('js-change-property tests failed');
    console.error(error);
    process.exitCode = 1;
  });
