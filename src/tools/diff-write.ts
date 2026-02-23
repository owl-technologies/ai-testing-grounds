import fs from 'fs/promises';
import { ToolDefinition, ToolDescriptor } from "../config";


const descriptor: ToolDescriptor = {
  type: 'function',
  function: {
    name: 'diff-write',
    description: 'Return a simple line diff between two strings and write the updated content to disk.',
    parameters: {
      type: 'object',
      required: ['before', 'after', 'path'],
      properties: {
        before: {
          type: 'string',
          description: 'Original content to diff from (can be empty).',
        },
        after: {
          type: 'string',
          description: 'Updated content to diff to (can be empty).',
        },
        path: {
          type: 'string',
          description: 'Optional output path to write. Defaults to the tool context output path.',
        },
      },
    },
  },
};

const run = async (args: Record<string, unknown>): Promise<string> => {
  if (typeof args.before !== 'string') {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "before" must be a string.' });
  }
  if (typeof args.after !== 'string') {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "after" must be a string.' });
  }

  const before = args.before;
  const after = args.after;
  const beforeLines = before.length ? before.split(/\r?\n/) : [];
  const afterLines = after.length ? after.split(/\r?\n/) : [];
  const diffLines: string[] = [];

  const candidatePath = (args?.path as string)?.trim() 
  if (!candidatePath) {
    return JSON.stringify({ ok: false, error: 'No file path provided for diff-write.' });
  }

  for (const line of beforeLines) {
    diffLines.push(`-${line}`);
  }
  for (const line of afterLines) {
    diffLines.push(`+${line}`);
  }

  const readExistingFile = async (targetPath: string): Promise<string> => {
    try {
      return await fs.readFile(targetPath, 'utf-8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  };
  const existingContent = await readExistingFile(candidatePath);

  try {
    await fs.writeFile(candidatePath, after, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ ok: false, error: `Unable to write file: ${message}` });
  }

  const finalContent = await readExistingFile(candidatePath);
  return JSON.stringify({
    ok: true,
    file: finalContent,
  });
};

export const diffWriteTool: ToolDefinition = {
  descriptor,
  run,
};
