# AI Testing Grounds

This standalone TypeScript CLI mirrors `AiAgentService` from the Optimus Planto Marketplace so you can iterate on the agent workflow without touching the UI.

The repository ships with two sample JSCAD files (hip implant and glasses) and a lightweight command interface for feeding goals, sampling JSCAD code, and viewing analyst/validator output.

## Setup

```bash
cd ../ai-testing-grounds
npm install
```

Because the CLI reuses the shared datamodel, it installs the same local `optimus-planto-datamodel` tarball from `../optimus-planto-datamodel/optimus-planto-datamodel-0.6.tgz`.

## CLI usage

```bash
npm run cli -- --goal "Make the hip implant thicker" --sample "hip-implant.jscad"
```

Options you can pass:

- `--goal <text>` **(required)**: describe what the agent should build.
- `--jscad <path>` or `--sample <name>`: supply the seed source. (-sample picks from `jscad/`.)
- `--context <text>`: add context for the agent prompt.
- `--host`, `--model`: override the Ollama host or analyst model.
- `--render <path|data>`: feed a PNG render (file or data URI) into the agent prompt for evaluation.
- `--max-iterations <n>`: how many loop cycles to execute (default 3).
- `--list-samples`: print the bundled names and exit.
- `--help`: show this list.

The CLI also warns when the seed does not include the required header from `hip-implant.jscad` and it truncates the JSCAD snippet it prints to keep logs manageable.

## Sample files

The following JSCAD assets live in the `jscad/` directory and are copied from `../oplanto-slicer/test-files`:

- `hip-implant.jscad`
- `glasses.jscad`

You can rerun `npm run cli -- --list-samples` to see any additional files you add. Each run saves the agent’s output as `<seed>.output.jscad` beside the source file so there is a stable place for iterative edits.

## Agent loop

- `src/ai-agent.service.ts` revolves around `runAgent`, which calls Ollama with a single system prompt, parses JSON responses, and exposes a `jscad-compile` tool hook so the agent can request compiled output. The tool result is included in the CLI output when the agent asks for it.
- `src/cli.ts` now iterates that single agent up to `--max-iterations`, rewrites `<seed>.output.jscad` after every iteration, logs each iteration’s evaluation/notes/tool output, and includes the previous tool output in the next context so the agent can iterate with that feedback.
- The config (`src/ai-agent.config.ts`) documents the new tool in the prompt so the model is aware that it can request `jscad-compile` via the `toolCall` field.

## Architecture notes

- `src/ai-agent.service.ts` is a trimmed version of the Angular service that now talks directly to Ollama and exposes both the old `runJscadWorkflow` (kept for reference) and the newer loop-friendly `runAgent`.
- `src/ai-agent.config.ts` carries the prompts, headers, and the single-agent system prompt.
- `src/cli.ts` orchestrates argument parsing, an in-memory `localStorage` shim, and the loop that writes `/`seed`.output.jscad` after each step.

## Build & run

```bash
npm run build
npm run cli -- --goal "..." --sample hip-implant.jscad
```
