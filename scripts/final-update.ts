/**
 * Update JSON formulas from js-quantities
 * Match by key name with mapping where needed
 */

import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(__dirname, '../..', 'presets/definitions/standard-units-definitions.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Map JSON keys to js-quantities unit names
const keyMapping: Record<string, string> = {
  'nm': 'nmi',    // nautical miles
  'kn': 'kt',     // knots
};

// Skip these completely
const skip = new Set(['Bf', 'gal(UK)', 'gal(UK)/h']);
const skipContains = ['date', 'time', 'epoch', 'duration'];

let updated = 0;

for (const [baseUnit, data] of Object.entries(json as any)) {
  const baseData = data as any;
  if (!baseData.conversions) continue;

  for (const [key, convData] of Object.entries(baseData.conversions)) {
    const conv = convData as any;

    if (skip.has(key)) continue;
    if (skipContains.some(s => key.toLowerCase().includes(s))) continue;

    try {
      const targetUnit = keyMapping[key] || key;
      const factor = Qty(`1 ${baseUnit}`).to(targetUnit).scalar;
      const newFormula = `value * ${factor}`;
      const newInverse = `value / ${factor}`;

      if (conv.formula !== newFormula) {
        console.log(`${baseUnit} → ${key}: ${newFormula}`);
        conv.formula = newFormula;
        conv.inverseFormula = newInverse;
        updated++;
      }
    } catch (e) {
      // Skip unsupported
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
console.log(`\n✅ Updated ${updated} formulas`);
