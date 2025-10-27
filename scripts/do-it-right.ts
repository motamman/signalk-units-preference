import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(__dirname, '../../..', 'presets/definitions/standard-units-definitions.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const keyMap: Record<string, string> = {
  'nm': 'nmi',
  'kn': 'kt',
};

let added = 0;
let updated = 0;

for (const [baseUnit, data] of Object.entries(json as any)) {
  const baseData = data as any;
  if (!baseData.conversions) baseData.conversions = {};

  // Get quantity kind
  let kind: string;
  try {
    kind = Qty(`1 ${baseUnit}`).kind();
  } catch {
    continue;
  }

  // Get ALL units for this kind
  let allUnits: string[];
  try {
    allUnits = Qty.getUnits(kind);
  } catch {
    continue;
  }

  // Try each unit
  for (const targetUnit of allUnits) {
    try {
      const factor = Qty(`1 ${baseUnit}`).to(targetUnit).scalar;
      const formula = `value * ${factor}`;
      const inverse = `value / ${factor}`;

      // Check if this key exists
      if (baseData.conversions[targetUnit]) {
        // UPDATE if different
        if (baseData.conversions[targetUnit].formula !== formula) {
          console.log(`UPDATE ${baseUnit} → ${targetUnit}`);
          baseData.conversions[targetUnit].formula = formula;
          baseData.conversions[targetUnit].inverseFormula = inverse;
          updated++;
        }
      } else {
        // ADD new
        console.log(`ADD ${baseUnit} → ${targetUnit}`);
        baseData.conversions[targetUnit] = {
          formula,
          inverseFormula: inverse,
          symbol: targetUnit
        };
        added++;
      }
    } catch {
      // Can't convert - skip
    }
  }

  // Also try mapped names
  for (const [jsonKey, qtyName] of Object.entries(keyMap)) {
    if (baseData.conversions[jsonKey]) {
      try {
        const factor = Qty(`1 ${baseUnit}`).to(qtyName).scalar;
        const formula = `value * ${factor}`;

        if (baseData.conversions[jsonKey].formula !== formula) {
          console.log(`UPDATE ${baseUnit} → ${jsonKey} (mapped from ${qtyName})`);
          baseData.conversions[jsonKey].formula = formula;
          baseData.conversions[jsonKey].inverseFormula = `value / ${factor}`;
          updated++;
        }
      } catch {}
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
console.log(`\n✅ Added: ${added}, Updated: ${updated}`);
