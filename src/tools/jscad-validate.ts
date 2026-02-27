import { Module } from 'module';
import path from 'path';
import { ToolDefinition } from '../config';
import { Tool } from 'ollama';

const descriptor: Tool = {
  type: 'function',
  function: {
    name: 'jscad-validate',
    description: 'Validate JSCAD by executing it and returning any errors.',
    parameters: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          description: 'Path to the JSCAD file to validate.',
        },
      },
    },
  },
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const run = async (args: Record<string, unknown>): Promise<{ response: string }> => {
  const file = typeof args.file === 'string' ? args.file.trim() : '';
  if (!file) {
    return { response: JSON.stringify({ ok: false, error: 'Invalid tool input: "file" must be a non-empty string.' }) };
  }
  try {
    const fs = await import('fs/promises');
    const source = await fs.readFile(file, 'utf-8');
    await compileJscad(source);
    return { response: JSON.stringify({ ok: true, error: null }) };
  } catch (error) {
    return { response: JSON.stringify({ ok: false, error: formatError(error) }) };
  }
};

export const jscadValidateTool: ToolDefinition = {
  descriptor,
  run,
};


export const compileJscad = (source: string): Promise<unknown> => {
  const moduleFile = 'agent.jscad';
  const moduleWithPaths = Module as typeof Module & { _nodeModulePaths(from: string): string[] };
  const sandbox = new Module(moduleFile) as Module & { _compile(code: string, filename: string): void };
  sandbox.paths = moduleWithPaths._nodeModulePaths(process.cwd());
  sandbox.filename = path.resolve(moduleFile);
  sandbox._compile(source, sandbox.filename);
  const exported = sandbox.exports;
  const mainFn = resolveMainFunction(exported);
  let params: Record<string, unknown> = {};
  if (exported && typeof exported === 'object') {
    const exportsObj = exported as Record<string, unknown>;
    const getParameterDefinitions = exportsObj.getParameterDefinitions;
    if (typeof getParameterDefinitions === 'function') {
      const definitions = getParameterDefinitions();
      if (Array.isArray(definitions)) {
        params = {};
        for (const definition of definitions) {
          if (!definition || typeof definition !== 'object') {
            continue;
          }
          const defObj = definition as Record<string, unknown>;
          const name = defObj.name;
          if (typeof name !== 'string' || name.length === 0) {
            continue;
          }
          if (defObj.initial !== undefined) {
            params[name] = defObj.initial;
          } else if (defObj.default !== undefined) {
            params[name] = defObj.default;
          } else if (defObj.value !== undefined) {
            params[name] = defObj.value;
          }
        }
      }
    }
  }
  return Promise.resolve(mainFn(params));
}

export const resolveMainFunction = (moduleExports: unknown): (params: Record<string, unknown>) => unknown => {
  if (typeof moduleExports === 'function') {
    return moduleExports as (params: Record<string, unknown>) => unknown;
  }
  if (moduleExports && typeof moduleExports === 'object') {
    const exportsObj = moduleExports as Record<string, unknown>;
    if (typeof exportsObj.main === 'function') {
      return exportsObj.main as (params: Record<string, unknown>) => unknown;
    }
    if (typeof exportsObj.default === 'function') {
      return exportsObj.default as (params: Record<string, unknown>) => unknown;
    }
  }
  throw new Error('No main function exported from JSCAD source.');
}
