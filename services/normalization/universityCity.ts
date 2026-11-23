/**
 * services/normalization/universityCity.ts
 *
 * The CRM applied-program record carries only university name, course and country — no city.
 * For well-known Italian universities the city is a public, verifiable fact, so it is looked up
 * by name. Anything not recognised returns "" and stays a visible [MISSING: destination.city]
 * placeholder for the counsellor — a city is never guessed.
 */

const ITALIAN_UNIVERSITY_CITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/politecnico di milano/i, "Milan"],
  [/politecnico di torino/i, "Turin"],
  [/politecnico di bari/i, "Bari"],
  [/bocconi/i, "Milan"],
  [/\bsapienza\b|la sapienza/i, "Rome"],
  [/tor vergata/i, "Rome"],
  [/roma tre|rome tre/i, "Rome"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:padua|padova)|^padua|^padova/i, "Padua"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+bologna/i, "Bologna"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+messina/i, "Messina"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+catania/i, "Catania"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:turin|torino)/i, "Turin"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:milan|milano)(?!\s*-?\s*bicocca)/i, "Milan"],
  [/milano[- ]bicocca|milan[- ]bicocca/i, "Milan"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:florence|firenze)/i, "Florence"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:naples|napoli)(?:\s+federico ii)?/i, "Naples"],
  [/federico ii/i, "Naples"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+pisa/i, "Pisa"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+pavia/i, "Pavia"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+parma/i, "Parma"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:genoa|genova)/i, "Genoa"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+verona/i, "Verona"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+trento/i, "Trento"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+trieste/i, "Trieste"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+bari/i, "Bari"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+palermo/i, "Palermo"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+siena/i, "Siena"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+salerno/i, "Salerno"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+perugia/i, "Perugia"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+ferrara/i, "Ferrara"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+modena/i, "Modena"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+brescia/i, "Brescia"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+cagliari/i, "Cagliari"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+udine/i, "Udine"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:venice|venezia)|ca['’]? foscari/i, "Venice"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+cassino|cassino/i, "Cassino"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+teramo/i, "Teramo"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+bergamo/i, "Bergamo"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+foggia/i, "Foggia"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+urbino/i, "Urbino"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+macerata/i, "Macerata"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+sassari/i, "Sassari"],
  [/(?:university|università|universita)\s+(?:of|degli studi di|di)\s+(?:l['’]?\s?aquila)/i, "L'Aquila"],
];

/** Returns the city for a recognised university, or "" when unknown. */
export function lookupUniversityCity(universityName?: string | null): string {
  const name = (universityName || "").trim();
  if (!name) return "";
  for (const [pattern, city] of ITALIAN_UNIVERSITY_CITIES) {
    if (pattern.test(name)) return city;
  }
  return "";
}
