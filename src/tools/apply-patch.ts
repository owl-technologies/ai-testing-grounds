import fs from 'fs/promises';
import path from 'path';
import { ToolDefinition } from '../config';
import { Tool } from 'ollama';

const descriptor: Tool = {
  type: 'function',
  function: {
    name: 'apply-patch',
    description: 'Apply a patch to edit files (FREEFORM patch input).',
    parameters: {
      type: 'object',
      required: ['patch'],
      properties: {
        patch: {
          type: 'string',
          description: 'Unified patch text starting with "*** Begin Patch".',
        },
      },
    },
  },
};

type ChangeLine = { type: 'context' | 'add' | 'remove'; text: string };

type AddHunk = { type: 'add'; file: string; lines: string[] };

type DeleteHunk = { type: 'delete'; file: string };

type UpdateHunk = {
  type: 'update';
  file: string;
  moveTo?: string;
  chunks: ChangeLine[][];
  noTrailingNewline: boolean;
};

type PatchHunk = AddHunk | DeleteHunk | UpdateHunk;

const run = async (args: Record<string, unknown>): Promise<string> => {
  const patchInput = typeof args?.patch === 'string' ? args.patch : '';
  if (!patchInput.trim()) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "patch" must be a non-empty string.' });
  }

  const lines = patchInput.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') {
    i += 1;
  }
  if (i >= lines.length || lines[i] !== '*** Begin Patch') {
    return JSON.stringify({ ok: false, error: 'Invalid patch: missing "*** Begin Patch" header.' });
  }
  i += 1;

  const hunks: PatchHunk[] = [];
  let sawEndPatch = false;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (line === '*** End Patch') {
      sawEndPatch = true;
      i += 1;
      break;
    }
    if (line.startsWith('*** Add File: ')) {
      const file = line.slice('*** Add File: '.length).trim();
      if (!file) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: missing path in "*** Add File" header.' });
      }
      i += 1;
      const addLines: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        if (current.startsWith('*** ') && !current.startsWith('*** End of File')) {
          break;
        }
        if (!current.startsWith('+')) {
          return JSON.stringify({ ok: false, error: 'Invalid patch: add file lines must start with "+".' });
        }
        addLines.push(current.slice(1));
        i += 1;
      }
      if (addLines.length === 0) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: add file hunk has no content.' });
      }
      hunks.push({ type: 'add', file, lines: addLines });
      continue;
    }
    if (line.startsWith('*** Delete File: ')) {
      const file = line.slice('*** Delete File: '.length).trim();
      if (!file) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: missing path in "*** Delete File" header.' });
      }
      i += 1;
      hunks.push({ type: 'delete', file });
      continue;
    }
    if (line.startsWith('*** Update File: ')) {
      const file = line.slice('*** Update File: '.length).trim();
      if (!file) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: missing path in "*** Update File" header.' });
      }
      i += 1;
      let moveTo: string | undefined;
      if (i < lines.length && lines[i].startsWith('*** Move to: ')) {
        moveTo = lines[i].slice('*** Move to: '.length).trim();
        if (!moveTo) {
          return JSON.stringify({ ok: false, error: 'Invalid patch: missing path in "*** Move to" header.' });
        }
        i += 1;
      }
      const chunks: ChangeLine[][] = [];
      let currentChunk: ChangeLine[] = [];
      let noTrailingNewline = false;
      while (i < lines.length) {
        const current = lines[i];
        if (current.startsWith('*** ') && !current.startsWith('*** End of File')) {
          break;
        }
        if (current === '*** End of File') {
          noTrailingNewline = true;
          i += 1;
          continue;
        }
        if (current === '@@' || current.startsWith('@@ ')) {
          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
          }
          i += 1;
          continue;
        }
        const prefix = current[0];
        if (prefix !== ' ' && prefix !== '+' && prefix !== '-') {
          return JSON.stringify({ ok: false, error: `Invalid patch line prefix: "${prefix}".` });
        }
        const type = prefix === ' ' ? 'context' : prefix === '+' ? 'add' : 'remove';
        currentChunk.push({ type, text: current.slice(1) });
        i += 1;
      }
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      hunks.push({ type: 'update', file, moveTo, chunks, noTrailingNewline });
      continue;
    }

    return JSON.stringify({ ok: false, error: `Invalid patch: unexpected line "${line}".` });
  }

  if (!sawEndPatch) {
    return JSON.stringify({ ok: false, error: 'Invalid patch: missing "*** End Patch" footer.' });
  }

  const ensureDir = async (filePath: string) => {
    const dir = path.dirname(filePath);
    if (dir && dir !== '.') {
      await fs.mkdir(dir, { recursive: true });
    }
  };

  const changedFiles: Record<string, string> = {};
  const deletedFiles: string[] = [];

  for (const hunk of hunks) {
    if (hunk.type === 'add') {
      try {
        await fs.stat(hunk.file);
        return JSON.stringify({ ok: false, error: `Unable to add file: "${hunk.file}" already exists.` });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error as any).code !== 'ENOENT') {
          const message = error instanceof Error ? error.message : String(error);
          return JSON.stringify({ ok: false, error: `Unable to add file: ${message}` });
        }
      }
      await ensureDir(hunk.file);
      const content = `${hunk.lines.join('\n')}\n`;
      try {
        await fs.writeFile(hunk.file, content, 'utf-8');
        changedFiles[hunk.file] = content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ ok: false, error: `Unable to write file: ${message}` });
      }
      continue;
    }

    if (hunk.type === 'delete') {
      try {
        await fs.unlink(hunk.file);
        deletedFiles.push(hunk.file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ ok: false, error: `Unable to delete file: ${message}` });
      }
      continue;
    }

    let currentContent = '';
    try {
      currentContent = await fs.readFile(hunk.file, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ ok: false, error: `Unable to read file: ${message}` });
    }

    const hadTrailingNewline = currentContent.endsWith('\n');
    const sourceLines = currentContent.length ? currentContent.split(/\r?\n/) : [];
    if (hadTrailingNewline && sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === '') {
      sourceLines.pop();
    }

    let workingLines = sourceLines;
    let searchStart = 0;

    for (const chunk of hunk.chunks) {
      const matchLines = chunk.filter((line) => line.type !== 'add').map((line) => line.text);
      let matchIndex = -1;
      if (matchLines.length === 0) {
        matchIndex = workingLines.length;
      } else {
        for (let idx = searchStart; idx <= workingLines.length - matchLines.length; idx += 1) {
          let matched = true;
          for (let offset = 0; offset < matchLines.length; offset += 1) {
            if (workingLines[idx + offset] !== matchLines[offset]) {
              matched = false;
              break;
            }
          }
          if (matched) {
            matchIndex = idx;
            break;
          }
        }
      }
      if (matchIndex === -1) {
        return JSON.stringify({ ok: false, error: 'Invalid patch: context does not match file contents.' });
      }

      const output: string[] = [];
      output.push(...workingLines.slice(0, matchIndex));
      let sourceIndex = matchIndex;
      let outputCount = 0;

      for (const line of chunk) {
        if (line.type === 'add') {
          output.push(line.text);
          outputCount += 1;
          continue;
        }
        if (sourceIndex >= workingLines.length) {
          return JSON.stringify({ ok: false, error: 'Invalid patch: hunk exceeds file length.' });
        }
        const currentLine = workingLines[sourceIndex];
        if (currentLine !== line.text) {
          return JSON.stringify({ ok: false, error: 'Invalid patch: context does not match file contents.' });
        }
        if (line.type === 'context') {
          output.push(currentLine);
          outputCount += 1;
        }
        sourceIndex += 1;
      }

      output.push(...workingLines.slice(sourceIndex));
      workingLines = output;
      searchStart = matchIndex + outputCount;
    }

    let updatedContent = workingLines.join('\n');
    if (hadTrailingNewline && !hunk.noTrailingNewline) {
      updatedContent += '\n';
    }

    const targetPath = hunk.moveTo && hunk.moveTo.length > 0 ? hunk.moveTo : hunk.file;
    try {
      await ensureDir(targetPath);
      await fs.writeFile(targetPath, updatedContent, 'utf-8');
      changedFiles[targetPath] = updatedContent;
      if (targetPath !== hunk.file) {
        await fs.unlink(hunk.file);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ ok: false, error: `Unable to write file: ${message}` });
    }
  }

  const changedKeys = Object.keys(changedFiles);
  if (changedKeys.length === 1 && deletedFiles.length === 0) {
    return JSON.stringify({ ok: true, file: changedFiles[changedKeys[0]] });
  }
  const response: { ok: true; files?: Record<string, string>; deleted?: string[] } = { ok: true };
  if (changedKeys.length > 0) {
    response.files = changedFiles;
  }
  if (deletedFiles.length > 0) {
    response.deleted = deletedFiles;
  }
  return JSON.stringify(response);
};

export const applyPatchTool: ToolDefinition = {
  descriptor,
  run,
};
