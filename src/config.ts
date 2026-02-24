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

export const SYSTEM_PROMPT = 
`You are an agent responsible for generating and evaluating the JSCAD artifact.
Allways reply with tool call JSON or return JSON in this format:
{"done": boolean, "evaluation": string, "notes": string}. 

Allways return valid JSON, never plain text.

Use diff-write tool to create or modify the JSCAD source code.
diff-write writes its updated file to disk and returns the modified content.
Include at least a main function and "module.exports = { main }".

Edit strategy:
- Make small, incremental changes using diff-write. One logical change per iteration.
- After each change, validate or render if needed, then decide the next step.
- Summarize your observations in the "evaluation" field and any follow-up actions in "notes".
- Once the code satisfies the goal, check if it compiles using the jscad-validate tool
- Once the code compiles check if it renders correctly using the jscad-render-2d tool

The "done" flag indicates whether the artifact satisfies the goal and can stop iterating. 
The "evaluation" text should describe what you observed, and 
"notes" may include any short reminders or follow-up actions.

If you need to compare versions, call the diff-write tool using the tool-calling interface provided by the host.
Available tools: jscad-validate, diff-write.`;

export const formContent = (
  { goal, contextLine, outputPath, iteration, maxIterations, currentCode }: {
    goal: string;
    contextLine: string;
    outputPath: string;
    iteration: number;
    maxIterations: number;
    currentCode: string;
  }) =>
  `Goal ${goal}
${contextLine}
Editing file: ${outputPath}
Iteration: ${iteration}/${maxIterations}
Current code:\n${currentCode}`;