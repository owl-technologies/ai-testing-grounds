export interface ToolExecutionContext {
  compileJscad(source: string): Promise<unknown>;
  writeRenderOutput(writeFile: (outputPath: string) => void): string | undefined;
}

export type ToolDescriptor = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      required: string[];
      properties: Record<string, { type: string; description: string }>;
    };
  };
};

export interface ToolDefinition {
  descriptor: ToolDescriptor;
  run(args: Record<string, unknown>, context: ToolExecutionContext): Promise<string>;
}
