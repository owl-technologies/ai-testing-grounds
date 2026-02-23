import { colors } from 'kiss-framework';
import { Ollama } from 'ollama';
import {
  OLLAMA_HOST,
  SingleAgentStepOptions,
  SingleAgentStepResult,
  ToolCall,
} from '../config';
import { executeAgentTool, getAgentToolSchemas, isAgentTool } from '../tools';

type OllamaChatMessage = {
  role?: string;
  content?: string;
  tool_calls?: ToolCall[];
};

const DEFAULT_ANALYST_MODEL = 'qwen2.5-coder:latest'// 'mistral:latest'; // 'qwen2.5-coder:latest';

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

const formContent = (
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

export class JscadEditorAgent {
  private lastOutputPath = '';

  async runAgent(input: SingleAgentStepOptions): Promise<SingleAgentStepResult> {
    this.lastOutputPath = input.outputPath;

    const model = DEFAULT_ANALYST_MODEL;
    const contextLine = input.context ? `Context: ${input.context}\n` : '';
    const userContent = formContent({
      goal: input.goal,
      contextLine,
      outputPath: input.outputPath,
      iteration: input.iteration,
      maxIterations: input.maxIterations,
      currentCode: input.currentCode,
    });
    const ollama = new Ollama({ host : OLLAMA_HOST});
    const tools = getAgentToolSchemas();
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];
    console.debug(`Sending to ollama. 
      model: ${model},
      message-goal: ${input.goal},
      message-roles: ${colors.green(messages.map((m) => m.role).join(', '))},
      tool-names: ${colors.green(tools.map((t) => t.function.name).join(', '))},
      `);
    const response = await ollama.chat({
      model,
      messages,
      tools,
      stream: false,
      keep_alive: -1,
    });

    const firstMessage = response.message as OllamaChatMessage | undefined;
    const {content, ...rest} = firstMessage || {};
    console.debug('response.message from Ollama:', colors.yellow(JSON.stringify(firstMessage, null, 2)));
    const prettyContent = firstMessage?.content
      ? firstMessage.content.replace(/\\n/g, '\n').replace(/\\"/g, '"')
      : undefined;
    if (prettyContent) {
      console.debug('response.message.content (pretty):', colors.yellow(prettyContent));
    }
    let toolOutput: string | undefined;
    let toolError: string | undefined;

    const toolCalls = this.extractToolCallsFromMessage(firstMessage);

    console.debug('Extracted tool calls:', colors.blue(JSON.stringify(toolCalls, null, 2)));
    const toolCall = toolCalls?.[0];
    if (toolCall) {
      const normalized = this.normalizeToolCall(toolCall);
      if (normalized.toolError) {
        toolError = normalized.toolError;
      } else if (normalized.toolName) {
        toolOutput = await executeAgentTool(
          normalized.toolName,
          normalized.args || {}
        );
        messages.push(firstMessage as { role: string; content: string; tool_calls?: ToolCall[] });
        messages.push({
          role: 'tool',
          tool_name: normalized.toolName,
          content: toolOutput,
        } as { role: string; content: string; tool_name: string });
      }
    }

    let raw = firstMessage?.content?.trim() || '';
    let parsed = this.extractAgentJson(raw);

    if (toolOutput) {
      const followUp = await ollama.chat({
        model,
        messages,
        tools,
        stream: false,
        keep_alive: -1,
      });
      raw = followUp.message?.content?.trim() || '';
      parsed = this.extractAgentJson(raw);
    }

    const jscad = parsed?.jscad?.trim() || '';
    const baseNotes = parsed?.notes?.trim() || '';
    const notes = baseNotes;
    return {
      jscad,
      done: parsed?.done ?? false,
      evaluation: parsed?.evaluation?.trim() || '',
      notes,
      raw,
      toolOutput,
      toolError,
    };
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

  private extractToolCallsFromMessage(message: OllamaChatMessage | undefined): ToolCall[] | undefined {
    if (message?.tool_calls && message.tool_calls.length) {
      return message.tool_calls;
    }
    const text = message?.content;
    if (!text) {
      return undefined;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const calls: ToolCall[] = [];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const candidate = entry as { name?: unknown; arguments?: unknown };
        const { name } = candidate;
        if (typeof name !== 'string') {
          continue;
        }
        const args = candidate.arguments;
        const normalizedArgs = args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
        calls.push({ function: { name, arguments: normalizedArgs } });
      }
      return calls.length ? calls : undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeToolCall(toolCall: ToolCall | null | undefined): { toolName?: string; args?: Record<string, unknown>; toolError?: string } {
    const toolName = toolCall?.function?.name;
    if (!toolName) {
      return { toolError: 'Tool call missing function name.' };
    }
    if (!isAgentTool(toolName)) {
      return { toolError: `Unknown tool call: ${toolName}` };
    }
    const rawArgs = toolCall?.function?.arguments;
    if (rawArgs && typeof rawArgs !== 'object') {
      return { toolError: 'Tool arguments must be an object.' };
    }
    const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
    return { toolName, args };
  }

}
