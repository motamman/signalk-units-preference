import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(__dirname, '../..', 'presets/definitions/standard-units-definitions.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

let added = 0;
let updated = 0;

for (const [baseUnit, data] of Object.entries(json as any)) {
  const baseData = data as any;
  if (!baseData.conversions) baseData.conversions = {};

  let kind: string;
  try {
    kind = Qty(`1 ${baseUnit}`).kind();
  } catch {
    continue;
  }

  let allUnits: string[];
  try {
    allUnits = Qty.getUnits(kind);
  } catch {
    continue;
  }

  for (const targetUnit of allUnits) {
    try {
      const factor = Qty(`1 ${baseUnit}`).to(targetUnit).scalar;
      const formula = `value * ${factor}`;
      const inverse = `value / ${factor}`;

      if (baseData.conversions[targetUnit]) {
        if (baseData.conversions[targetUnit].formula !== formula) {
          console.log(`UPDATE ${baseUnit} → ${targetUnit}`);
          baseData.conversions[targetUnit].formula = formula;
          baseData.conversions[targetUnit].inverseFormula = inverse;
          updated++;
        }
      } else {
        console.log(`ADD ${baseUnit} → ${targetUnit}`);
        baseData.conversions[targetUnit] = {
          formula,
          inverseFormula: inverse,
          symbol: targetUnit
        };
        added++;
      }
    } catch {}
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
console.log(`\n✅ Added: ${added}, Updated: ${updated}`);
