import test from 'node:test';
import assert from 'node:assert/strict';
import { shellEditProblem } from '../../scripts/guard-shell-edits.ts';

test('a Python script fed through a heredoc is refused, wherever it writes', () => {
  assert.match(shellEditProblem("python - <<'EOF'\nprint(1)\nEOF") ?? '', /Edit tool/);
  assert.match(
    shellEditProblem('cd /s/x; python3 - <<EOF\nopen("a").write("b")\nEOF') ?? '',
    /Edit tool/,
  );
});

test('a heredoc that writes into the source, tests or docs is refused', () => {
  for (const command of [
    "cat > src/cockpit/a.ts <<'EOF'\nx\nEOF",
    "cat >> tests/b.test.ts <<'EOF'\nx\nEOF",
    "cat <<'EOF' > ./e2e/c.spec.ts\nx\nEOF",
    "tee docs/d.md <<'EOF'\nx\nEOF",
  ])
    assert.match(shellEditProblem(command) ?? '', /Edit tool/, command);
});

test('heredocs elsewhere, and commands without one, are left alone', () => {
  for (const command of [
    "git commit -q -F - <<'EOF'\nA message about src/ files\nEOF",
    "cat > /tmp/scratch/walk.mjs <<'EOF'\nx\nEOF",
    'python "C:/scratchpad/edit.py"',
    'sed -i "s/a/b/" src/cockpit/a.ts',
    'npm test > src-results.txt',
  ])
    assert.equal(shellEditProblem(command), null, command);
});
