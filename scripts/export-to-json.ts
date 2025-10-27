/**
 * Update standard-units-definitions.json with enhanced formulas from builtInUnits.ts
 *
 * RULES:
 * - Match conversions by SYMBOL, not key name
 * - Replace formulas that match
 * - Add new conversions if symbol doesn't exist
 * - NO duplicates (same symbol = same conversion)
 * - Skip verbose Math.pow formulas, keep cleaner mathjs ^ syntax
 */

import { builtInUnits } from '../src/builtInUnits';
import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(__dirname, '../../..', 'presets/definitions/standard-units-definitions.json');

// Read existing JSON
const data = fs.readFileSync(jsonPath, 'utf8');
const json: Record<string, any> = JSON.parse(data);

console.log('📖 Read existing standard-units-definitions.json\n');

// Build lookup from builtInUnits.ts: baseUnit -> symbol -> {key, conversion}
const tsLookup: Record<string, Record<string, {key: string, conversion: any}>> = {};

for (const [, metadata] of Object.entries(builtInUnits)) {
  const { baseUnit, conversions } = metadata;

  if (!tsLookup[baseUnit]) {
    tsLookup[baseUnit] = {};
  }

  if (conversions) {
    for (const [targetKey, conv] of Object.entries(conversions)) {
      const symbol = conv.symbol;

      // Skip verbose Math.pow formulas - prefer mathjs ^ syntax
      if (conv.formula.includes('Math.pow') || conv.inverseFormula.includes('Math.pow')) {
        continue;
      }

      tsLookup[baseUnit][symbol] = {
        key: targetKey,
        conversion: {
          formula: conv.formula,
          inverseFormula: conv.inverseFormula,
          symbol: conv.symbol,
          ...(conv.longName && { longName: conv.longName })
        }
      };
    }
  }
}

// Update JSON: match by symbol
let updatedCount = 0;
let addedCount = 0;
let unchangedCount = 0;
let skippedDuplicates = 0;

for (const [baseUnit, baseData] of Object.entries(json)) {
  if (!baseData.conversions) {
    baseData.conversions = {};
  }

  // Build symbol map for existing JSON conversions
  const jsonSymbolMap: Record<string, string> = {};
  for (const [key, conv] of Object.entries(baseData.conversions)) {
    const jsonConv = conv as any;
    jsonSymbolMap[jsonConv.symbol] = key;
  }

  // Update existing conversions (match by symbol)
  for (const [jsonKey, jsonConv] of Object.entries(baseData.conversions)) {
    const jsonConvTyped = jsonConv as any;
    const symbol = jsonConvTyped.symbol;

    // Find matching TS conversion by symbol
    const tsMatch = tsLookup[baseUnit]?.[symbol];

    if (tsMatch) {
      // Match found - check if different
      if (jsonConvTyped.formula !== tsMatch.conversion.formula) {
        console.log(`🔄 ${baseUnit} → ${symbol} (key: ${jsonKey})`);
        console.log(`   Old: ${jsonConvTyped.formula}`);
        console.log(`   New: ${tsMatch.conversion.formula}`);

        // Replace with TypeScript version
        baseData.conversions[jsonKey] = tsMatch.conversion;
        updatedCount++;
      } else {
        unchangedCount++;
      }
    } else {
      // No TS match - keep JSON version
      unchangedCount++;
    }
  }

  // Add new conversions from TypeScript (by symbol)
  const tsConversions = tsLookup[baseUnit];
  if (tsConversions) {
    for (const [symbol, tsData] of Object.entries(tsConversions)) {
      // Check if this symbol already exists in JSON
      if (!jsonSymbolMap[symbol]) {
        console.log(`➕ ${baseUnit} → ${symbol} (key: ${tsData.key})`);
        baseData.conversions[tsData.key] = tsData.conversion;
        addedCount++;
        jsonSymbolMap[symbol] = tsData.key; // Track to avoid dups
      } else {
        // Symbol already exists with different key - skip duplicate
        skippedDuplicates++;
      }
    }
  }
}

// Add completely new base units from TypeScript
for (const [baseUnit, tsSymbols] of Object.entries(tsLookup)) {
  if (!json[baseUnit]) {
    console.log(`✨ New base unit: ${baseUnit}`);

    // Build conversions object from symbol map
    const conversions: Record<string, any> = {};
    for (const [symbol, tsData] of Object.entries(tsSymbols)) {
      conversions[tsData.key] = tsData.conversion;
    }

    json[baseUnit] = { conversions };
    addedCount += Object.keys(conversions).length;
  }
}

// Write back to JSON
const jsonString = JSON.stringify(json, null, 2);
fs.writeFileSync(jsonPath, jsonString, 'utf8');

console.log(`\n✅ Updated standard-units-definitions.json`);
console.log(`   Replaced: ${updatedCount} conversions`);
console.log(`   Added: ${addedCount} conversions`);
console.log(`   Skipped duplicates: ${skippedDuplicates}`);
console.log(`   Kept unchanged: ${unchangedCount} conversions`);
console.log(`   Total conversions now: ${Object.values(json).reduce((sum: number, unit: any) => sum + Object.keys(unit.conversions || {}).length, 0)}`);
console.log(`\n📁 File: presets/definitions/standard-units-definitions.json`);
