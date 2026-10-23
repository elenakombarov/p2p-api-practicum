#!/usr/bin/env node
/** Block agent edits that reduce active expect( calls in Playwright test files. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TEST_FILE_RE = /(?:^|\/)tests\/.*\.(spec|test)\.[jt]sx?$/i;

function readHookInput() {
  const raw = fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) {
    console.error('guard-test-assertions: empty stdin');
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`guard-test-assertions: invalid JSON — ${err.message}`);
    process.exit(1);
  }
}

function normalizeHookContext(payload) {
  const event = payload.hook_event_name ?? 'afterFileEdit';
  if (event === 'preToolUse') {
    const input = payload.tool_input ?? {};
    const filePath =
      input.path ?? input.file_path ?? input.filePath ?? payload.file_path;
    if (!filePath) {
      return { event, filePath: null, edits: [] };
    }
    if (input.old_string !== undefined || input.new_string !== undefined) {
      return {
        event,
        filePath,
        edits: [
          {
            old_string: input.old_string ?? '',
            new_string: input.new_string ?? '',
          },
        ],
      };
    }
    if (typeof input.content === 'string' || typeof input.contents === 'string') {
      return {
        event,
        filePath,
        edits: [{ old_string: '', new_string: input.content ?? input.contents, fullReplace: true }],
      };
    }
    return { event, filePath, edits: [] };
  }

  return {
    event,
    filePath: payload.file_path,
    edits: payload.edits ?? [],
  };
}

function applyEditsToContent(content, edits) {
  let next = content;
  for (const edit of edits) {
    if (!edit || typeof edit !== 'object') {
      continue;
    }
    const oldString = edit.old_string ?? '';
    const newString = edit.new_string ?? '';
    if (edit.fullReplace) {
      next = newString;
      continue;
    }
    if (!next.includes(oldString)) {
      return null;
    }
    next = next.replace(oldString, newString);
  }
  return next;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function isTestFile(filePath) {
  return TEST_FILE_RE.test(normalizePath(filePath));
}

function countActiveExpects(content) {
  let total = 0;
  for (const line of content.split(/\r?\n/)) {
    const stripped = line.trimStart();
    if (stripped.startsWith('//') || stripped.startsWith('*')) {
      continue;
    }
    const codePart = line.split('//', 1)[0];
    const matches = codePart.match(/expect\(/g);
    if (matches) {
      total += matches.length;
    }
  }
  return total;
}

function reconstructBefore(afterContent, edits) {
  let content = afterContent;
  for (let i = edits.length - 1; i >= 0; i -= 1) {
    const edit = edits[i];
    if (!edit || typeof edit !== 'object') {
      return null;
    }
    const { old_string: oldString, new_string: newString } = edit;
    if (oldString === undefined || newString === undefined) {
      return null;
    }
    if (!content.includes(newString)) {
      return null;
    }
    content = content.replace(newString, oldString);
  }
  return content;
}

function blockMessage(filePath, before, after) {
  return (
    `Blocked: test assertions weakened in ${filePath} — active expect( ` +
    `count ${before} -> ${after}. Do not delete or comment out assertions to ` +
    `make tests pass. Fix the app, locator, or test data instead.`
  );
}

function allow(event) {
  if (event === 'preToolUse') {
    console.log(JSON.stringify({ permission: 'allow' }));
  }
  process.exit(0);
}

function deny(event, filePath, beforeCount, afterCount) {
  const msg = blockMessage(filePath, beforeCount, afterCount);
  const body = { user_message: msg, agent_message: msg };
  if (event === 'preToolUse') {
    console.log(JSON.stringify({ permission: 'deny', ...body }));
  } else {
    console.log(JSON.stringify(body));
  }
  console.error(msg);
  process.exit(2);
}

function main() {
  const payload = readHookInput();
  const { event, filePath, edits } = normalizeHookContext(payload);
  if (!filePath) {
    allow(event);
  }

  if (!isTestFile(filePath)) {
    allow(event);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`guard-test-assertions: file not found — ${filePath}`);
    process.exit(1);
  }

  const onDiskContent = fs.readFileSync(resolved, 'utf8');
  let beforeCount;
  let afterCount;

  if (event === 'preToolUse') {
    beforeCount = countActiveExpects(onDiskContent);
    const projected = applyEditsToContent(onDiskContent, edits);
    if (projected === null) {
      let delta = 0;
      for (const edit of edits) {
        if (!edit || typeof edit !== 'object') {
          continue;
        }
        const oldS = edit.old_string ?? '';
        const newS = edit.new_string ?? '';
        delta += countActiveExpects(oldS) - countActiveExpects(newS);
      }
      afterCount = beforeCount - delta;
    } else {
      afterCount = countActiveExpects(projected);
    }
  } else {
    const afterContent = onDiskContent;
    afterCount = countActiveExpects(afterContent);
    const beforeContent = reconstructBefore(afterContent, edits);
    if (beforeContent !== null) {
      beforeCount = countActiveExpects(beforeContent);
    } else {
      let delta = 0;
      for (const edit of edits) {
        if (!edit || typeof edit !== 'object') {
          continue;
        }
        const oldS = edit.old_string ?? '';
        const newS = edit.new_string ?? '';
        delta += countActiveExpects(oldS) - countActiveExpects(newS);
      }
      beforeCount = afterCount + delta;
    }
  }

  if (beforeCount > afterCount) {
    deny(event, filePath, beforeCount, afterCount);
  }

  if (event === 'preToolUse') {
    console.log(JSON.stringify({ permission: 'allow' }));
  }

  console.error(
    `guard-test-assertions: OK — ${afterCount} active expect( preserved`,
  );
  process.exit(0);
}

main();
