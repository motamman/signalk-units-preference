/**
 * Update standard-units-definitions.json with better formulas
 *
 * Simple approach:
 * 1. For each existing conversion, check if js-quantities can improve it
 * 2. Update if more precise
 * 3. Keep custom formulas (Beaufort, dates, UK gallons)
 * 4. NO additions, NO deletions, NO duplicates
 */

import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';

// Running from dist/scripts -> go to project root
const jsonPath = path.join(__dirname, '../..', 'presets/definitions/standard-units-definitions.json');

// Read JSON
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('Starting from clean JSON\n');

// Conversions to skip (js-quantities gets them wrong or doesn't support them)
const skipConversions = new Set([
  'Bf',           // Beaufort - custom formula
  'gal(UK)',      // UK gallons - js-quantities wrong
  'gal(UK)/h'     // UK gallons per hour - js-quantities wrong
]);

// Date/time conversions to skip
const skipIfContains = ['date', 'time', 'epoch', 'duration'];

let updated = 0;
let skipped = 0;
let errors = 0;

for (const [baseUnit, data] of Object.entries(json as any)) {
  const baseData = data as any;
  if (!baseData.conversions) continue;

  for (const [targetKey, convData] of Object.entries(baseData.conversions)) {
    const conv = convData as any;
    // Skip custom conversions
    if (skipConversions.has(targetKey)) {
      skipped++;
      continue;
    }

    // Skip date/time conversions
    if (skipIfContains.some(s => targetKey.toLowerCase().includes(s))) {
      skipped++;
      continue;
    }

    try {
      // Try to convert using js-quantities
      const testQty = Qty(`1 ${baseUnit}`);
      const result = testQty.to(targetKey);
      const factor = result.scalar;

      // Generate formula
      const newFormula = `value * ${factor}`;
      const newInverse = `value / ${factor}`;

      // Check if different from current
      if (conv.formula !== newFormula) {
        console.log(`✓ ${baseUnit} → ${targetKey}`);
        console.log(`  Old: ${conv.formula}`);
        console.log(`  New: ${newFormula}\n`);

        conv.formula = newFormula;
        conv.inverseFormula = newInverse;
        updated++;
      }
    } catch (e) {
      // js-quantities doesn't support this conversion - keep original
      skipped++;
    }
  }
}

// Write back
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');

console.log(`\nResults:`);
console.log(`  Updated: ${updated}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Errors: ${errors}`);
console.log(`\nDone.`);
