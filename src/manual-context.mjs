import { createHash } from 'node:crypto';

export const contextFields = ['browser', 'browserVersion', 'environment', 'appUrl', 'authState', 'accountAlias', 'role', 'session', 'dataState'];
export function validateContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !contextFields.includes(k))) throw new Error('Manual context must contain only documented browser/environment/account condition fields; never include credentials, cookies or tokens.');
  const context = {};
  for (const key of contextFields) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 512 || /[\x00-\x1f\x7f]/.test(value[key])) throw new Error(`Invalid manual context ${key}.`);
    context[key] = value[key].trim();
  }
  for (const key of ['browser', 'browserVersion', 'environment', 'authState', 'session', 'dataState']) if (!context[key]) throw new Error(`Manual context requires ${key}.`);
  if (!['signed_in', 'signed_out', 'unknown'].includes(context.authState)) throw new Error('authState must be signed_in, signed_out or unknown.');
  if (context.accountAlias && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(context.accountAlias)) throw new Error('accountAlias must be a non-personal test label (letters, digits, hyphens, underscores; max 64), not an email or account credential.');
  if (context.authState === 'signed_in' && (!context.accountAlias || !context.role)) throw new Error('Signed-in context requires a test accountAlias and role.');
  if (context.authState === 'signed_out' && (context.accountAlias || context.role)) throw new Error('Signed-out context must omit accountAlias and role.');
  if (context.appUrl) {
    let url; try { url = new URL(context.appUrl); } catch { throw new Error('appUrl must be an HTTP(S) address without credentials, query or fragment.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('appUrl must be an HTTP(S) address without credentials, query or fragment.');
    context.appUrl = url.href;
  }
  return context;
}
export function contextFingerprint(context) {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}
export function observationContext(p, record, phase) {
  const declared = p.manualContexts?.[phase];
  if (!record?.context || !record.contextRevision) return { state: 'not_recorded', confirmed: false, context: record?.context || null, revision: record?.contextRevision || null };
  const same = declared && declared.revision === record.contextRevision;
  return { state: !same ? 'stale' : record.context.authState === 'unknown' ? 'unconfirmed' : 'declared', confirmed: !!same && record.context.authState !== 'unknown', context: record.context, revision: record.contextRevision,
    scope: 'Caller-declared conditions, not automatically observed or authenticated browser/account state.' };
}
export function compareContexts(baseline, candidate) {
  const differences = contextFields.filter(k => baseline?.[k] !== candidate?.[k]).map(field => ({ field, baseline: baseline?.[field] ?? null, candidate: candidate?.[field] ?? null, affectsComparison: field !== 'appUrl' }));
  const state = !baseline || !candidate || baseline.authState === 'unknown' || candidate.authState === 'unknown' ? 'unconfirmed' : differences.some(d => d.affectsComparison) ? 'different' : 'matching';
  return { state, differences, scope: 'Compares declared conditions only. Different app URLs are displayed but allowed for separate original/candidate servers. Matching labels do not prove the external state stayed unchanged.' };
}
