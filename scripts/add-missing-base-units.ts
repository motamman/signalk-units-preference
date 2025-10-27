import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(__dirname, '..', 'presets/definitions/standard-units-definitions.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Missing base units to add
const newBaseUnits = [
  { unit: 'J', longName: 'Joule' },
  { unit: 'kg', longName: 'Kilogram' },
  { unit: 'm2', longName: 'Square meter' },
  { unit: 'deg', longName: 'Degree' },
  { unit: 'bool', longName: 'Boolean' },
  { unit: 'ISO-8601 (UTC)', longName: 'Timestamp' },
];

let baseUnitsAdded = 0;
let conversionsAdded = 0;

for (const { unit: baseUnit, longName } of newBaseUnits) {
  // Check if base unit already exists
  if (json[baseUnit]) {
    console.log(`SKIP ${baseUnit} (already exists)`);
    continue;
  }

  console.log(`\n--- Adding base unit: ${baseUnit} ---`);

  // Create base unit entry
  json[baseUnit] = {
    longName,
    conversions: {}
  };
  baseUnitsAdded++;

  // For boolean and timestamp, no conversions
  if (baseUnit === 'bool' || baseUnit === 'ISO-8601 (UTC)') {
    console.log(`  (no conversions for ${baseUnit})`);
    continue;
  }

  // Get quantity kind
  let kind: string;
  try {
    kind = Qty(`1 ${baseUnit}`).kind();
  } catch (error) {
    console.log(`  ERROR: Cannot get kind for ${baseUnit}`);
    continue;
  }

  // Get ALL units for this kind
  let allUnits: string[];
  try {
    allUnits = Qty.getUnits(kind);
  } catch (error) {
    console.log(`  ERROR: Cannot get units for kind ${kind}`);
    continue;
  }

  // Add conversions for each compatible unit
  for (const targetUnit of allUnits) {
    try {
      const factor = Qty(`1 ${baseUnit}`).to(targetUnit).scalar;
      const formula = `value * ${factor}`;
      const inverse = `value / ${factor}`;

      console.log(`  ADD ${baseUnit} → ${targetUnit}`);
      json[baseUnit].conversions[targetUnit] = {
        formula,
        inverseFormula: inverse,
        symbol: targetUnit
      };
      conversionsAdded++;
    } catch {
      // Can't convert - skip
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
console.log(`\n✅ Added ${baseUnitsAdded} base units with ${conversionsAdded} conversions`);
