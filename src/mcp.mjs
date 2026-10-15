import readline from 'node:readline';
import { Unmix } from './core.mjs';

const string = { type: 'string', minLength: 1, maxLength: 16000 };
const commandList = { type: 'array', maxItems: 32, items: { type: 'array', minItems: 1, maxItems: 64, items: string } };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const phase = { ...string, enum: ['baseline', 'candidate'] };
const requirement = schema({ requirementId: string, title: string, kind: { ...string, enum: ['preserve', 'remove'] }, command: { type: 'array', minItems: 1, maxItems: 64, items: string }, checkId: string, procedure: string }, ['requirementId', 'title', 'kind']);
const tools = [
  ['unmix_init', 'Initialize task recording in a clean Git repository with an initial commit.', schema({}), () => 'init'],
  ['unmix_begin', 'Record task intent before editing. Declare dependencies and checks for retained behavior.', schema({ taskId: string, title: string, intent: string, dependsOn: { type: 'array', items: string }, checks: commandList }, ['taskId', 'title', 'intent']), () => 'begin'],
  ['unmix_finish', 'Snapshot all nonignored file changes for the active task. Original branch and index stay unchanged.', schema({}), () => 'finish'],
  ['unmix_timeline', 'Read recorded tasks, dependency declarations, checks and snapshot commit IDs.', schema({}), () => 'timeline'],
  ['unmix_preview', 'Preview a task removal using recorded dependencies, transitive paths and shared files. Read-only: no candidate, replay, checks or model call. Hidden dependencies and conflicts remain unknown. Return expectedTimeline for optional stale-preview refusal in prepare.', schema({ remove: { type: 'array', minItems: 1, items: string }, format: { ...string, enum: ['json', 'markdown'] } }, ['remove']), () => 'preview'],
  ['unmix_prepare', 'Create a separate Git worktree omitting selected tasks. Replay retained patches; stop at conflicts or removed dependencies. Use unmix_report to review original/result patches by task before checks.', schema({ remove: { type: 'array', minItems: 1, items: string }, instruction: string, checks: commandList, protectedFiles: { type: 'array', maxItems: 256, items: string }, expectedTimeline: string, requirements: { type: 'array', maxItems: 32, items: requirement } }, ['remove', 'instruction']), () => 'prepare'],
  ['unmix_resume', 'After Codex repairs and stages conflicts in the candidate, snapshot the adaptation and replay remaining tasks.', schema({ planId: string, note: string }, ['planId', 'note']), () => 'resume'],
  ['unmix_verify', 'Execute registered check commands in the candidate. Rejects changed protected test/config inputs before commands run. Optional phase baseline runs passport criteria in a separate original worktree; removal criteria should exit 1 there and 0 on candidate. Missing/stale requirements block readiness. Only configured behavior is verified. Commands are executed without a shell.', schema({ planId: string, phase }, ['planId']), () => 'verify'],
  ['unmix_inspect', 'Read candidateTree before manual review, reconstruction diff, automated-check freshness and separate manual-check history/staleness.', schema({ planId: string }, ['planId']), () => 'inspect'],
  ['unmix_manual_check', 'Record an actually performed manual observation against expectedTree from inspection before the interaction. Caller must accurately identify observer and procedure; this does not prove a human acted. Results become stale when candidate file content changes. Optional phase baseline records against the separate original worktree created by baseline verification. Does not run checks or refresh automated verification.', schema({ planId: string, checkId: string, title: string, procedure: string, result: { ...string, enum: ['passed', 'failed'] }, observer: string, note: string, expectedTree: string, phase, evidence: { type: 'array', maxItems: 16, items: string } }, ['planId', 'checkId', 'title', 'procedure', 'result', 'observer', 'note', 'expectedTree']), () => 'manualCheck'],
  ['unmix_report', 'Review original and resulting patches by retained task, adaptations, blockers, pending and removed tasks, and unattributed changes. Includes manual observations and freshness separately from automated checks. Does not execute checks. Legacy plans may lack result snapshots.', schema({ planId: string, format: { ...string, enum: ['json', 'markdown'] } }, ['planId']), () => 'report'],
  ['unmix_codex_prompt', 'Return instructions and task evidence for adapting a reconstruction with Codex.', schema({ planId: string }, ['planId']), () => 'prompt'],
];
function validate(value, s, label = 'arguments') {
  if (s.enum && !s.enum.includes(value)) throw new Error(`Invalid ${label}.`);
  if (s.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    for (const key of s.required) if (!(key in value)) throw new Error(`Missing ${key}.`);
    for (const [key, v] of Object.entries(value)) {
      if (!s.properties[key]) throw new Error(`Unknown argument ${key}.`);
      validate(v, s.properties[key], key);
    }
  } else if (s.type === 'array') {
    if (!Array.isArray(value) || value.length < (s.minItems ?? 0) || value.length > (s.maxItems ?? 1000)) throw new Error(`Invalid array ${label}.`);
    for (const v of value) validate(v, s.items, label);
  } else if (typeof value !== 'string' || value.length < (s.minLength ?? 0) || value.length > (s.maxLength ?? 16000)) throw new Error(`Invalid string ${label}.`);
}
export function serve(repo) {
  // Minimal MCP stdio server: newline-delimited JSON-RPC, no logs on stdout.
  // Advertises only tools; no HTTP, resources, sampling, or prompts capability.
  let app, initialized = false;
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', line => {
    let req;
    try { req = JSON.parse(line); } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return;
    }
    if (!req || Array.isArray(req) || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
      send({ jsonrpc: '2.0', id: req?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }); return;
    }
    if (!Object.hasOwn(req, 'id')) return;
    try {
      let result;
      if (req.method === 'initialize') {
        const supported = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
        const requested = req.params?.protocolVersion;
        result = { protocolVersion: supported.includes(requested) ? requested : '2025-06-18', capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'unmix', version: '0.1.7' },
          instructions: 'Use begin/finish around each task. Preview recorded removal impact before prepare; prepare creates a separate candidate; Codex adapts conflicts and verifies. Never infer that test passage proves every behavior.' };
        initialized = true;
      } else if (req.method === 'ping') result = {};
      else if (!initialized) throw Object.assign(new Error('Initialize first.'), { rpcCode: -32000 });
      else if (req.method === 'tools/list') result = { tools: tools.map(([name, description, inputSchema]) => ({ name, description, inputSchema,
        annotations: { readOnlyHint: ['unmix_timeline', 'unmix_preview', 'unmix_inspect', 'unmix_report', 'unmix_codex_prompt'].includes(name), destructiveHint: name === 'unmix_verify', openWorldHint: name === 'unmix_verify' } })) };
      else if (req.method === 'tools/call') {
        const tool = tools.find(t => t[0] === req.params?.name);
        if (!tool) throw Object.assign(new Error('Unknown tool.'), { rpcCode: -32602 });
        const args = req.params.arguments ?? {};
        try {
          validate(args, tool[2]);
          app ??= new Unmix(repo);
          const method = tool[3]();
          const value = ['inspect', 'prompt'].includes(method) ? app[method](args.planId) : app[method](args);
          result = { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
        } catch (e) { result = { isError: true, content: [{ type: 'text', text: e.message }] }; }
      } else throw Object.assign(new Error('Method not found.'), { rpcCode: -32601 });
      send({ jsonrpc: '2.0', id: req.id, result });
    } catch (e) { send({ jsonrpc: '2.0', id: req.id, error: { code: e.rpcCode ?? -32603, message: e.message } }); }
  });
}
