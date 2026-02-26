import fs from 'fs/promises';
import { ToolDefinition } from "../config";
import { Tool } from 'ollama';


const descriptor: Tool = {
  type: 'function',
  function: {
    name: 'diff-patch',
    description: `Apply a unified diff patch to the target file. The patch must include at least one hunk header in the form:
@@ -oldStart,oldCount +newStart,newCount @@
Inside hunks, every line must start with "+", "-", or a single leading space.
Do not include "diff -u", "---", or "+++" header lines.
Example input:
{
  "file": "/path/to/file.jscad",
  "patch": "@@ -1,2 +1,2 @@\n-old line 1\n-old line 2\n+new line 1\n+new line 2"
}`,
    parameters: {
      type: 'object',
      required: ['file', 'patch'],
      properties: {
        file: {
          type: 'string',
          description: 'Path to the file to patch.',
        },
        patch: {
          type: 'string',
          description: 'Unified diff patch to apply to the file. Inside hunks, every line must start with "+", "-", or a single leading space.',
        }
      },
    },
  },
};

const run = async (args: Record<string, unknown>): Promise<string> => {
  const file = typeof args.file === 'string' ? args.file.trim() : '';
  if (!file) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "file" must be a non-empty string.' });
  }
  if (typeof args.patch !== 'string') {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "patch" must be a string.' });
  }

  const patch = args.patch;
  let currentContent = '';
  try {
    currentContent = await fs.readFile(file, 'utf-8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as any).code !== 'ENOENT') {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ ok: false, error: `Unable to read file: ${message}` });
    }
  }

  const hadTrailingNewline = currentContent.endsWith('\n');
  const sourceLines = currentContent.length ? currentContent.split(/\r?\n/) : [];
  if (hadTrailingNewline && sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === '') {
    sourceLines.pop();
  }

  const patchLines = patch.length ? patch.split(/\r?\n/) : [];
  const hunks: Array<{ oldStart: number; lines: Array<{ type: 'context' | 'add' | 'remove'; text: string }> }> = [];
  let currentHunk: { oldStart: number; lines: Array<{ type: 'context' | 'add' | 'remove'; text: string }> } | null = null;
  let lastLineType: 'context' | 'add' | 'remove' | null = null;
  let newNoNewline = false;

  for (let i = 0; i < patchLines.length; i += 1) {
    const line = patchLines[i];
    if (line === '' && i === patchLines.length - 1) {
      continue;
    }
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }
    const headerMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (headerMatch) {
      currentHunk = {
        oldStart: Number.parseInt(headerMatch[1], 10),
        lines: [],
      };
      hunks.push(currentHunk);
      lastLineType = null;
      continue;
    }
    if (line.startsWith('\\ No newline at end of file')) {
      if (lastLineType === 'add') {
        newNoNewline = true;
      }
      continue;
    }
    if (!currentHunk) {
      return JSON.stringify({
        ok: false,
        error:
          'Invalid patch: missing hunk header. Example:\n@@ -0,0 +1,1 @@\n+// line 1',
      });
    }
    const prefix = line[0];
    if (prefix !== ' ' && prefix !== '+' && prefix !== '-') {
      return JSON.stringify({ ok: false, error: `Invalid patch line prefix: "${prefix}".` });
    }
    const type = prefix === ' ' ? 'context' : prefix === '+' ? 'add' : 'remove';
    currentHunk.lines.push({ type, text: line.slice(1) });
    lastLineType = type;
  }

  let sourceIndex = 0;
  const outputLines: string[] = [];

  for (const hunk of hunks) {
    const targetIndex = Math.max(hunk.oldStart - 1, 0);
    if (sourceIndex > targetIndex) {
      return JSON.stringify({ ok: false, error: 'Invalid patch: overlapping hunk or out-of-order line numbers.' });
    }
    if (sourceIndex < targetIndex) {
      outputLines.push(...sourceLines.slice(sourceIndex, targetIndex));
      sourceIndex = targetIndex;
    }
    for (const hunkLine of hunk.lines) {
      if (hunkLine.type === 'add') {
        outputLines.push(hunkLine.text);
        continue;
      }
      if (sourceIndex >= sourceLines.length) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: hunk exceeds file length.' });
      }
      const currentLine = sourceLines[sourceIndex];
      if (currentLine !== hunkLine.text) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: context does not match file contents.' });
      }
      if (hunkLine.type === 'context') {
        outputLines.push(currentLine);
      }
      sourceIndex += 1;
    }
  }

  if (sourceIndex < sourceLines.length) {
    outputLines.push(...sourceLines.slice(sourceIndex));
  }

  let updatedContent = outputLines.join('\n');
  if (hadTrailingNewline && !newNoNewline) {
    updatedContent += '\n';
  }

  try {
    await fs.writeFile(file, updatedContent, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ ok: false, error: `Unable to write file: ${message}` });
  }

  return JSON.stringify({
    ok: true,
    file: updatedContent,
  });
};

export const diffPatchTool: ToolDefinition = {
  descriptor,
  run,
};
