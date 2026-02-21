import { Module } from 'module';
import path from 'path';
import { ToolDefinition, ToolDescriptor, ToolExecutionContext } from './types';

const descriptor: ToolDescriptor = {
  type: 'function',
  function: {
    name: 'jscad-validate',
    description: 'Validate JSCAD by executing it and returning any errors.',
    parameters: {
      type: 'object',
      required: ['source'],
      properties: {
        source: {
          type: 'string',
          description: 'Full JSCAD source code to validate.',
        },
      },
    },
  },
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const run = async (args: Record<string, unknown>, context: ToolExecutionContext): Promise<string> => {
  const source = typeof args.source === 'string' ? args.source.trim() : '';
  if (!source) {
    return JSON.stringify({ ok: false, error: 'Invalid tool input: "source" must be a non-empty string.' });
  }
  try {
    await context.compileJscad(source);
    return JSON.stringify({ ok: true, error: null });
  } catch (error) {
    return JSON.stringify({ ok: false, error: formatError(error) });
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
  return Promise.resolve(mainFn({}));
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