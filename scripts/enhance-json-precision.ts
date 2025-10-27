/**
 * Enhance standard-units-definitions.json with high-precision formulas from js-quantities
 *
 * Reads JSON, improves precision where possible, keeps custom formulas
 */

import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';
import { generateFormula } from '../src/QuantitiesHelper';

const jsonPath = path.join(__dirname, '../../..', 'presets/definitions/standard-units-definitions.json');

// Read existing JSON
const data = fs.readFileSync(jsonPath, 'utf8');
const json: Record<string, any> = JSON.parse(data);

console.log('📖 Read existing standard-units-definitions.json\n');

// Unit name mapping for js-quantities
const unitMapping: Record<string, string> = {
  'kn': 'knots',
  '°C': 'celsius',
  '°F': 'fahrenheit',
  'gal(UK)': 'gal(UK)',
  // Add others as needed
};

let updatedCount = 0;
let skippedCustom = 0;
let skippedUnsupported = 0;
let unchangedCount = 0;

for (const [baseUnit, baseData] of Object.entries(json)) {
  if (!baseData.conversions) continue;

  for (const [targetKey, convData] of Object.entries(baseData.conversions)) {
    const conv = convData as any;

    // Skip custom formulas (Beaufort, dates, duration)
    if (conv.formula.includes('^') ||
        conv.formula.includes('Math.') ||
        conv.formula.includes('format') ||
        conv.formula.includes('Date') ||
        targetKey.includes('date') ||
        targetKey.includes('time') ||
        targetKey === 'Bf') {
      skippedCustom++;
      continue;
    }

    // Map target unit name for js-quantities
    const targetForQty = unitMapping[targetKey] || targetKey;

    // Try to generate high-precision formula from js-quantities
    const generated = generateFormula(baseUnit, targetForQty);

    if (!generated) {
      skippedUnsupported++;
      continue;
    }

    // Check if different
    if (conv.formula !== generated.formula) {
      console.log(`🔄 ${baseUnit} → ${targetKey}`);
      console.log(`   Old: ${conv.formula}`);
      console.log(`   New: ${generated.formula}`);

      // Update with high-precision version
      json[baseUnit].conversions[targetKey] = {
        formula: generated.formula,
        inverseFormula: generated.inverseFormula,
        symbol: conv.symbol, // Keep existing symbol
        ...(conv.longName && { longName: conv.longName })
      };

      updatedCount++;
    } else {
      unchangedCount++;
    }
  }
}

// Write back
const jsonString = JSON.stringify(json, null, 2);
fs.writeFileSync(jsonPath, jsonString, 'utf8');

console.log(`\n✅ Enhanced precision in standard-units-definitions.json`);
console.log(`   Updated: ${updatedCount} conversions`);
console.log(`   Skipped custom: ${skippedCustom}`);
console.log(`   Skipped unsupported: ${skippedUnsupported}`);
console.log(`   Unchanged: ${unchangedCount}`);
console.log(`\n📁 File: presets/definitions/standard-units-definitions.json`);
