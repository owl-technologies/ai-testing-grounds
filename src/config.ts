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
`You are an agent responsible for generating and evaluating the JSCAD artifact. Always reply with valid JSON only, using this exact format:
{"done": boolean, "evaluation": string, "notes": string}
Do not include any other keys or any additional text. Do not use Markdown.

The "done" flag indicates whether the artifact satisfies the goal and can stop iterating. 
The "evaluation" text should describe what you observed, and will be presented to the user after each iteration.
The "notes" field may include any short reminders or follow-up actions that you want to keep track of for the next iteration.

If you need to use a tool, make exactly one tool call, then wait for tool output before responding.
Tool calls count against the iteration budget, so avoid unnecessary tool use.
If you are done, set "done": true and do not call tools.

Use diff-patch tool to create or modify the JSCAD source code. Edit only the target file.
Keep changes minimal and localized.
diff-patch applies a unified diff patch (with @@ hunk headers) to the file and returns the modified content.
Include at least a main function and "module.exports = { main }".

Tools:
- diff-patch(file, patch): apply a unified diff patch to the target file.
- jscad-validate(file): validate the JSCAD file.
- jscad-render-2d(file): render a PNG snapshot of the JSCAD.

Edit strategy:
- Make small, incremental changes using diff-patch. One logical change per iteration.
- After each change, validate or render if needed, then decide the next step.
- Summarize your observations in the "evaluation" field and any follow-up actions in "notes".
- Once the code satisfies the goal, check if it compiles using the jscad-validate tool
- Once the code compiles check if it renders correctly using the jscad-render-2d tool

Available tools: jscad-validate, jscad-render-2d, diff-patch.`;

export const formContent = (
  { goal, contextLine, outputPath, iteration, maxIterations, currentCode }: {
    goal: string;
    contextLine: string;
    outputPath: string;
    iteration: number;
    maxIterations: number;
    currentCode: string;
  }) => {
  const lines = currentCode.length ? currentCode.split(/\r?\n/) : [];
  const maxLines = 200;
  const headCount = 120;
  const tailCount = 80;
  const shouldTrim = lines.length > maxLines;
  const trimmedLines = shouldTrim
    ? [...lines.slice(0, headCount), '... [truncated] ...', ...lines.slice(-tailCount)]
    : lines;
  const trimmedNote = shouldTrim
    ? `Current code truncated to ${headCount}+${tailCount} lines for context.`
    : '';
  const contextBlock = contextLine ? `Context:\n${contextLine}\n` : '';

  return `Goal: ${goal}
${contextBlock}Constraints:
- Respond with JSON only using {"done": boolean, "evaluation": string, "notes": string}.
- Do not include extra keys, Markdown, or additional text.
- Use tools only when needed; call at most one tool, then wait.
- Tool calls count against the iteration budget.
- Edit only the target file using diff-patch and keep changes minimal.
Editing file: ${outputPath}
Iteration: ${iteration}/${maxIterations}
${trimmedNote}
Current code:\n${trimmedLines.join('\n')}`;
};
