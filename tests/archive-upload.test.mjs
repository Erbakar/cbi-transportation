import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {documentMime, MAX_DOCUMENT_BYTES} from '../lib/operations/documents.ts';
const source = fs.readFileSync('lib/operations/archive-upload.ts', 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
const {validateArchiveFile, archiveTransferMessage} = new Function('documentMime', 'MAX_DOCUMENT_BYTES', ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText + ';return {validateArchiveFile, archiveTransferMessage};')(documentMime, MAX_DOCUMENT_BYTES);
test('archive validates size, extension and content before uploading, reading only the header', async () => {
    for (const [name, content] of [['a.PDF', '%PDF-1.7'], ['a.png', new Uint8Array([137,80,78,71,13,10,26,10])], ['a.jpeg', new Uint8Array([255,216,255])]]) await validateArchiveFile(new File([content], name));
    for (const [name, content] of [['a.pdf', ''], ['a.pdf', 'fake'], ['a.exe', '%PDF-1.7'], ['a.png', '%PDF-1.7']]) await assert.rejects(validateArchiveFile(new File([content], name)));
    await assert.rejects(validateArchiveFile({size: MAX_DOCUMENT_BYTES + 1, slice() {throw Error('Must not read oversized file');}}), /10 MB/);
    await validateArchiveFile({name: 'a.pdf', size: MAX_DOCUMENT_BYTES, slice(start, end) {assert.equal(start, 0); assert.equal(end, 8); return new Blob(['%PDF-1.7']);}});
});
test('archive success requires explicit verified result for upload and recovery responses', () => {
    for (const result of [{status: 'synced', remoteId: 12}, {archive: {status: 'synced', remoteId: 12}}]) assert.equal(archiveTransferMessage(result), 'T-MAXX arşiv kaydı doğrulandı.');
    for (const result of [{}, {status: 'unknown'}, {archive: {status: 'synced'}}]) assert.match(archiveTransferMessage(result), /doğrulanamadı/);
    assert.match(archiveTransferMessage({archive: {status: 'pending', message: 'Bağlantı kesildi.'}}), /yerel arşivde korundu.*Bağlantı kesildi/);
});
