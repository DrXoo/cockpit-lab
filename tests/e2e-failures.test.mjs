import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, failuresOf, summarizeFailures } from '../scripts/e2e-failures.mjs';

const ESC = '\u001b';

test('a failure is classified by what went wrong, ignoring terminal colors', () => {
  assert.deepEqual(
    classifyFailure(
      `${ESC}[31mError: expect(page).toHaveScreenshot(expected) failed${ESC}[39m\n\n  4 pixels (ratio 0.01 of all image pixels) are different.`,
    ),
    { kind: 'screenshot differs', detail: '4 pixels' },
  );
  assert.deepEqual(
    classifyFailure(
      'Error: expect(page).toHaveScreenshot(expected) failed\n\nTimeout: 15000ms\n  Failed to take two consecutive stable screenshots.',
    ),
    { kind: 'screenshot never stable', detail: 'Timeout: 15000ms' },
  );
  assert.deepEqual(classifyFailure('Test timeout of 30000ms exceeded.'), {
    kind: 'test timeout',
    detail: '30000ms',
  });
  assert.deepEqual(
    classifyFailure('Error: expect(locator).toHaveAttribute(expected) failed\n\nTimeout: 5000ms'),
    { kind: 'assertion timeout', detail: 'toHaveAttribute' },
  );
  assert.deepEqual(classifyFailure('TypeError: x is undefined\n    at foo'), {
    kind: 'other',
    detail: 'TypeError: x is undefined',
  });
});

/** A Playwright JSON report with one passing and one failing run of a nested test. */
const report = {
  suites: [
    {
      title: 'page-appearance.spec.ts',
      specs: [],
      suites: [
        {
          title: 'light theme',
          suites: [],
          specs: [
            {
              title: 'guided setup',
              tests: [
                {
                  projectName: 'visual',
                  results: [
                    { status: 'passed', errors: [], attachments: [] },
                    {
                      status: 'failed',
                      errors: [{ message: 'Test timeout of 30000ms exceeded.' }],
                      attachments: [
                        {
                          name: 'guided-room-diff.png',
                          path: 'test-results/a/guided-room-diff.png',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('the failures of a report name each test by its file and groups', () => {
  assert.deepEqual(failuresOf(report), [
    {
      title: 'page-appearance.spec.ts › light theme › guided setup',
      kind: 'test timeout',
      detail: '30000ms',
      diff: 'test-results/a/guided-room-diff.png',
    },
  ]);
});

test('the summary groups the failures by kind and counts the runs', () => {
  const failures = [
    { title: 'a', kind: 'test timeout', detail: '30000ms' },
    { title: 'b', kind: 'screenshot differs', detail: '4 pixels', diff: 'd.png' },
    { title: 'a', kind: 'test timeout', detail: '30000ms' },
  ];
  assert.equal(
    summarizeFailures(failures, 12),
    [
      '3 of 12 runs failed.',
      '',
      'screenshot differs (1)',
      '  b · 4 pixels · d.png',
      '',
      'test timeout (2)',
      '  a · 30000ms ×2',
    ].join('\n'),
  );
  assert.equal(summarizeFailures([], 12), 'All 12 runs passed.');
});
