import { ServerAPI } from '@signalk/server-api'
import { PathPatternRule, UnitMetadata, BaseUnitDefinition } from './types'

/**
 * PatternMatcher handles path pattern matching logic.
 * Responsibilities:
 * - Pattern matching logic (wildcards)
 * - Finding matching patterns
 * - Generating metadata from patterns
 */
export class PatternMatcher {
  constructor(private app: ServerAPI) {}

  /**
   * Check if a path matches a pattern (supports wildcards)
   */
  matchesPattern(path: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    // * matches any characters except dots
    // ** matches any characters including dots
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___DOUBLE_STAR___')
      .replace(/\*/g, '[^.]+')
      .replace(/___DOUBLE_STAR___/g, '.*')

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(path)
  }

  /**
   * Find the highest priority matching pattern for a path
   */
  findMatchingPattern(pathStr: string, pathPatterns: PathPatternRule[]): PathPatternRule | null {
    if (!pathPatterns || pathPatterns.length === 0) {
      return null
    }

    const sortedPatterns = [...pathPatterns].sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const pattern of sortedPatterns) {
      if (this.matchesPattern(pathStr, pattern.pattern)) {
        return pattern
      }
    }

    return null
  }

  /**
   * Generate metadata from a pattern rule using comprehensive defaults
   */
  generateMetadataFromPattern(
    pattern: PathPatternRule,
    unitDefinitions: Record<string, BaseUnitDefinition>,
    getConversionsForBaseUnit: (baseUnit: string) => UnitMetadata | null,
    getBaseUnitForCategory: (category: string) => string | null
  ): UnitMetadata | null {
    // Use pattern's baseUnit if provided, otherwise derive from category
    const baseUnit = pattern.baseUnit || getBaseUnitForCategory(pattern.category)
    this.app.debug(
      `generateMetadataFromPattern - pattern: ${pattern.pattern}, category: ${pattern.category}, baseUnit: ${baseUnit}`
    )

    if (!baseUnit) {
      this.app.debug(`No base unit found for category: ${pattern.category}`)
      return null
    }

    // Check unit definitions first
    if (unitDefinitions[baseUnit]) {
      this.app.debug(`Found in unitDefinitions: ${baseUnit}`)
      return {
        baseUnit: baseUnit,
        category: pattern.category,
        conversions: unitDefinitions[baseUnit].conversions
      }
    }

    // Try to find default conversions for this base unit
    const defaultsForBaseUnit = getConversionsForBaseUnit(baseUnit)

    if (!defaultsForBaseUnit) {
      this.app.debug(`No default conversions found for base unit: ${baseUnit}`)
      return null
    }

    this.app.debug(
      `Found conversions for ${baseUnit}: ${Object.keys(defaultsForBaseUnit.conversions).join(', ')}`
    )

    return {
      baseUnit: baseUnit,
      category: pattern.category,
      conversions: defaultsForBaseUnit.conversions
    }
  }
}
