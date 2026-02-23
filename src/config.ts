export const OLLAMA_HOST = 'http://192.168.178.208:11434';

export type SingleAgentStepOptions = {
  goal: string;
  context?: string;
  renderPngBase64?: string;
  outputPath: string;
  currentCode: string;
  iteration: number;
  maxIterations: number;
};

export type ToolCall = {
  function?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

export type SingleAgentStepResult = {
  jscad: string;
  done: boolean;
  evaluation: string;
  notes: string;
  raw: string;
  toolOutput?: string;
  toolError?: string;
};

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
  run(args: Record<string, unknown>): Promise<string>;
}