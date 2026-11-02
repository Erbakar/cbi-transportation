// Only operator-entered numeric fields use this normalization. Document evidence
// and identifiers (HS, booking, postcodes, container numbers) are never rewritten.
export const manualNumberKeys=['packageCount','grossWeightKg','netWeightKg','volumeM3'];
export function normalizeManualNumber(input:string):string {
 const value=input.trim();
 if(/^\d+(?:\.\d+)?$/.test(value))return value; // Preserve existing decimal-dot values.
 if(/^\d+,\d+$/.test(value))return value.replace(',','.');
 if(/^\d{1,3}(?:\.\d{3})+,\d+$/.test(value))return value.replaceAll('.','').replace(',','.');
 if(/^\d{1,3}(?:,\d{3})+\.\d+$/.test(value))return value.replaceAll(',','');
 if(/^\d{1,3}(?:\.\d{3}){2,}$/.test(value))return value.replaceAll('.','');
 if(/^\d{1,3}(?:,\d{3}){2,}$/.test(value))return value.replaceAll(',','');
 if(/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(value))return value.replace(/[ \u00a0\u202f]/g,'').replace(',','.');
 return value; // Ambiguous or malformed input remains visible to validation.
}
export function normalizeManualFields<T extends Record<string,string>>(fields:T):T {
 return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,manualNumberKeys.includes(key)?normalizeManualNumber(value):value])) as T;
}
