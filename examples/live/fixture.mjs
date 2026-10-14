import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
export function setupFixture(live) {
const repo = path.join(live, 'notebook');
fs.mkdirSync(repo, {recursive:true});
fs.mkdirSync(path.join(live,'evidence'));
const git = args => { const r = spawnSync('git', args, {cwd:repo,encoding:'utf8'}); if(r.status) throw Error(r.stderr); };
fs.writeFileSync(path.join(repo,'package.json'),'{"type":"module","private":true}\n');
fs.writeFileSync(path.join(repo,'notes.mjs'),'export function addNote(notes, text) {\n  return [...notes, { text }];\n}\n');
git(['init','-q']); git(['config','user.name','Unmix live validation']); git(['config','user.email','validation@example.invalid']); git(['add','.']); git(['commit','-qm','Initial local notebook']);
fs.writeFileSync(path.join(live,'oracle.mjs'), `import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const n = await import(pathToFileURL(path.join(process.cwd(),'notes.mjs')));
assert.equal('createAuthor' in n, false);
let notes = n.addNote([], '  First\\r\\nline  ');
assert.deepEqual(notes, [{text:'First\\nline'}]);
notes = n.addNote(notes, ' Second ');
notes = n.tagNote(notes, 0, ['z','a','a']);
assert.deepEqual(notes[0].tags, ['a','z']);
assert.equal(notes[1].text, 'Second');
assert.deepEqual(JSON.parse(n.exportNotes(notes)), [{text:'First\\nline',tags:['a','z']},{text:'Second',tags:[]}]);
assert.equal(n.exportNotes(notes), n.exportNotes(notes));
assert.deepEqual(n.addNote([], '  Привет 😀  '), [{text:'Привет 😀'}]);
assert.deepEqual(n.tagNote([{text:'x'}],0,[]), [{text:'x',tags:[]}]);
console.log('Independent removal and retained-behavior oracle passed');
`);
fs.writeFileSync(path.join(live,'record-prompt.txt'), `Implement four tasks in this existing local notebook using the Unmix MCP server. Do not use the Unmix CLI or directly edit its ledger. Call unmix_init, then unmix_begin BEFORE each task and unmix_finish afterward. Use IDs below and declare dependencies. Write behavioral node:test tests for each task and register ["node","--test","TASK.test.mjs"]. Do not commit or change HEAD; Unmix snapshots preserve it. No npm dependencies.
1. identity: export createAuthor(name) returning {name}; change addNote(notes,text,author) to require author.name and save author name as author on the new note.
2. tags: export tagNote(notes,index,tags), return a new notes array with sorted deduplicated tags on selected note, preserving its other fields. Declare identity dependency. Tests should call addNote with {name:'Ada'} directly so they test tagging rather than the author factory.
3. normalization: normalize input text in addNote: trim surrounding whitespace and convert CRLF to LF; preserve Unicode. Declare identity dependency. Tests should call addNote with {name:'Ada'} directly.
4. export: export exportNotes(notes) returning deterministic JSON string of an array of objects with text, tags (empty if missing), author. Declare tags and identity dependencies. Test that text and sorted tags survive JSON export; do not assert author metadata in this retained-behavior test.
Run all four test files. Read timeline and report recorded tasks. Do not reconstruct yet. Work only in ${repo}.`);
fs.writeFileSync(path.join(live,'remove-prompt.txt'), `Use the Unmix MCP tools to remove identity from this recorded notebook. Keep tags, text normalization and JSON export. Notes must be usable without an author; remove createAuthor and the mandatory author requirement. Guest notes and their exported JSON must contain no author metadata. Preserve backward compatibility for old callers that explicitly supply {name}: retain this optional author field so the retained tagging contract still holds. Do not use a prewritten repair script or Unmix CLI or edit the ledger. Call timeline, prepare, codex_prompt. Adapt blocked tasks yourself using the snapshot diffs and actual candidate files; stage resolved conflicts and call resume until replay completes. Edit ONLY the returned candidate. Preserve all retained test files byte-for-byte. Register the independent removal check ["node",${JSON.stringify(path.join(live,'oracle.mjs'))}] in prepare. That oracle is outside the candidate and must not be changed. Add your own removal regression test in the candidate too. Call verify and inspect; fix implementation errors and reverify if necessary. Do not merge or commit original changes. Report candidate, blocked tasks, actual edits and verification results.`);
return repo;
}
