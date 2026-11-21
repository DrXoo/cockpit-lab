// A Claude Code PreToolUse hook for Bash (.claude/settings.json): it refuses shell commands that
// edit the repository through a heredoc. Such edits mangled escaped slashes in regexes, broke
// Bash on quotes and left CRLF line endings on Windows, again and again; the Edit tool does not.
// The hook reads the tool call as JSON on stdin and, to refuse it, exits with 2 and says why.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A Python interpreter reading its script from a heredoc. */
const PYTHON_HEREDOC = /\bpython3?(?:\.exe)?\s+-\s*<</;
/** Output redirected, or teed, into a folder of the repository's source, tests or docs. */
const INTO_THE_REPOSITORY = /(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?(?:\.\/)?(?:src|tests|e2e|docs)\//;

const ADVICE =
  'Edit files of the repository with the Edit tool. For a scripted edit across several files, Write the script to the scratchpad and run it there, opening files with newline="" so their line endings stay LF.';

/** Why a shell command must not run as an edit of the repository, or null when it may. */
export function shellEditProblem(command: string): string | null {
  if (PYTHON_HEREDOC.test(command)) return `A Python script in a heredoc. ${ADVICE}`;
  if (command.includes('<<') && INTO_THE_REPOSITORY.test(command))
    return `A heredoc written into src/, tests/, e2e/ or docs/. ${ADVICE}`;
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
  const problem = shellEditProblem(commandOf(input));
  if (problem !== null) {
    console.error(problem);
    process.exitCode = 2;
  }
}

/** The command of a Bash tool call, or an empty one for any other input. */
function commandOf(input: unknown): string {
  if (typeof input !== 'object' || input === null || !('tool_input' in input)) return '';
  const toolInput = input.tool_input;
  if (typeof toolInput !== 'object' || toolInput === null || !('command' in toolInput)) return '';
  return typeof toolInput.command === 'string' ? toolInput.command : '';
}
