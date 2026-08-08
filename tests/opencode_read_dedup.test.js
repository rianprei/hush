'use strict';

// Tests for the Read dedup cache in the OpenCode hush plugin
// (~/.config/opencode/plugins/hush.js). The plugin is ESM single-file; tests
// live here (outside the plugins dir, so opencode never loads them) and load
// the real module via dynamic import().

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { pathToFileURL } = require('url');

const PLUGIN = `${process.env.HOME}/.config/opencode/plugins/hush.js`;

// The plugin under test lives in the user's opencode config dir, not in this
// repo — CI (ubuntu/windows runners) won't have it, so the whole suite skips
// with a named reason there instead of failing.
const HAS_PLUGIN = fs.existsSync(PLUGIN);

test('read dedup suite skipped when the opencode plugin is absent', { skip: HAS_PLUGIN ? false : 'opencode plugin not present (CI or non-local checkout)' }, () => {
  assert.ok(true);
});

async function loadPlugin() {
  return import(pathToFileURL(PLUGIN).href);
}

test('first read of a key is a miss and records the fingerprint', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  const r = c.check('s1', '/a/b.txt|all|all', 'line one\nline two\n');
  assert.strictEqual(r.hit, false);
  assert.strictEqual(r.readIndex, 1);
});

test('identical re-read in the same session hits with the original read index', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  c.check('s1', '/a/b.txt|all|all', 'same bytes');
  const r = c.check('s1', '/a/b.txt|all|all', 'same bytes');
  assert.strictEqual(r.hit, true);
  assert.strictEqual(r.readIndex, 1);
});

test('changed content on the same key is a miss and advances the index', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  c.check('s1', '/a/b.txt|all|all', 'v1');
  const r = c.check('s1', '/a/b.txt|all|all', 'v2 changed');
  assert.strictEqual(r.hit, false);
  assert.strictEqual(r.readIndex, 2);
  assert.strictEqual(c.check('s1', '/a/b.txt|all|all', 'v2 changed').hit, true);
});

test('offset/limit slices of the same file dedup independently', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  c.check('s1', '/a/b.txt|10|5', 'slice-a');
  c.check('s1', '/a/b.txt|20|5', 'slice-b');
  assert.strictEqual(c.check('s1', '/a/b.txt|10|5', 'slice-a').hit, true);
  assert.strictEqual(c.check('s1', '/a/b.txt|20|5', 'slice-b').hit, true);
  assert.strictEqual(c.check('s1', '/a/b.txt|all|all', 'slice-a').hit, false);
});

test('sessions are isolated', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  c.check('s1', '/a/b.txt|all|all', 'bytes');
  assert.strictEqual(c.check('s2', '/a/b.txt|all|all', 'bytes').hit, false);
});

test('invalidatePath drops every slice of a path', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  c.check('s1', '/a/b.txt|all|all', 'bytes');
  c.check('s1', '/a/b.txt|10|5', 'bytes');
  c.invalidatePath('s1', '/a/b.txt');
  assert.strictEqual(c.check('s1', '/a/b.txt|all|all', 'bytes').hit, false);
  assert.strictEqual(c.check('s1', '/a/b.txt|10|5', 'bytes').hit, false);
});

test('invalidateBash only drops keys named in the command', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  c.check('s1', '/a/b.txt|all|all', 'bytes');
  c.check('s1', '/c/d.txt|all|all', 'bytes');
  c.invalidateBash('s1', 'sed -i s/x/y/ /a/b.txt');
  assert.strictEqual(c.check('s1', '/a/b.txt|all|all', 'bytes').hit, false);
  assert.strictEqual(c.check('s1', '/c/d.txt|all|all', 'bytes').hit, true);
});

test('fingerprint contract: same length + same 256-char prefix is a hit by design', { skip: !HAS_PLUGIN }, async () => {
  const { ReadDedupCache } = await loadPlugin();
  const c = new ReadDedupCache();
  const longA = 'x'.repeat(300) + 'AAA';
  const longB = 'x'.repeat(300) + 'BBB';
  c.check('s1', '/a/b.txt|all|all', longA);
  assert.strictEqual(c.check('s1', '/a/b.txt|all|all', longB).hit, true);
});

test('applyReadDedup replaces identical output with a stub and reports true', { skip: !HAS_PLUGIN }, async () => {
  const { applyReadDedup } = await loadPlugin();
  const output = { output: 'file body\nsecond line\n' };
  assert.strictEqual(applyReadDedup('s1', { filePath: '/a/b.txt' }, output), false);
  assert.strictEqual(applyReadDedup('s1', { filePath: '/a/b.txt' }, output), true);
  assert.match(output.output, /unchanged since read #1/);
});

test('applyReadDedup keeps slices apart via offset/limit args', { skip: !HAS_PLUGIN }, async () => {
  const { applyReadDedup } = await loadPlugin();
  const output = { output: 'head' };
  applyReadDedup('s1', { filePath: '/a/b.txt', offset: 1, limit: 5 }, output);
  assert.strictEqual(applyReadDedup('s1', { filePath: '/a/b.txt', offset: 1, limit: 5 }, output), true);
  assert.strictEqual(applyReadDedup('s1', { filePath: '/a/b.txt', offset: 10, limit: 5 }, output), false);
});
