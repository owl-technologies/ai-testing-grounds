import { Tool } from "ollama";

export const OLLAMA_HOST = 'http://192.168.178.208:11434';

export type SingleAgentStepOptions = {
  goal: string;
  context?: string;
  outputPath: string;
  currentCode: string;
  iteration: number;
  maxIterations: number;
};

export type SingleAgentStepResult = {
  done: boolean;
  evaluation: string;
  notes: string;
  raw: string;
  toolOutput?: string;
  toolError?: string;
};

export interface ToolDefinition {
  descriptor: Tool;
  run(args: Record<string, unknown>): Promise<ToolRunResult>;
}

export type ToolRunResult = {
  response: string;
  images?: string[];
};

export const SYSTEM_PROMPT = 
`You are an agent responsible for interacting with user and generating and evaluating the JSCAD artifact. 
Always reply with valid JSON only, using this exact format:
{"done": boolean, "evaluation": string, "notes": string}
Do not include any other keys or any additional text. Do not use Markdown.

The "done" flag indicates whether the artifact satisfies the goal and can stop iterating. 
The "evaluation" text should describe what you observed, and will be presented to the user after each iteration.
The "notes" field may include any short reminders or follow-up actions that you want to keep track of for the next iteration.

If you need to use a tool, make exactly one tool call, then wait for tool output before responding.
After receiving tool output, respond with JSON only (no tool calls).
Tool calls count against the iteration budget, so avoid unnecessary tool use.
If a tool call fails or returns an error, set "done": false, summarize the failure in "evaluation", and note the next step in "notes".
If you are done, set "done": true and do not call tools.

Use apply-patch tool to create or modify the JSCAD source code. Edit only the target file.
Keep changes minimal and localized.
apply-patch applies a freeform patch to edit files and returns the modified content.
A valid JSCAD file should have a main function and "module.exports = { main }".

Tools:
- apply-patch(patch): apply a freeform patch to edit files.
- jscad-validate(file): validate the JSCAD file.
- jscad-render-view(file): render a composite PNG snapshot of the JSCAD.
- jscad-render-perspective(file): render a PNG perspective snapshot of the JSCAD.

Patch rules:
- The patch must start with "*** Begin Patch" and end with "*** End Patch".
- Use "*** Update File: path" to edit, "*** Add File: path" to create, and "*** Delete File: path" to remove files.
- Inside update hunks, every line must start with "+", "-", or a single leading space.
- You may include "@@" lines as context separators.

Example edit with context and deletions (preferred shape):
*** Begin Patch
*** Update File: /path/to/file.jscad
@@
 const rimHeight = 8
-const spokeRadius = 1.5
+const spokeRadius = 1.2
 const tireThickness = 6
*** End Patch

Edit strategy:
- Make small, incremental changes using apply-patch. One logical change per iteration.
- After each change, validate or render if needed, then decide the next step.
- Summarize your observations in the "evaluation" field and any follow-up actions in "notes".
- Once the code satisfies the goal, check if it compiles using the jscad-validate tool
- Once the code compiles check if it renders correctly using the jscad-render-view tool

Available tools: jscad-validate, jscad-render-view, jscad-render-perspective, apply-patch.`;

export const formContent = (
  { goal, contextLine, outputPath, iteration, maxIterations, currentCode }: {
    goal: string;
    contextLine: string;
    outputPath: string;
    iteration: number;
    maxIterations: number;
    currentCode: string;
  }) => {
  const contextBlock = contextLine ? `Context:\n${contextLine}\n` : '';

  return `Goal: ${goal}
${contextBlock}Constraints:
- Respond with JSON only using {"done": boolean, "evaluation": string, "notes": string}.
- Do not include extra keys, Markdown, or additional text.
- Use tools only when needed; call at most one tool, then wait.
- After tool output, respond with JSON only (no tool calls).
- Tool calls count against the iteration budget.
- Edit only the target file using apply-patch and keep changes minimal.
Editing file: ${outputPath}
Iteration: ${iteration}/${maxIterations}
Current code:\n${currentCode}`;
};
