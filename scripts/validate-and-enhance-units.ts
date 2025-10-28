/**
 * Validate and Enhance Built-in Units
 *
 * This script:
 * 1. Validates existing formulas against js-quantities
 * 2. Identifies formulas that could be more precise
 * 3. Generates missing conversions from js-quantities
 * 4. Outputs an enhanced builtInUnits.ts file
 */

import Qty from 'js-quantities';
import { builtInUnits, categoryToBaseUnit } from '../src/builtInUnits';
import { getAvailableTargetUnits, generateFormula } from '../src/QuantitiesHelper';
import * as fs from 'fs';
import * as path from 'path';

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m'
};

interface ValidationResult {
  path: string;
  baseUnit: string;
  targetUnit: string;
  status: 'perfect' | 'close' | 'different' | 'missing' | 'custom' | 'unsupported';
  currentFormula?: string;
  suggestedFormula?: string;
  currentFactor?: number;
  suggestedFactor?: number;
  errorPercent?: number;
  message?: string;
}

interface EnhancedConversion {
  formula: string;
  inverseFormula: string;
  symbol: string;
  longName?: string;
  source: 'original' | 'js-quantities' | 'custom';
}

const results: ValidationResult[] = [];
const enhancedUnits: Record<string, any> = {};

// Formulas that should be kept as-is (custom/special)
const customFormulas = new Set([
  'Beaufort', 'Bf', // Beaufort scale
  'duration-verbose', 'duration-compact', // Duration formatting
  'HH:MM:SS', 'MM:SS', 'DD:HH:MM:SS', // Time formatting
  'MM.xx', 'HH.xx', 'DD.xx', // Decimal time
  'short-date', 'long-date', 'time-24hrs', 'time-am/pm', // Date formatting
  'epoch-seconds', 'RFC 3339 (UTC)', 'Epoch Seconds' // Date/time base units
]);

/**
 * Extract conversion factor from a simple formula
 */
function extractFactor(formula: string): number | null {
  // Match: "value * NUMBER"
  const multiplyMatch = formula.match(/value\s*\*\s*([\d.e+-]+)/);
  if (multiplyMatch) {
    return parseFloat(multiplyMatch[1]);
  }

  // Match: "value / NUMBER"
  const divideMatch = formula.match(/value\s*\/\s*([\d.e+-]+)/);
  if (divideMatch) {
    return 1 / parseFloat(divideMatch[1]);
  }

  // Complex formula (offset, etc.)
  return null;
}

/**
 * Check if a formula is custom/special
 */
function isCustomFormula(targetUnit: string, baseUnit: string): boolean {
  return customFormulas.has(targetUnit) ||
         customFormulas.has(baseUnit) ||
         targetUnit.includes('date') ||
         targetUnit.includes('time') ||
         targetUnit.includes('duration');
}

/**
 * Validate a single conversion
 */
function validateConversion(
  pathName: string,
  baseUnit: string,
  targetUnit: string,
  currentFormula: string,
  currentSymbol: string
): ValidationResult {
  // Skip custom formulas
  if (isCustomFormula(targetUnit, baseUnit)) {
    return {
      path: pathName,
      baseUnit,
      targetUnit,
      status: 'custom',
      currentFormula,
      message: 'Custom formula (keeping as-is)'
    };
  }

  // Try to generate from js-quantities
  const generated = generateFormula(baseUnit, targetUnit);

  if (!generated) {
    return {
      path: pathName,
      baseUnit,
      targetUnit,
      status: 'unsupported',
      currentFormula,
      message: 'Not supported by js-quantities (keeping current)'
    };
  }

  // Extract factors
  const currentFactor = extractFactor(currentFormula);
  const suggestedFactor = generated.factor;

  if (currentFactor === null) {
    // Complex formula (offset conversion like temperature)
    return {
      path: pathName,
      baseUnit,
      targetUnit,
      status: 'custom',
      currentFormula,
      suggestedFormula: generated.formula,
      message: 'Complex formula (review manually)'
    };
  }

  // Compare factors
  const diff = Math.abs(suggestedFactor - currentFactor);
  const errorPercent = Math.abs(diff / suggestedFactor) * 100;

  if (errorPercent < 0.0001) {
    return {
      path: pathName,
      baseUnit,
      targetUnit,
      status: 'perfect',
      currentFormula,
      currentFactor,
      suggestedFactor,
      errorPercent,
      message: 'Perfect match'
    };
  } else if (errorPercent < 0.01) {
    return {
      path: pathName,
      baseUnit,
      targetUnit,
      status: 'close',
      currentFormula,
      suggestedFormula: generated.formula,
      currentFactor,
      suggestedFactor,
      errorPercent,
      message: 'Very close (could be more precise)'
    };
  } else {
    return {
      path: pathName,
      baseUnit,
      targetUnit,
      status: 'different',
      currentFormula,
      suggestedFormula: generated.formula,
      currentFactor,
      suggestedFactor,
      errorPercent,
      message: 'Significant difference!'
    };
  }
}

/**
 * Find missing conversions for a path
 */
function findMissingConversions(
  baseUnit: string,
  existingTargets: Set<string>
): Array<{targetUnit: string; formula: string; inverseFormula: string; symbol: string}> {
  const missing: Array<any> = [];
  const availableTargets = getAvailableTargetUnits(baseUnit);

  for (const target of availableTargets) {
    if (!existingTargets.has(target.unit) && !existingTargets.has(target.symbol)) {
      const generated = generateFormula(baseUnit, target.unit);
      if (generated) {
        missing.push({
          targetUnit: target.unit,
          formula: generated.formula,
          inverseFormula: generated.inverseFormula,
          symbol: generated.symbol
        });
      }
    }
  }

  return missing;
}

/**
 * Main validation process
 */
function validateAllUnits() {
  console.log(`${colors.cyan}${'═'.repeat(80)}${colors.reset}`);
  console.log(`${colors.cyan}   Validating and Enhancing Built-in Units${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(80)}${colors.reset}\n`);

  let totalConversions = 0;
  let totalPaths = 0;
  const missingConversions: Record<string, any[]> = {};

  // Process each path
  for (const [pathName, metadata] of Object.entries(builtInUnits)) {
    totalPaths++;
    const { baseUnit, category, conversions } = metadata;

    if (!conversions) continue;

    // Copy path to enhanced units
    enhancedUnits[pathName] = {
      baseUnit,
      category,
      conversions: {}
    };

    const existingTargets = new Set(Object.keys(conversions));

    // Validate existing conversions
    for (const [targetUnit, conversionDef] of Object.entries(conversions)) {
      totalConversions++;

      const result = validateConversion(
        pathName,
        baseUnit,
        targetUnit,
        conversionDef.formula,
        conversionDef.symbol
      );

      results.push(result);

      // Decide what to use in enhanced units
      if (result.status === 'custom' || result.status === 'unsupported') {
        // Keep original
        enhancedUnits[pathName].conversions[targetUnit] = {
          ...conversionDef,
          source: 'original'
        };
      } else if (result.status === 'perfect' || result.status === 'close') {
        // Use js-quantities for better precision
        const generated = generateFormula(baseUnit, targetUnit);
        if (generated) {
          enhancedUnits[pathName].conversions[targetUnit] = {
            formula: generated.formula,
            inverseFormula: generated.inverseFormula,
            symbol: generated.symbol,
            longName: conversionDef.longName,
            source: 'js-quantities'
          };
        } else {
          enhancedUnits[pathName].conversions[targetUnit] = {
            ...conversionDef,
            source: 'original'
          };
        }
      } else {
        // Different - use js-quantities but flag it
        const generated = generateFormula(baseUnit, targetUnit);
        if (generated) {
          enhancedUnits[pathName].conversions[targetUnit] = {
            formula: generated.formula,
            inverseFormula: generated.inverseFormula,
            symbol: generated.symbol,
            longName: conversionDef.longName,
            source: 'js-quantities'
          };
        } else {
          enhancedUnits[pathName].conversions[targetUnit] = {
            ...conversionDef,
            source: 'original'
          };
        }
      }
    }

    // Find missing conversions
    const missing = findMissingConversions(baseUnit, existingTargets);
    if (missing.length > 0) {
      missingConversions[pathName] = missing;

      // Add to enhanced units
      for (const conv of missing) {
        enhancedUnits[pathName].conversions[conv.targetUnit] = {
          formula: conv.formula,
          inverseFormula: conv.inverseFormula,
          symbol: conv.symbol,
          source: 'js-quantities'
        };
      }
    }
  }

  // Print results
  console.log(`${colors.blue}Processed: ${totalPaths} paths, ${totalConversions} conversions${colors.reset}\n`);

  // Group by status
  const perfect = results.filter(r => r.status === 'perfect');
  const close = results.filter(r => r.status === 'close');
  const different = results.filter(r => r.status === 'different');
  const custom = results.filter(r => r.status === 'custom');
  const unsupported = results.filter(r => r.status === 'unsupported');

  console.log(`${colors.green}✓ PERFECT: ${perfect.length}${colors.reset} - Formulas match js-quantities exactly`);
  console.log(`${colors.yellow}≈ CLOSE: ${close.length}${colors.reset} - Could be more precise`);
  console.log(`${colors.red}✗ DIFFERENT: ${different.length}${colors.reset} - Significant difference`);
  console.log(`${colors.cyan}○ CUSTOM: ${custom.length}${colors.reset} - Special formulas (keeping as-is)`);
  console.log(`${colors.dim}⚠ UNSUPPORTED: ${unsupported.length}${colors.reset} - Not in js-quantities\n`);

  // Show close matches
  if (close.length > 0) {
    console.log(`${colors.yellow}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.yellow}   CLOSE MATCHES (Could be more precise)${colors.reset}`);
    console.log(`${colors.yellow}${'═'.repeat(80)}${colors.reset}\n`);

    for (const result of close.slice(0, 10)) {
      console.log(`${colors.yellow}≈${colors.reset} ${result.path} → ${result.targetUnit}`);
      console.log(`  Current:   ${result.currentFormula}`);
      console.log(`  Suggested: ${result.suggestedFormula}`);
      console.log(`  Error: ${result.errorPercent?.toFixed(6)}%\n`);
    }

    if (close.length > 10) {
      console.log(`${colors.dim}  ... and ${close.length - 10} more${colors.reset}\n`);
    }
  }

  // Show different matches
  if (different.length > 0) {
    console.log(`${colors.red}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.red}   DIFFERENT FORMULAS (Significant difference!)${colors.reset}`);
    console.log(`${colors.red}${'═'.repeat(80)}${colors.reset}\n`);

    for (const result of different) {
      console.log(`${colors.red}✗${colors.reset} ${result.path} → ${result.targetUnit}`);
      console.log(`  Current:   ${result.currentFormula} (factor: ${result.currentFactor?.toFixed(10)})`);
      console.log(`  Suggested: ${result.suggestedFormula} (factor: ${result.suggestedFactor?.toFixed(10)})`);
      console.log(`  ${colors.red}Error: ${result.errorPercent?.toFixed(4)}%${colors.reset}\n`);
    }
  }

  // Show missing conversions
  const totalMissing = Object.values(missingConversions).reduce((sum, arr) => sum + arr.length, 0);
  if (totalMissing > 0) {
    console.log(`${colors.magenta}${'═'.repeat(80)}${colors.reset}`);
    console.log(`${colors.magenta}   MISSING CONVERSIONS (Available in js-quantities)${colors.reset}`);
    console.log(`${colors.magenta}${'═'.repeat(80)}${colors.reset}\n`);

    console.log(`Found ${totalMissing} missing conversions across ${Object.keys(missingConversions).length} paths\n`);

    const examples = Object.entries(missingConversions).slice(0, 5);
    for (const [pathName, missing] of examples) {
      const pathMeta = builtInUnits[pathName];
      console.log(`${colors.magenta}+${colors.reset} ${pathName} (${pathMeta.baseUnit})`);
      for (const conv of missing) {
        console.log(`    ${conv.targetUnit} (${conv.symbol})`);
      }
      console.log();
    }

    if (Object.keys(missingConversions).length > 5) {
      console.log(`${colors.dim}  ... and ${Object.keys(missingConversions).length - 5} more paths with missing conversions${colors.reset}\n`);
    }
  }

  console.log(`${colors.cyan}${'═'.repeat(80)}${colors.reset}\n`);
}

/**
 * Generate new builtInUnits.ts file
 */
function generateEnhancedUnitsFile() {
  console.log(`${colors.blue}Generating enhanced builtInUnits.ts...${colors.reset}\n`);

  let output = `import { UnitsMetadataStore } from './types'\n\n`;
  output += `/**\n`;
  output += ` * Built-in unit metadata for SignalK paths\n`;
  output += ` * \n`;
  output += ` * Enhanced with js-quantities for high-precision formulas\n`;
  output += ` * Generated: ${new Date().toISOString()}\n`;
  output += ` */\n`;
  output += `export const builtInUnits: UnitsMetadataStore = {\n`;

  const paths = Object.keys(enhancedUnits).sort();

  for (let i = 0; i < paths.length; i++) {
    const pathName = paths[i];
    const metadata = enhancedUnits[pathName];
    const { baseUnit, category, conversions } = metadata;

    // Add comment for path
    const pathComment = pathName.split('.').pop() || pathName;
    output += `  // ${pathComment}\n`;
    output += `  '${pathName}': {\n`;
    output += `    baseUnit: '${baseUnit}',\n`;
    output += `    category: '${category}',\n`;
    output += `    conversions: {\n`;

    const conversionKeys = Object.keys(conversions);
    for (let j = 0; j < conversionKeys.length; j++) {
      const targetUnit = conversionKeys[j];
      const conv = conversions[targetUnit];

      output += `      '${targetUnit}': {\n`;
      output += `        formula: '${conv.formula}',\n`;
      output += `        inverseFormula: '${conv.inverseFormula}',\n`;
      output += `        symbol: '${conv.symbol}'`;

      if (conv.longName) {
        output += `,\n        longName: '${conv.longName}'`;
      }

      output += `\n      }`;

      if (j < conversionKeys.length - 1) {
        output += ',';
      }
      output += '\n';
    }

    output += `    }\n`;
    output += `  }`;

    if (i < paths.length - 1) {
      output += ',';
    }
    output += '\n\n';
  }

  output += `}\n\n`;

  // Add categoryToBaseUnit mapping
  output += `/**\n`;
  output += ` * Category to base unit mapping\n`;
  output += ` */\n`;
  output += `export const categoryToBaseUnit: Record<string, string> = {\n`;

  const categories = Object.entries(categoryToBaseUnit).sort();
  for (let i = 0; i < categories.length; i++) {
    const [category, base] = categories[i];
    output += `  ${category}: '${base}'`;
    if (i < categories.length - 1) {
      output += ',';
    }
    output += '\n';
  }

  output += `}\n`;

  // Write to file (go up from dist/scripts/scripts to project root)
  const projectRoot = path.join(__dirname, '../../..');
  const outputPath = path.join(projectRoot, 'src/builtInUnits.enhanced.ts');
  fs.writeFileSync(outputPath, output, 'utf8');

  console.log(`${colors.green}✓ Enhanced file written to: src/builtInUnits.enhanced.ts${colors.reset}`);
  console.log(`${colors.dim}  Review the file, then rename to builtInUnits.ts to use it${colors.reset}\n`);
}

// Run validation
validateAllUnits();
generateEnhancedUnitsFile();

console.log(`${colors.cyan}${'═'.repeat(80)}${colors.reset}`);
console.log(`${colors.green}✓ Validation and Enhancement Complete${colors.reset}`);
console.log(`${colors.cyan}${'═'.repeat(80)}${colors.reset}\n`);

console.log(`Next steps:`);
console.log(`  1. Review src/builtInUnits.enhanced.ts`);
console.log(`  2. Compare with current builtInUnits.ts`);
console.log(`  3. Rename enhanced file to builtInUnits.ts when ready`);
console.log(`  4. Rebuild: npm run build\n`);
