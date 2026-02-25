import fs from 'fs';
import { colors } from 'kiss-framework';
import path from 'path';
import { JscadEditorAgent } from './agents/ollama-jscad-editor';
import { OpenAiAgentService } from './agents/openai-jscad-editor';

const usageText = `Usage: npm run cli -- [options]

Options:
  --goal <text>               (required) prompt describing the desired artifact
  --file <path>               path to a JSCAD file to edit directly
  --max-iterations <n>        how many loop cycles to run (default 3)
  --openai                   use the OpenAI agents runner instead of Ollama
  --help                     show this message
`;

type ParsedArgs = {
  parsed: Record<string, string>;
  positionals: string[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const withoutPrefix = token.slice(2);
    const equalIndex = withoutPrefix.indexOf('=');
    let key: string;
    let value: string | undefined;
    if (equalIndex >= 0) {
      key = withoutPrefix.slice(0, equalIndex);
      value = withoutPrefix.slice(equalIndex + 1);
    } else {
      key = withoutPrefix;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        value = next;
        i += 1;
      } else {
        value = 'true';
      }
    }
    parsed[key] = value;
  }
  return { parsed, positionals };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const args = parsed.parsed;
  if (args.help) {
    process.stdout.write(usageText);
    return;
  }

  const goal = args.goal;
  if (!goal) {
    console.error('Missing --goal value.');
    process.stdout.write(usageText);
    process.exitCode = 1;
    return;
  }

  const fileOverride = args.file ? path.resolve(args.file) : undefined;

  if (!fileOverride) {
    console.error('Provide --file <path>.');
    process.stdout.write(usageText);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(fileOverride)) {
    console.error(`JSCAD file not found: ${fileOverride}`);
    process.exitCode = 1;
    return;
  }

  const seedCode = fs.readFileSync(fileOverride, 'utf-8');

  const useOpenAi = args.openai === 'true';
  const service = useOpenAi ? new OpenAiAgentService() : new JscadEditorAgent();
  const parsedMax = Number(args['max-iterations'] ?? '');
  const maxIterations = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : 3;
  console.log(colors.blue('Goal:'), goal);
  console.log(colors.blue('File:'), fileOverride);
  let currentCode = seedCode;
  let lastEvaluation = '';
  let lastNotes = '';
  let lastToolSummary = '';
  let lastToolError = '';

  let iterationsUsed = 0;
  while (iterationsUsed < maxIterations) {
    const iteration = Math.min(iterationsUsed + 1, maxIterations);
    let combinedContext = '';
    if (lastEvaluation) {
      combinedContext += `Last evaluation: ${lastEvaluation}\n`;
    }
    if (lastNotes) {
      combinedContext += `Last notes: ${lastNotes}\n`;
    }
    if (lastToolSummary) {
      combinedContext += `Last tool result: ${lastToolSummary}\n`;
    }
    if (lastToolError) {
      combinedContext += `Last tool error: ${lastToolError}\n`;
    }
    combinedContext = combinedContext.trim();
    const step = await service.runAgent({
      goal,
      context: combinedContext || undefined,
      outputPath: fileOverride,
      currentCode,
      iteration,
      maxIterations,
    });

    currentCode = fs.readFileSync(fileOverride, 'utf-8');
    iterationsUsed += 1;
    if (step.toolOutput || step.toolError) {
      iterationsUsed += 1;
    }

    if (step.toolError) {
      console.log(colors.red('Tool schema error:'), step.toolError);
    }

    const evaluationText = step.evaluation?.trim() || 'No evaluation returned.';
    console.log(colors.cyan(`Evaluation: ${evaluationText}`));

    if (step.done) {
      console.log('Agent indicated completion.');
      break;
    }

    lastEvaluation = evaluationText;
    lastNotes = step.notes?.trim() || '';
    if (step.toolOutput || step.toolError) {
      let toolSummary = '';
      let toolError = step.toolError?.trim() || '';
      if (step.toolOutput) {
        try {
          const parsed = JSON.parse(step.toolOutput);
          if (parsed && typeof parsed === 'object') {
            const parsedObj = parsed as Record<string, unknown>;
            const ok = parsedObj.ok;
            const error = parsedObj.error;
            if (ok === false && typeof error === 'string') {
              toolError = error;
            } else if (ok === true) {
              if (typeof parsedObj.path === 'string') {
                toolSummary = `ok, path: ${parsedObj.path}`;
              } else if (typeof parsedObj.file === 'string') {
                toolSummary = `ok, updated file (${parsedObj.file.length} chars)`;
              } else {
                toolSummary = 'ok';
              }
            } else if (!toolError && typeof error === 'string') {
              toolError = error;
            }
          } else {
            toolSummary = step.toolOutput.slice(0, 200);
          }
        } catch {
          toolSummary = step.toolOutput.slice(0, 200);
        }
      }
      lastToolSummary = toolSummary;
      lastToolError = toolError;
    }
    if (iterationsUsed >= maxIterations) {
      console.log('Max iterations reached.');
      break;
    }
  }

  console.log(`\n${colors.green('Final output:')} ${fileOverride}`);
}

main().catch((error) => {
  console.error('CLI failed', error);
  process.exit(1);
});
