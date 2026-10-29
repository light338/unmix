import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { run } from '../src/core.mjs';

const bin = fileURLToPath(new URL('../bin/unmix.mjs', import.meta.url));
const cli = (args, cwd) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 5000 });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unmix-interfaces-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  for (const args of [['init', '-q'], ['config', 'user.name', 'Interface test'], ['config', 'user.email', 'test@example.invalid']]) assert.equal(run(repo, 'git', args).ok, true);
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base');
  assert.equal(run(repo, 'git', ['add', '.']).ok, true);
  assert.equal(run(repo, 'git', ['commit', '-qm', 'base']).ok, true);
  return { root, repo };
}
function conciseFailure(result) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /\n\s+at |Node\.js v/);
}

test('CLI refuses missing option values before treating the next flag as a path or payload', t => {
  const { repo } = fixture(t);
  for (const flag of ['--repo', '--json', '--input']) {
    for (const suffix of [[], ['--repo', repo], ['']]) {
      const result = cli(['init', flag, ...suffix], repo);
      conciseFailure(result);
      assert.equal(result.stderr.trim(), `Option ${flag} requires a value.`);
    }
  }
  assert.equal(fs.existsSync(path.join(repo, '.git', 'unmix', 'ledger.json')), false);
});

test('CLI handles unreadable input paths with a concise error and no mutation', t => {
  const { root, repo } = fixture(t);
  for (const input of [path.join(root, 'missing-request.json'), root]) {
    const result = cli(['init', '--repo', repo, '--input', input], root);
    conciseFailure(result);
    assert.match(result.stderr, /ENOENT|EISDIR/);
  }
  assert.equal(fs.existsSync(path.join(repo, '.git', 'unmix', 'ledger.json')), false);
});

test('CLI keeps help and valid JSON/file input behavior', t => {
  const { root, repo } = fixture(t);
  const help = cli(['--help'], root);
  assert.equal(help.status, 0); assert.equal(help.stderr, '');
  assert.match(help.stdout, /Commands:.*checkpoint.*preview/);
  const input = path.join(root, 'request with spaces.json'); fs.writeFileSync(input, '{}');
  const initialized = cli(['init', '--repo', repo, '--input', input], root);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).initialized, true);
  const begun = cli(['begin', '--repo', repo, '--json', JSON.stringify({ taskId: 'drop', title: 'Drop', intent: 'Temporary addition' })], root);
  assert.equal(begun.status, 0, begun.stderr);
  fs.writeFileSync(path.join(repo, 'drop.txt'), 'drop');
  assert.equal(cli(['finish', '--repo', repo], root).status, 0);
  fs.writeFileSync(input, JSON.stringify({ remove: ['drop'] }));
  const preview = cli(['preview', '--repo', repo, '--input', input], root);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).summary.removed, 1);
});

test('MCP rejects prototype-named unknown fields at top level and in nested schemas', t => {
  const { repo } = fixture(t);
  const keys = ['constructor', 'toString', '__proto__'];
  const requests = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }];
  const invalid = [];
  for (const key of keys) {
    const extra = JSON.parse(`{"${key}":"not a schema field"}`);
    invalid.push({ key, name: 'unmix_init', arguments: extra });
    invalid.push({ key, name: 'unmix_prepare', arguments: { remove: ['drop'], instruction: 'Remove drop', requirements: [{ requirementId: 'retain', title: 'Keep behavior', kind: 'preserve', command: ['node', '--version'], ...extra }] } });
  }
  for (const params of invalid) requests.push({ jsonrpc: '2.0', id: requests.length + 1, method: 'tools/call', params: { name: params.name, arguments: params.arguments } });
  requests.push({ jsonrpc: '2.0', id: requests.length + 1, method: 'tools/call', params: { name: 'unmix_init', arguments: {} } });
  requests.push({ jsonrpc: '2.0', id: requests.length + 1, method: 'tools/call', params: { name: 'unmix_timeline', arguments: {} } });
  const child = spawnSync(process.execPath, [bin, 'mcp', '--repo', repo], { input: requests.map(v => JSON.stringify(v)).join('\n') + '\n', encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
  const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(responses.length, requests.length);
  invalid.forEach(({ key }, i) => {
    const response = responses[i + 1];
    assert.equal(response.result?.isError, true, JSON.stringify(response));
    assert.equal(response.result.content[0].text, `Unknown argument ${key}.`);
  });
  assert.equal(responses.at(-2).result.isError, undefined, JSON.stringify(responses.at(-2)));
  assert.equal(JSON.parse(responses.at(-2).result.content[0].text).initialized, true);
  assert.deepEqual(JSON.parse(responses.at(-1).result.content[0].text).tasks, []);
});
