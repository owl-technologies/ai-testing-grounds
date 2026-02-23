import { z } from 'zod';
import { Agent, run, tool } from '@openai/agents';

import fs from 'fs/promises';
import { writeRenderOutput } from '../tools/jscad-render-2d';
import { compileJscad } from '../tools/jscad-validate';
import { executeAgentTool, getAgentToolSchemas } from '../tools';

const SYSTEM_PROMPT = `You are an agent responsible for generating and evaluating the JSCAD artifact.
Call a tool or return JSON in this format:
{"done": boolean, "evaluation": string, "notes": string}

Use diff-write tool to create or modify the JSCAD source code.
diff-write writes its updated file to disk and returns the modified content.
Include at least a main function and "module.exports = { main }".

Edit strategy:
- Make small, incremental changes using diff-write. One logical change per iteration.
- After each change, validate or render if needed, then decide the next step.

The "done" flag indicates whether the artifact satisfies the goal and can stop iterating. 
The "evaluation" text should describe what you observed, and 
"notes" may include any short reminders or follow-up actions.

If you need to compare versions, call the diff-write tool using the tool-calling interface provided by the host.
Available tools: jscad-validate, diff-write.`;

type ToolState = {
  toolOutput?: string;
  toolError?: string;
};

export type SingleAgentStepOptions = {
  goal: string;
  context?: string;
  model?: string;
  host?: string;
  outputPath: string;
  currentCode: string;
  iteration: number;
  maxIterations: number;
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

const GOAL_PREFIX = 'Goal: ';
const CONTEXT_PREFIX = 'Context: ';

export class OpenAiAgentService {
  private lastOutputPath = '';

  async runAgent(input: SingleAgentStepOptions): Promise<SingleAgentStepResult> {
    this.lastOutputPath = input.outputPath;
    const model = 'gpt-5-nano';
    const contextLine = input.context ? `${CONTEXT_PREFIX}${input.context}\n` : '';
    const agentUser = `${GOAL_PREFIX}${input.goal}
${contextLine}Editing file: ${input.outputPath}
Iteration: ${input.iteration}/${input.maxIterations}
Current code:
${input.currentCode}`;

    const toolState: ToolState = {};

    const tools = getAgentToolSchemas().map((descriptor) => {
      const toolName = descriptor.function.name;
      const required = new Set(descriptor.function.parameters.required || []);
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [name, definition] of Object.entries(descriptor.function.parameters.properties)) {
        let schema: z.ZodTypeAny;
        switch (definition.type) {
          case 'string':
            schema = z.string();
            break;
          case 'boolean':
            schema = z.boolean();
            break;
          case 'number':
            schema = z.number();
            break;
          default:
            schema = z.unknown();
            break;
        }
        if (definition.description) {
          schema = schema.describe(definition.description);
        }
        shape[name] = required.has(name) ? schema : schema.optional();
      }

      return tool({
        name: toolName,
        description: descriptor.function.description,
        parameters: z.object(shape),
        strict: true,
        execute: async (toolInput) => {
          if (!toolInput || typeof toolInput !== 'object') {
            const message = 'Tool arguments must be an object.';
            const output = JSON.stringify({ ok: false, error: message });
            toolState.toolError = message;
            toolState.toolOutput = output;
            return output;
          }
          try {
            const output = await executeAgentTool(toolName, toolInput as Record<string, unknown>);
            toolState.toolOutput = output;
            return output;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const output = JSON.stringify({ ok: false, error: message });
            toolState.toolError = message;
            toolState.toolOutput = output;
            return output;
          }
        },
      });
    });

    const agent = new Agent({
      name: 'JSCAD agent',
      instructions: SYSTEM_PROMPT,
      tools,
      model,
    });

    const result = await run(agent, agentUser);

    const raw = (() => {
      if (typeof result.finalOutput === 'string') {
        return result.finalOutput.trim();
      }
      if (result.finalOutput === null || result.finalOutput === undefined) {
        return '';
      }
      try {
        return JSON.stringify(result.finalOutput);
      } catch {
        return String(result.finalOutput);
      }
    })();

    let parsed: { jscad?: string; done?: boolean; evaluation?: string; notes?: string } | undefined;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const candidate = JSON.parse(raw.slice(start, end + 1));
        if (typeof candidate === 'object' && candidate) {
          parsed = candidate;
        }
      } catch {
        // intentionally ignore malformed JSON
      }
    }

    const parsedJscad = parsed?.jscad?.trim() || '';
    const jscad = parsedJscad || input.currentCode;
    const notes = parsed?.notes?.trim() || '';

    return {
      jscad,
      done: parsed?.done ?? false,
      evaluation: parsed?.evaluation?.trim() || '',
      notes,
      raw,
      toolOutput: toolState.toolOutput,
      toolError: toolState.toolError,
    };
  }
}
