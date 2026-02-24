import { Agent, run, tool } from '@openai/agents';
import { colors } from 'kiss-framework';
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
    const toolSchemas = getAgentToolSchemas();
    const tools = toolSchemas.map((descriptor) => {
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
            console.debug('OpenAI tool call error:', colors.red(message));
            return output;
          }
          try {
            console.debug(
              `OpenAI tool call: ${colors.blue(toolName)} args: ${colors.yellow(JSON.stringify(toolInput, null, 2))}`
            );
            const output = await executeAgentTool(toolName, toolInput as Record<string, unknown>);
            toolState.toolOutput = output;
            console.debug(`OpenAI tool output: ${colors.cyan(output)}`);
            return output;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const output = JSON.stringify({ ok: false, error: message });
            toolState.toolError = message;
            toolState.toolOutput = output;
            console.debug('OpenAI tool execution error:', colors.red(message));
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

    console.debug(`Sending to OpenAI Agents.
      model: ${DEFAULT_MODEL},
      message-goal: ${input.goal},
      message-roles: ${colors.green('system, user')},
      tool-names: ${colors.green(toolSchemas.map((t) => t.function.name).join(', '))},
      `);

    const result = await run(agent, agentUser);

    const finalOutput = result.finalOutput;
    console.debug('OpenAI finalOutput:', colors.yellow(JSON.stringify(finalOutput, null, 2)));
    if (typeof finalOutput === 'string') {
      const prettyOutput = finalOutput.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      console.debug('OpenAI finalOutput (pretty):', colors.yellow(prettyOutput));
    }

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
