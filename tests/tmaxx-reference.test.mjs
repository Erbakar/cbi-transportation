import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeTmaxxReference} from '../lib/tmaxx-reference.ts';
test('normalizes a complete shorthand without guessing a partial reference',()=>{
 for(const value of ['se261000754','SE261000754','s.e.26.10.00754',' S.E.26.10.00754 '])assert.equal(normalizeTmaxxReference(value),'S.E.26.10.00754');
 for(const value of ['S.E.TEST','se2610754','se261300754','YK.S.E.26.10.00893'])assert.equal(normalizeTmaxxReference(value),value);
});
