/**
 * Explore js-quantities Conversions
 *
 * Discovers what conversions js-quantities supports for our base units
 */

import * as Qty from 'js-quantities';
import { categoryToBaseUnit } from '../src/builtInUnits';

// Unit name mapping: our names → js-quantities names
const unitMapping: Record<string, string> = {
  // Speed
  'm/s': 'm/s',

  // Temperature
  'K': 'tempK',

  // Pressure
  'Pa': 'Pa',

  // Distance
  'm': 'm',

  // Angle
  'rad': 'rad',

  // Volume
  'm3': 'm^3',

  // Electrical
  'V': 'V',
  'A': 'A',
  'W': 'W',

  // Charge
  'C': 'C',

  // Frequency
  'Hz': 'Hz',

  // Time
  's': 's',

  // Ratio/percentage
  'ratio': 'unity',  // dimensionless

  // Volume rate
  'm3/s': 'm^3/s',

  // Angular velocity
  'rad/s': 'rad/s'
};

// Potential target units to test for each category
const targetUnitsToTest: Record<string, string[]> = {
  speed: ['kt', 'knots', 'km/h', 'mph', 'ft/s', 'm/s'],
  temperature: ['tempC', 'tempF', 'tempK', 'celsius', 'fahrenheit', 'kelvin'],
  pressure: ['Pa', 'hPa', 'kPa', 'bar', 'mbar', 'psi', 'atm', 'inHg', 'mmHg', 'torr'],
  distance: ['m', 'km', 'mi', 'nmi', 'ft', 'yd', 'in', 'cm', 'mm', 'fathom'],
  depth: ['m', 'ft', 'fathom'],
  angle: ['rad', 'deg', 'degree', 'grad'],
  volume: ['m^3', 'liter', 'L', 'gal', 'gallon', 'qt', 'quart', 'pt', 'pint', 'cup'],
  voltage: ['V', 'mV', 'kV'],
  current: ['A', 'mA', 'kA'],
  power: ['W', 'kW', 'MW', 'hp', 'horsepower'],
  percentage: ['unity', 'percent', '%'],
  frequency: ['Hz', 'kHz', 'MHz', 'GHz', 'rpm'],
  time: ['s', 'ms', 'min', 'minute', 'hour', 'h', 'day', 'd', 'week', 'year'],
  charge: ['C', 'Ah', 'ampere-hour', 'mAh'],
  volumeRate: ['m^3/s', 'L/s', 'L/min', 'L/h', 'gal/s', 'gal/min', 'gal/h'],
  angularVelocity: ['rad/s', 'deg/s', 'rpm']
};

console.log('═══════════════════════════════════════════════════════════════════');
console.log('   Exploring js-quantities Conversion Support');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Explore each category
for (const [category, baseUnit] of Object.entries(categoryToBaseUnit)) {
  console.log(`\n📦 Category: ${category.toUpperCase()}`);
  console.log(`   Base Unit: ${baseUnit}`);

  // Get the js-quantities equivalent name
  const qtyBaseUnit = unitMapping[baseUnit];

  if (!qtyBaseUnit) {
    console.log(`   ⚠️  No mapping found for base unit "${baseUnit}"\n`);
    continue;
  }

  console.log(`   js-quantities name: ${qtyBaseUnit}`);

  // Test if base unit is valid
  try {
    const testQty = Qty(`1 ${qtyBaseUnit}`);
    console.log(`   ✓ Base unit is supported\n`);

    // Get the list of potential target units for this category
    const targetsToTest = targetUnitsToTest[category] || [];
    const supportedConversions: string[] = [];
    const unsupportedConversions: string[] = [];

    console.log(`   Testing ${targetsToTest.length} potential conversions...\n`);

    for (const targetUnit of targetsToTest) {
      try {
        const converted = Qty(`1 ${qtyBaseUnit}`).to(targetUnit);
        const factor = converted.scalar;
        supportedConversions.push(`${targetUnit} (factor: ${factor})`);
      } catch (e) {
        unsupportedConversions.push(targetUnit);
      }
    }

    // Display results
    if (supportedConversions.length > 0) {
      console.log(`   ✅ SUPPORTED CONVERSIONS (${supportedConversions.length}):`);
      for (const conv of supportedConversions) {
        console.log(`      • ${conv}`);
      }
    }

    if (unsupportedConversions.length > 0) {
      console.log(`\n   ❌ UNSUPPORTED (${unsupportedConversions.length}): ${unsupportedConversions.join(', ')}`);
    }

  } catch (e) {
    console.log(`   ❌ Base unit "${qtyBaseUnit}" is NOT supported by js-quantities`);
    console.log(`   Error: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  console.log('   ' + '─'.repeat(60));
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('   Exploration Complete');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Show available kinds
console.log('📚 All available quantity kinds in js-quantities:\n');
try {
  const qty = Qty('1 m');
  // @ts-ignore - accessing internal property for exploration
  const kinds = qty.constructor.getKinds ? qty.constructor.getKinds() : 'Method not available';
  console.log(kinds);
} catch (e) {
  console.log('Could not retrieve kinds');
}
