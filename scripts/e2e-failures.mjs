// Reads a Playwright JSON report and groups its failures by what went wrong, so a stress run of
// the end-to-end tests shows every cause at once instead of one failure at a time.

// Terminal color codes that Playwright leaves in error messages.
const ANSI_CODES = /\u001b\[[0-9;]*m/g;

const FAILED_STATUSES = new Set(['failed', 'timedOut']);

const firstLine = (text) =>
  text
    .split('\n')
    .find((line) => line.trim() !== '')
    ?.trim() ?? '';

/** What went wrong in one failed run, from its error message. */
export function classifyFailure(rawMessage) {
  const message = rawMessage.replace(ANSI_CODES, '');
  const pixels = /(\d+) pixels \(ratio/.exec(message);
  if (pixels) return { kind: 'screenshot differs', detail: `${pixels[1]} pixels` };
  if (message.includes('Failed to take two consecutive stable screenshots')) {
    const timeout = /Timeout: \d+ms/.exec(message);
    return { kind: 'screenshot never stable', detail: timeout?.[0] ?? '' };
  }
  const testTimeout = /Test timeout of (\d+ms) exceeded/.exec(message);
  if (testTimeout) return { kind: 'test timeout', detail: testTimeout[1] };
  const assertion = /expect\([^)]*\)\.(\w+)\(/.exec(message);
  if (assertion && /Timeout: \d+ms/.test(message))
    return { kind: 'assertion timeout', detail: assertion[1] };
  return { kind: 'other', detail: firstLine(message) };
}

function* specsOf(suite, titles) {
  const path = suite.title ? [...titles, suite.title] : titles;
  for (const spec of suite.specs ?? []) yield { spec, titles: [...path, spec.title] };
  for (const child of suite.suites ?? []) yield* specsOf(child, path);
}

const diffOf = (result) =>
  (result.attachments ?? []).find((attachment) => attachment.name.endsWith('-diff.png'))?.path;

/** Every failed run in a Playwright JSON report, with its test, kind and diff image if any. */
export function failuresOf(report) {
  const failures = [];
  for (const suite of report.suites ?? [])
    for (const { spec, titles } of specsOf(suite, []))
      for (const test of spec.tests ?? [])
        for (const result of test.results ?? []) {
          if (!FAILED_STATUSES.has(result.status)) continue;
          const message = (result.errors ?? []).map((error) => error.message ?? '').join('\n');
          const diff = diffOf(result);
          failures.push({
            title: titles.join(' › '),
            ...classifyFailure(message),
            ...(diff ? { diff } : {}),
          });
        }
  return failures;
}

/** One line per test and detail of each kind of failure, with how many runs it hit. */
export function summarizeFailures(failures, runCount) {
  if (failures.length === 0) return `All ${runCount} runs passed.`;
  const lines = [`${failures.length} of ${runCount} runs failed.`];
  const kinds = [...new Set(failures.map((failure) => failure.kind))].sort();
  for (const kind of kinds) {
    const ofKind = failures.filter((failure) => failure.kind === kind);
    lines.push('', `${kind} (${ofKind.length})`);
    const groups = new Map();
    for (const failure of ofKind) {
      const key = `${failure.title} · ${failure.detail}`;
      const group = groups.get(key) ?? { count: 0, diff: failure.diff };
      group.count += 1;
      groups.set(key, group);
    }
    for (const [key, { count, diff }] of groups)
      lines.push(`  ${key}${count > 1 ? ` ×${count}` : ''}${diff ? ` · ${diff}` : ''}`);
  }
  return lines.join('\n');
}
