/**
 * Complete JSON update from js-quantities
 *
 * 1. ADD new conversions
 * 2. FIX/UPDATE existing conversions with better precision
 * 3. LEAVE custom formulas alone (Beaufort, dates, UK gallons)
 */

import Qty from 'js-quantities';
import * as fs from 'fs';
import * as path from 'path';
import { getAvailableTargetUnits, generateFormula } from '../src/QuantitiesHelper';

// Running from dist/scripts/scripts -> go up 3 levels
const jsonPath = path.join(__dirname, '../../..', 'presets/definitions/standard-units-definitions.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('Starting from clean JSON\n');

// Key mapping for js-quantities
const keyMapping: Record<string, string> = {
  'nm': 'nmi',    // nautical miles
  'kn': 'kt',     // knots
};

// Skip these (custom formulas)
const skipKeys = new Set(['Bf', 'gal(UK)', 'gal(UK)/h']);
const skipIfContains = ['date', 'time', 'epoch', 'duration'];

let added = 0;
let updated = 0;
let skipped = 0;

for (const [baseUnit, data] of Object.entries(json as any)) {
  const baseData = data as any;
  if (!baseData.conversions) baseData.conversions = {};

  // Build map: symbol -> key
  const symbolToKey: Record<string, string> = {};
  for (const [key, conv] of Object.entries(baseData.conversions) as any[]) {
    symbolToKey[conv.symbol] = key;
  }

  // UPDATE existing conversions
  for (const [key, convData] of Object.entries(baseData.conversions)) {
    const conv = convData as any;

    // Skip custom
    if (skipKeys.has(key)) {
      skipped++;
      continue;
    }
    if (skipIfContains.some(s => key.toLowerCase().includes(s))) {
      skipped++;
      continue;
    }

    try {
      const targetUnit = keyMapping[key] || key;
      const factor = Qty(`1 ${baseUnit}`).to(targetUnit).scalar;
      const newFormula = `value * ${factor}`;

      if (conv.formula !== newFormula) {
        console.log(`UPDATE ${baseUnit} → ${key}: ${newFormula}`);
        conv.formula = newFormula;
        conv.inverseFormula = `value / ${factor}`;
        updated++;
      }
    } catch (e) {
      // Can't update - leave as is
      skipped++;
    }
  }

  // ADD new conversions
  const available = getAvailableTargetUnits(baseUnit);
  for (const target of available) {
    // Check if this symbol already exists
    if (symbolToKey[target.symbol]) continue;

    const generated = generateFormula(baseUnit, target.unit);
    if (!generated) continue;

    // Skip verbose formulas
    if (generated.formula.includes('Math.pow')) continue;

    console.log(`ADD ${baseUnit} → ${target.unit} (${target.symbol})`);

    baseData.conversions[target.unit] = {
      formula: generated.formula,
      inverseFormula: generated.inverseFormula,
      symbol: generated.symbol
    };

    symbolToKey[target.symbol] = target.unit;
    added++;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');

console.log(`\n✅ DONE`);
console.log(`   Added: ${added}`);
console.log(`   Updated: ${updated}`);
console.log(`   Skipped: ${skipped}`);
