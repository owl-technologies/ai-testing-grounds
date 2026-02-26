import { colors } from 'kiss-framework';
import { ToolDefinition } from '../config';
import { applyPatchTool } from './apply-patch';
import { jscadRender2dTool } from './jscad-render-2d';
import { jscadValidateTool } from './jscad-validate';
import { Tool } from 'ollama';

const toolDefinitions: ToolDefinition[] = [
  jscadValidateTool,
  jscadRender2dTool,
  applyPatchTool,
];

const toolMap = new Map(toolDefinitions.map((tool) => [tool.descriptor.function.name, tool]));

export const getAgentToolSchemas = (): Tool[] => toolDefinitions.map((tool) => tool.descriptor);

export const executeAgentTool = async (
  name: string,
  args: Record<string, unknown>
): Promise<string> => {
  const tool = toolMap.get(name);
  if (!tool) {
    return Promise.resolve(JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }));
  }
  let result = await tool.run(args);
  console.debug(`Tool "${name}" executed with args:`, args, 'Result:', colors.cyan(JSON.stringify(result)));
  return result;
};

export const isAgentTool = (name: string): boolean => toolMap.has(name);
