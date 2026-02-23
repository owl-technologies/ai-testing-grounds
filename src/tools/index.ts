import { colors } from 'kiss-framework';
import { ToolDefinition, ToolDescriptor } from '../config';
import { diffWriteTool } from './diff-write';
import { jscadValidateTool } from './jscad-validate';

const toolDefinitions: ToolDefinition[] = [
  jscadValidateTool,
  diffWriteTool,
];

const toolMap = new Map(toolDefinitions.map((tool) => [tool.descriptor.function.name, tool]));

export const getAgentToolSchemas = (): ToolDescriptor[] => toolDefinitions.map((tool) => tool.descriptor);

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
