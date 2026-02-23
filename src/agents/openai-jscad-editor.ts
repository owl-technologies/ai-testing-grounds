import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

import { executeAgentTool, getAgentToolSchemas } from '../tools';
import { formContent, SingleAgentStepOptions, SingleAgentStepResult, SYSTEM_PROMPT } from '../config';

const DEFAULT_MODEL = 'gpt-5-mini';

type ToolState = {
  toolOutput?: string;
  toolError?: string;
};

export class OpenAiAgentService {

  async runAgent(input: SingleAgentStepOptions): Promise<SingleAgentStepResult> {
    let toolState: ToolState = {};
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
      model: DEFAULT_MODEL,
    });

    const agentUser = formContent({
      goal: input.goal,
      contextLine: input.context ? `Context: ${input.context}\n` : '',
      outputPath: input.outputPath,
      iteration: input.iteration,
      maxIterations: input.maxIterations,
      currentCode: input.currentCode,
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
