// Declared obligations, not inferred completeness or a security boundary.
import { observationContext, compareContexts } from './manual-context.mjs';
export function expectedFailureMarker(requirementId) {
  if (typeof requirementId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(requirementId)) throw new Error('Expected failure marker requires a valid requirement ID.');
  return `UNMIX_EXPECTED_FAILURE:${requirementId}`;
}

export function requirements(value = []) {
  if (!Array.isArray(value) || value.length > 32) throw new Error('requirements must be an array of at most 32 obligations.');
  const ids = new Set(), manualIds = new Set();
  return value.map(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !['requirementId', 'title', 'kind', 'command', 'checkId', 'procedure'].includes(k))) throw new Error('Invalid requirement fields.');
    if (typeof r.requirementId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(r.requirementId) || ids.has(r.requirementId)) throw new Error('Requirement IDs must be valid and unique.');
    ids.add(r.requirementId);
    if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 16000 || !['preserve', 'remove'].includes(r.kind)) throw new Error('Each requirement needs a title and kind preserve or remove.');
    if (Object.hasOwn(r, 'command')) {
      if (Object.hasOwn(r, 'checkId') || Object.hasOwn(r, 'procedure') || !Array.isArray(r.command) || !r.command.length || r.command.length > 64 || r.command.some(v => typeof v !== 'string' || !v || v.includes('\0'))) throw new Error('An automated requirement needs one command argument array, without manual fields.');
    } else {
      if (typeof r.checkId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(r.checkId) || manualIds.has(r.checkId) || typeof r.procedure !== 'string' || !r.procedure.trim() || r.procedure.length > 16000) throw new Error('A manual requirement needs a unique checkId and nonempty procedure.');
      manualIds.add(r.checkId);
    }
    return JSON.parse(JSON.stringify(r));
  });
}

function evidence(p, requirement, phase, tree) {
  if (!tree) return { state: 'not_checked' };
  if (!requirement.command) {
    const record = (p.manualChecks || []).filter(v => (v.phase || 'candidate') === phase && v.checkId === requirement.checkId).at(-1);
    if (!record) return { state: 'not_checked' };
    const contextReview = observationContext(p, record, phase);
    const metadata = { observationId: record.observationId, observer: record.observer, contextReview };
    if (record.tree !== tree) return { ...metadata, state: 'stale' };
    if (contextReview.state === 'stale') return { ...metadata, state: 'stale', reason: 'manual_context_changed' };
    if (record.procedure !== requirement.procedure) return { ...metadata, state: 'not_checked', reason: 'procedure_mismatch' };
    if ((p.manualContexts?.baseline || p.manualContexts?.candidate) && !contextReview.confirmed) return { ...metadata, state: 'not_checked', reason: 'context_unconfirmed' };
    return { ...metadata, state: record.result };
  }
  const verification = phase === 'baseline' ? p.baseline?.verification : p.verification;
  if (!verification) return { state: 'not_checked' };
  if (verification.tree !== tree) return { state: 'stale' };
  if (verification.changedDuringChecks || verification.integrity.before.state === 'changed' || verification.integrity.after.state === 'changed') return { state: 'not_checked', reason: 'check_inputs_changed' };
  const result = verification.results.find(v => JSON.stringify(v.command) === JSON.stringify(requirement.command));
  if (!result) return { state: 'not_checked' };
  if (phase === 'baseline' && requirement.kind === 'remove' && !result.ok && result.code === 1 && !result.error
    && !result.stdout.split(/\r?\n/).includes(expectedFailureMarker(requirement.requirementId)))
    return { state: 'error', reason: 'missing_failure_marker', result };
  return { state: result.ok ? 'passed' : result.code === 1 && !result.error ? 'failed' : 'error', result };
}

export function passport(p, candidateTree, baselineTree) {
  if (!p.requirements?.length) return { state: 'not_configured', ready: false, requirements: [], scope: 'No declared obligations; legacy configured-check verification remains available.' };
  const rows = p.requirements.map(r => {
    const baseline = evidence(p, r, 'baseline', baselineTree), candidate = evidence(p, r, 'candidate', candidateTree);
    const expectedBaseline = r.kind === 'preserve' ? 'passed' : 'failed';
    let state = [baseline.state, candidate.state].includes('stale') ? 'stale'
      : baseline.state === 'not_checked' || candidate.state === 'not_checked' ? 'not_checked'
      : baseline.state === 'error' || candidate.state === 'error' ? 'error'
      : baseline.state !== expectedBaseline ? (r.kind === 'preserve' ? 'pre_existing_failure' : 'removal_not_demonstrated')
      : candidate.state !== 'passed' ? 'failed' : 'passed';
    const contextComparison = r.command ? null : compareContexts(baseline.contextReview?.context, candidate.contextReview?.context);
    if (!r.command && state === 'passed' && (p.manualContexts?.baseline || p.manualContexts?.candidate) && contextComparison.state !== 'matching') state = contextComparison.state === 'different' ? 'context_mismatch' : 'not_checked';
    return { ...r, state, baseline, candidate, expectedBaseline,
      contextComparison,
      expectedFailureMarker: r.kind === 'remove' && r.command ? expectedFailureMarker(r.requirementId) : null };
  });
  const automated = p.verification;
  const automatedFresh = !!automated && automated.tree === candidateTree && automated.checksPassed;
  const ready = !p.blocked && p.cursor === p.tasks.length && automatedFresh && rows.every(r => r.state === 'passed');
  return { state: ready ? 'ready' : 'blocked', ready, baselineRevision: p.baselineRevision,
    contextCoverage: p.manualContexts?.baseline || p.manualContexts?.candidate ? 'declared' : 'not_declared',
    baselinePath: p.baseline?.candidate || null, requirements: rows,
    repairRequests: rows.filter(r => r.state !== 'passed').map(r => ({ requirementId: r.requirementId, state: r.state, command: r.command || null, checkId: r.checkId || null,
      reason: r.state === 'context_mismatch' ? 'manual_conditions_differ' : r.baseline.reason || r.candidate.reason || null, expectedFailureMarker: r.expectedFailureMarker,
      action: r.state === 'context_mismatch' ? 'Review the displayed browser/account/session/data differences. Repeat actual observations under intended comparable conditions; do not relabel old results as equivalent.' : r.baseline.reason === 'missing_failure_marker' ? `The original criterion exited 1 without ${r.expectedFailureMarker}. Ensure the same criterion exists and runs in the original; emit the marker as a separate stdout line only when its intended behavioral assertion fails, never for startup/import errors. Prepare a new plan if the criterion must change.` : r.state === 'pre_existing_failure' ? 'Investigate the failing original scenario; do not attribute it to reconstruction.' : r.state === 'removal_not_demonstrated' ? 'The scenario already passed on the original; review the removal criterion.' : 'Inspect evidence, repair candidate implementation or perform the missing/stale check. Keep requirements and protected inputs unchanged.' })),
    scope: 'Declared scenarios only. Removal needs a failing original and passing candidate for the same criterion (automated original exit 1 plus its exact expected-failure stdout marker, not a launch/timeout error). The marker is an explicit assertion contract, not independent proof of its correctness. Manual records are caller supplied. Freshness covers nonignored Git files/modes, not runtime, browser, database or external services. Not a semantic proof or security sandbox.' };
}
