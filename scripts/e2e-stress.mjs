// Runs the visual end-to-end tests several times under load and lists every failure, grouped by
// kind. Use it before committing a new or changed screenshot test. Arguments replace the default
// selection, for example `npm run test:e2e:stress -- --project=functional --repeat-each=2`.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failuresOf, summarizeFailures } from './e2e-failures.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Apart from test-results, which every normal run empties, so a later run keeps these.
const OUTPUT_DIR = resolve(root, 'e2e-stress-results');
const REPORT_FILE = resolve(OUTPUT_DIR, 'report.json');
const PLAYWRIGHT_CLI = resolve(root, 'node_modules/@playwright/test/cli.js');
const DEFAULT_ARGS = ['--project=visual', '--repeat-each=4'];

const selection = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_ARGS;
const run = spawnSync(
  process.execPath,
  [PLAYWRIGHT_CLI, 'test', ...selection, `--output=${OUTPUT_DIR}`, '--reporter=list,json'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: REPORT_FILE },
  },
);
if (run.error) throw run.error;

const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
const { expected = 0, unexpected = 0, flaky = 0 } = report.stats ?? {};
const failures = failuresOf(report);
console.log(`\n${summarizeFailures(failures, expected + unexpected + flaky)}`);
console.log(`Results and diff images: ${OUTPUT_DIR}`);
if (failures.length > 0) process.exitCode = 1;
