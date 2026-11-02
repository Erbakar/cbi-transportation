import {db} from './runtime';
import type {Row} from './records';

// Older upload fingerprints include document roles. Match the actual current
// document set too, so a different role/order/name cannot create another draft.
export async function findSameDocumentSet(owner:string,hashes:string[]):Promise<Row|null>{
  if(!hashes.length)return null;
  const placeholders=hashes.map(()=>'?').join(',');
  return db().prepare(`
    SELECT r.* FROM records r
    WHERE r.owner=? AND r.status<>'deleted'
      AND (SELECT COUNT(*) FROM record_documents d
           WHERE d.record_id=r.id AND d.revision=r.revision)=?
      AND (SELECT COUNT(DISTINCT d.hash) FROM record_documents d
           WHERE d.record_id=r.id AND d.revision=r.revision
             AND d.hash IN (${placeholders}))=?
    ORDER BY r.created_at DESC,r.id DESC LIMIT 1
  `).bind(owner,hashes.length,...hashes,hashes.length).first<Row>();
}
