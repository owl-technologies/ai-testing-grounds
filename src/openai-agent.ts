import { z } from 'zod';
import { Agent, run, tool } from '@openai/agents';
import {
  DEFAULT_ANALYST_MODEL,
  DEFAULT_OPENAI_MODEL,
  SINGLE_AGENT_SYSTEM_PROMPT,
} from './ai-agent.config';
import { writeRenderOutput } from './tools/ai-agent/jscad-render-2d';
import { compileJscad } from './tools/ai-agent/jscad-validate';
import { executeAgentTool, getAgentToolSchemas } from './tools/ai-agent/registry';
import type { ToolDescriptor, ToolExecutionContext } from './tools/ai-agent/types';

export type SingleAgentStepOptions = {
  goal: string;
  context?: string;
  renderPngBase64?: string;
  model?: string;
  host?: string;
  outputPath: string;
  currentCode: string;
  iteration: number;
  maxIterations: number;
  allowFullCode?: boolean;
};

type InputContentItem =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image: string };

type UserMessageItem = {
  role: 'user';
  content: string | InputContentItem[];
};

type AgentInput = string | UserMessageItem[];

type ToolState = {
  toolOutput?: string;
  toolError?: string;
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
    const model = input.model || DEFAULT_OPENAI_MODEL || DEFAULT_ANALYST_MODEL;
    const contextLine = input.context ? `${CONTEXT_PREFIX}${input.context}\n` : '';
    const renderLine = input.renderPngBase64 ? 'Render image supplied for visual reference.' : 'No render provided.';
    const agentUser = `${GOAL_PREFIX}${input.goal}
${contextLine}Editing file: ${input.outputPath}
Iteration: ${input.iteration}/${input.maxIterations}
${renderLine}
Current code:
${input.currentCode}`;

    const toolState: ToolState = {};
    const tools = this.createAgentTools(toolState);
    const agent = new Agent({
      name: 'JSCAD agent',
      instructions: SINGLE_AGENT_SYSTEM_PROMPT,
      tools,
      model,
    });

    const runInput = this.buildRunInput(agentUser, input.renderPngBase64);
    const result = await run(agent, runInput);

    const raw = this.normalizeRawOutput(result.finalOutput);
    const parsed = this.extractAgentJson(raw);

    const parsedJscad = parsed?.jscad?.trim() || '';
    const allowFullCode = input.allowFullCode === true;
    const jscad = allowFullCode && parsedJscad ? parsedJscad : input.currentCode;
    const baseNotes = parsed?.notes?.trim() || '';
    const notes = !allowFullCode && parsedJscad
      ? [baseNotes, 'Inline JSCAD ignored; use js-change-property tool.'].filter(Boolean).join(' ')
      : baseNotes;
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

  private buildRunInput(agentUser: string, renderPngBase64?: string): AgentInput {
    const image = this.normalizeRenderImage(renderPngBase64);
    if (!image) {
      return agentUser;
    }
    return [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: agentUser },
          { type: 'input_image', image },
        ],
      },
    ];
  }

  private normalizeRenderImage(render?: string): string | undefined {
    if (!render) {
      return undefined;
    }
    if (render.startsWith('data:') || render.startsWith('http://') || render.startsWith('https://')) {
      return render;
    }
    return `data:image/png;base64,${render}`;
  }

  private normalizeRawOutput(output: unknown): string {
    if (typeof output === 'string') {
      return output.trim();
    }
    if (output === null || output === undefined) {
      return '';
    }
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }

  private extractAgentJson(raw: string): { jscad?: string; done?: boolean; evaluation?: string; notes?: string } | undefined {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return typeof parsed === 'object' && parsed ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private createAgentTools(toolState: ToolState) {
    const context = this.getToolExecutionContext();
    return getAgentToolSchemas().map((descriptor) => {
      const toolName = descriptor.function.name;
      const parameters = this.buildZodSchema(descriptor.function.parameters);
      return tool({
        name: toolName,
        description: descriptor.function.description,
        parameters,
        execute: async (input) => {
          if (!input || typeof input !== 'object') {
            const message = 'Tool arguments must be an object.';
            const output = JSON.stringify({ ok: false, error: message });
            toolState.toolError = message;
            toolState.toolOutput = output;
            return output;
          }
          try {
            const output = await executeAgentTool(toolName, input as Record<string, unknown>, context);
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
  }

  private getToolExecutionContext(): ToolExecutionContext {
    return {
      compileJscad: (source: string) => compileJscad(source),
      writeRenderOutput: (writeFile: (outputPath: string) => void) => writeRenderOutput(writeFile, this.lastOutputPath),
    };
  }

  private buildZodSchema(parameters: ToolDescriptor['function']['parameters']) {
    const required = new Set(parameters.required || []);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [name, definition] of Object.entries(parameters.properties)) {
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
    return z.object(shape);
  }
}
