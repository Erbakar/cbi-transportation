// Only expand the unambiguous native position shape; never guess missing digits.
export function normalizeTmaxxReference(value:string){
 const raw=value.trim();
 const match=raw.match(/^([ST])\.?([EI])\.?(\d{2})\.?(0[1-9]|1[0-2])\.?(\d{5})$/i);
 return match?match.slice(1).join('.').toUpperCase():raw;
}
