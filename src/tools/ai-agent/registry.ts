import { ToolDefinition, ToolDescriptor, ToolExecutionContext } from './types';
import { jscadRender2dTool } from './jscad-render-2d';
import { jscadValidateTool } from './jscad-validate';
import { jsChangePropertyTool } from './js-change-property';

const toolDefinitions: ToolDefinition[] = [
  jscadValidateTool,
  jscadRender2dTool,
  jsChangePropertyTool,
];

const toolMap = new Map(toolDefinitions.map((tool) => [tool.descriptor.function.name, tool]));

export const getAgentToolSchemas = (): ToolDescriptor[] => toolDefinitions.map((tool) => tool.descriptor);

export const executeAgentTool = (
  name: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<string> => {
  const tool = toolMap.get(name);
  if (!tool) {
    return Promise.resolve(JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }));
  }
  return tool.run(args, context);
};

export const isAgentTool = (name: string): boolean => toolMap.has(name);
