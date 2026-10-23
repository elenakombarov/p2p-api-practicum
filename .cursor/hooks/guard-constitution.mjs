#!/usr/bin/env node
/** Block agent edits that introduce constitution WON'T violations in tests/ and pages/. */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const GUARD_FILE_RE = /(?:^|\/)(?:tests|pages)\/.*\.(?:tsx?|jsx?)$/i;
const SPEC_FILE_RE = /(?:^|\/)tests\/.*\.(?:spec|test)\.(?:tsx?|jsx?)$/i;

const VIOLATION_RULES = [
  {
    reason: 'uses .waitForTimeout( — use web-first expect() instead',
    count: (content) => (content.match(/\.waitForTimeout\s*\(/g) || []).length,
  },
  {
    reason: 'uses XPath locator (locator(\'//…\')) — use role/label/text locators',
    count: (content) =>
      (content.match(/\.locator\s*\(\s*['"`]\/\//g) || []).length,
  },
  {
    reason: 'uses the any type — avoid : any, as any, <any>, Array<any>',
    count: (content) => {
      let n = 0;
      n += (content.match(/:\s*any\b/g) || []).length;
      n += (content.match(/\bas\s+any\b/g) || []).length;
      n += (content.match(/<any>/g) || []).length;
      n += (content.match(/Array<any>/g) || []).length;
      return n;
    },
  },
  {
    reason: 'hardcoded credential in .fill() with a literal email',
    count: (content) =>
      (content.match(/\.fill\s*\(\s*['"][^'"]*@[^'"]*['"]/gi) || []).length,
  },
  {
    reason:
      'hardcoded secret — password/secret/api_key/token assigned a literal string (4+ chars)',
    count: (content) =>
      (
        content.match(
          /(?:password|secret|api_key|token)\s*[=:]\s*['"][^'"]{4,}['"]/gi,
        ) || []
      ).length,
  },
  {
    reason: 'tag on test.describe() — tags belong on individual test() blocks only',
    count: (content) =>
      (content.match(/test\.describe\s*\([\s\S]*?\{\s*tag\s*:/g) || []).length,
  },
];

function readHookInput() {
  const raw = fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) {
    console.error('guard-constitution: empty stdin');
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`guard-constitution: invalid JSON — ${err.message}`);
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

function isGuardedFile(filePath) {
  return GUARD_FILE_RE.test(normalizePath(filePath));
}

function isSpecFile(filePath) {
  return SPEC_FILE_RE.test(normalizePath(filePath));
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

function newViolationReasons(beforeContent, afterContent) {
  const reasons = [];
  for (const rule of VIOLATION_RULES) {
    const beforeCount = rule.count(beforeContent);
    const afterCount = rule.count(afterContent);
    if (afterCount > beforeCount) {
      reasons.push(rule.reason);
    }
  }
  return reasons;
}

function newViolationsFromEdits(edits) {
  const reasons = new Set();
  for (const edit of edits) {
    if (!edit || typeof edit !== 'object') {
      continue;
    }
    const oldS = edit.old_string ?? '';
    const newS = edit.new_string ?? '';
    for (const rule of VIOLATION_RULES) {
      if (rule.count(newS) > rule.count(oldS)) {
        reasons.add(rule.reason);
      }
    }
  }
  return [...reasons];
}

function blockMessage(filePath, reasons, expectDetail) {
  const parts = [`Blocked: constitution violation in ${filePath}`];
  if (reasons.length) {
    parts.push(reasons.join('; '));
  }
  if (expectDetail) {
    parts.push(expectDetail);
  }
  return parts.join(' — ');
}

function allow(event, filePath) {
  if (event === 'preToolUse') {
    console.log(JSON.stringify({ permission: 'allow' }));
  }
  if (filePath) {
    console.error(`guard-constitution: OK — ${filePath}`);
  }
  process.exit(0);
}

function deny(event, filePath, msg) {
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
    allow(event, null);
  }

  if (!isGuardedFile(filePath)) {
    allow(event, filePath);
  }

  const resolved = path.resolve(filePath);
  const onDiskContent = fs.existsSync(resolved)
    ? fs.readFileSync(resolved, 'utf8')
    : '';

  let beforeContent;
  let afterContent;
  let reconstructionFailed = false;

  if (event === 'preToolUse') {
    beforeContent = onDiskContent;
    const projected = applyEditsToContent(onDiskContent, edits);
    if (projected === null) {
      reconstructionFailed = true;
      afterContent = onDiskContent;
    } else {
      afterContent = projected;
    }
  } else {
    if (!fs.existsSync(resolved)) {
      console.error(`guard-constitution: file not found — ${filePath}`);
      process.exit(1);
    }
    afterContent = onDiskContent;
    beforeContent = reconstructBefore(afterContent, edits);
    if (beforeContent === null) {
      reconstructionFailed = true;
    }
  }

  const reasons = reconstructionFailed
    ? newViolationsFromEdits(edits)
    : newViolationReasons(beforeContent ?? '', afterContent);

  let expectDetail;
  if (isSpecFile(filePath) && !reconstructionFailed) {
    const beforeExpect = countActiveExpects(beforeContent ?? '');
    const afterExpect = countActiveExpects(afterContent);
    if (beforeExpect > afterExpect) {
      expectDetail =
        `active expect( count ${beforeExpect} -> ${afterExpect} — ` +
        'do not delete or weaken assertions';
    }
  } else if (isSpecFile(filePath) && reconstructionFailed) {
    let delta = 0;
    for (const edit of edits) {
      if (!edit || typeof edit !== 'object') {
        continue;
      }
      const oldS = edit.old_string ?? '';
      const newS = edit.new_string ?? '';
      delta += countActiveExpects(oldS) - countActiveExpects(newS);
    }
    if (delta > 0) {
      const afterExpect = countActiveExpects(afterContent);
      const beforeExpect = afterExpect + delta;
      expectDetail =
        `active expect( count ${beforeExpect} -> ${afterExpect} — ` +
        'do not delete or weaken assertions';
    }
  }

  if (reasons.length || expectDetail) {
    deny(event, filePath, blockMessage(filePath, reasons, expectDetail));
  }

  allow(event, filePath);
}

main();
