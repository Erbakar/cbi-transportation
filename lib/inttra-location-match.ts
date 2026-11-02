// T-MAXX ports carry a country + port code. City names alone are not unique.
export function matchInttraLocation(raw:string,query:string,cities:string[][]){
 const code=raw.match(/\s+-\s+([A-Z]{2})\s+-\s+([A-Z0-9]{3})$/i);
 const matches=code
  ?cities.filter(([label])=>label.toUpperCase().endsWith('('+code[1].toUpperCase()+code[2].toUpperCase()+')'))
  :cities.filter(([label])=>label.split(',')[0].trim().toUpperCase()===query.toUpperCase());
 return matches.length===1?matches[0][1]:'';
}
