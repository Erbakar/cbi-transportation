// Correct only unambiguous normalization of a single quoted kilogram value.
// Multiple amounts, identifiers, other units and ambiguous dot notation remain
// untouched so real conflicts cannot be hidden by a locale guess.
export function quotedKilograms(source:string):string|null {
 if(/[-−–]\s*\d|%/.test(source))return null;
 if(!/\b(?:KG|KGS|KILOGRAMS?)\b/i.test(source)||/\b(?:TON|TONNES?|TONS?|LBS?|POUNDS?)\b/i.test(source))return null;
 const numbers=source.match(/[0-9]+(?:[.,][0-9]+)*/g);if(numbers?.length!==1)return null;
 const value=numbers[0];let normalized:string;
 if(/^\d{1,3}(?:\.\d{3})+,\d+$/.test(value))normalized=value.replaceAll('.','').replace(',','.');
 else if(/^\d{1,3}(?:,\d{3})+\.\d+$/.test(value))normalized=value.replaceAll(',','');
 else if(/^\d+$/.test(value))normalized=value;
 else return null;
 return String(Number(normalized));
}
