import { colors } from 'kiss-framework';
import { ToolDefinition, ToolRunResult } from '../config';
import { applyPatchTool } from './apply-patch';
import { jscadRenderViewTool } from './jscad-render-view';
import { jscadRenderPerspectiveTool } from './jscad-render-perspective';
import { jscadValidateTool } from './jscad-validate';
import { Tool } from 'ollama';

const toolDefinitions: ToolDefinition[] = [
  jscadValidateTool,
  jscadRenderViewTool,
  jscadRenderPerspectiveTool,
  applyPatchTool,
];

const toolMap = new Map(toolDefinitions.map((tool) => [tool.descriptor.function.name, tool]));

export const getAgentToolSchemas = (): Tool[] => toolDefinitions.map((tool) => tool.descriptor);

export const executeAgentTool = async (
  name: string,
  args: Record<string, unknown>
): Promise<ToolRunResult> => {
  const tool = toolMap.get(name);
  if (!tool) {
    return Promise.resolve({ response: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }) });
  }
  const result = await tool.run(args);
  const resStr = result.response;
  console.debug(
    `Tool "${name}" executed with args:`,
    args,
    'Result:',
    colors.cyan(resStr.substring(0, 500) + (resStr.length > 500 ? '... [truncated]' : ''))
  );
  return result;
};

export const isAgentTool = (name: string): boolean => toolMap.has(name);
