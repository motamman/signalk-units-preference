import { ServerAPI } from '@signalk/server-api'
import * as fs from 'fs'
import * as path from 'path'
import {
  UnitsMetadataStore,
  UnitsPreferences,
  UnitMetadata,
  ConversionResponse,
  CategoryPreference,
  ConversionDefinition,
  PathPatternRule,
  ConvertValueResponse
} from './types'
import { defaultUnitsMetadata, categoryToBaseUnit } from './defaultUnits'
import { comprehensiveDefaultUnits } from './comprehensiveDefaults'
import { evaluateFormula, formatNumber } from './formulaEvaluator'

export class UnitsManager {
  private metadata: UnitsMetadataStore
  private preferences: UnitsPreferences
  private metadataPath: string
  private preferencesPath: string

  constructor(
    private app: ServerAPI,
    private dataDir: string
  ) {
    this.metadataPath = path.join(dataDir, 'units-metadata.json')
    this.preferencesPath = path.join(dataDir, 'units-preferences.json')
    // Merge both default sets, with comprehensive taking precedence
    this.metadata = { ...defaultUnitsMetadata, ...comprehensiveDefaultUnits }
    this.preferences = {
      categories: {},
      pathOverrides: {}
    }
  }

  /**
   * Initialize the manager by loading or creating data files
   */
  async initialize(): Promise<void> {
    await this.loadMetadata()
    await this.loadPreferences()
  }

  /**
   * Load metadata from file or create default
   */
  private async loadMetadata(): Promise<void> {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const data = fs.readFileSync(this.metadataPath, 'utf-8')
        const loaded = JSON.parse(data)
        this.metadata = { ...defaultUnitsMetadata, ...loaded }
        this.app.debug('Loaded units metadata from file')
      } else {
        await this.saveMetadata()
        this.app.debug('Created default units metadata file')
      }
    } catch (error) {
      this.app.error(`Failed to load metadata: ${error}`)
      throw error
    }
  }

  /**
   * Load preferences from file or create default
   */
  private async loadPreferences(): Promise<void> {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf-8')
        this.preferences = JSON.parse(data)
        this.app.debug('Loaded units preferences from file')
      } else {
        // Set some sensible defaults
        this.preferences = {
          categories: {
            speed: { targetUnit: 'knots', displayFormat: '0.0' },
            temperature: { targetUnit: 'celsius', displayFormat: '0' },
            pressure: { targetUnit: 'hPa', displayFormat: '0' },
            distance: { targetUnit: 'nm', displayFormat: '0.0' },
            depth: { targetUnit: 'm', displayFormat: '0.0' },
            angle: { targetUnit: 'deg', displayFormat: '0' },
            percentage: { targetUnit: 'percent', displayFormat: '0' }
          },
          pathOverrides: {},
          pathPatterns: [
            {
              pattern: '*.temperature',
              category: 'temperature',
              baseUnit: 'K',
              targetUnit: 'celsius',
              displayFormat: '0',
              priority: 100
            },
            {
              pattern: '*.pressure',
              category: 'pressure',
              baseUnit: 'Pa',
              targetUnit: 'hPa',
              displayFormat: '0',
              priority: 100
            },
            {
              pattern: '*.speed*',
              category: 'speed',
              baseUnit: 'm/s',
              targetUnit: 'knots',
              displayFormat: '0.0',
              priority: 90
            }
          ]
        }
        await this.savePreferences()
        this.app.debug('Created default units preferences file')
      }
    } catch (error) {
      this.app.error(`Failed to load preferences: ${error}`)
      throw error
    }
  }

  /**
   * Save metadata to file
   */
  async saveMetadata(): Promise<void> {
    try {
      fs.writeFileSync(
        this.metadataPath,
        JSON.stringify(this.metadata, null, 2),
        'utf-8'
      )
      this.app.debug('Saved units metadata')
    } catch (error) {
      this.app.error(`Failed to save metadata: ${error}`)
      throw error
    }
  }

  /**
   * Save preferences to file
   */
  async savePreferences(): Promise<void> {
    try {
      fs.writeFileSync(
        this.preferencesPath,
        JSON.stringify(this.preferences, null, 2),
        'utf-8'
      )
      this.app.debug('Saved units preferences')
    } catch (error) {
      this.app.error(`Failed to save preferences: ${error}`)
      throw error
    }
  }

  /**
   * Get conversion information for a path
   */
  getConversion(pathStr: string): ConversionResponse | null {
    this.app.debug(`getConversion called for: ${pathStr}`)

    // Check if we have metadata for this path
    let metadata = this.metadata[pathStr]
    this.app.debug(`Metadata found: ${metadata ? 'yes' : 'no'}`)

    if (!metadata) {
      // Try to match against path patterns first
      const matchingPattern = this.findMatchingPattern(pathStr)
      if (matchingPattern) {
        this.app.debug(`Found matching pattern for ${pathStr}: ${matchingPattern.pattern}`)
        const generated = this.generateMetadataFromPattern(matchingPattern)
        if (generated) {
          metadata = generated
        } else {
          this.app.debug(`Could not generate metadata from pattern for: ${pathStr}`)
        }
      }

      // If still no metadata, try to infer from SignalK metadata
      if (!metadata) {
        const skMetadata = this.app.getMetadata(pathStr)
        if (skMetadata?.units) {
          const inferred = this.inferMetadataFromSignalK(pathStr, skMetadata.units)
          if (!inferred) {
            this.app.debug(`Could not infer metadata for path: ${pathStr}`)
            return null
          }
          metadata = inferred
        } else {
          this.app.debug(`No metadata found for path: ${pathStr}`)
          return null
        }
      }
    }

    // Get preference (path-specific or category-level)
    const preference = this.getPreferenceForPath(pathStr, metadata.category)
    this.app.debug(`Preference found: ${preference ? JSON.stringify(preference) : 'no'}`)

    if (!preference) {
      this.app.debug(`No preference found for path: ${pathStr}`)
      return null
    }

    // Get conversion definition
    const conversion = metadata.conversions[preference.targetUnit]

    if (!conversion) {
      this.app.debug(
        `No conversion found for ${preference.targetUnit} in path: ${pathStr}`
      )
      return null
    }

    this.app.debug(`Conversion object: ${JSON.stringify(conversion)}`)

    if (!conversion.formula) {
      this.app.error(`Conversion for ${preference.targetUnit} has no formula`)
      return null
    }

    return {
      path: pathStr,
      baseUnit: metadata.baseUnit,
      targetUnit: preference.targetUnit,
      formula: conversion.formula,
      inverseFormula: conversion.inverseFormula,
      displayFormat: preference.displayFormat,
      symbol: conversion.symbol,
      category: metadata.category
    }
  }

  /**
   * Convert a value using the conversion formula
   */
  convertValue(pathStr: string, value: number): ConvertValueResponse | null {
    const conversionInfo = this.getConversion(pathStr)

    if (!conversionInfo) {
      return null
    }

    try {
      const convertedValue = evaluateFormula(conversionInfo.formula, value)
      const formatted = formatNumber(convertedValue, conversionInfo.displayFormat)

      return {
        originalValue: value,
        convertedValue,
        symbol: conversionInfo.symbol,
        formatted: `${formatted} ${conversionInfo.symbol}`,
        displayFormat: conversionInfo.displayFormat
      }
    } catch (error) {
      this.app.error(`Error converting value: ${error}`)
      return null
    }
  }

  /**
   * Check if a path matches a pattern (supports wildcards)
   */
  private matchesPattern(path: string, pattern: string): boolean {
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
  private findMatchingPattern(pathStr: string): PathPatternRule | null {
    if (!this.preferences.pathPatterns || this.preferences.pathPatterns.length === 0) {
      return null
    }

    const sortedPatterns = [...this.preferences.pathPatterns].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    )

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
  private generateMetadataFromPattern(pattern: PathPatternRule): UnitMetadata | null {
    // Try to find default conversions for this base unit
    const defaultsForBaseUnit = Object.values(comprehensiveDefaultUnits).find(
      (meta) => meta.baseUnit === pattern.baseUnit
    )

    if (!defaultsForBaseUnit) {
      this.app.debug(`No default conversions found for base unit: ${pattern.baseUnit}`)
      return null
    }

    return {
      baseUnit: pattern.baseUnit,
      category: pattern.category,
      conversions: defaultsForBaseUnit.conversions
    }
  }

  /**
   * Get preference for a path (check overrides first, then patterns, then category)
   */
  private getPreferenceForPath(
    pathStr: string,
    category: string
  ): CategoryPreference | null {
    this.app.debug(`getPreferenceForPath: path=${pathStr}, category=${category}`)
    this.app.debug(`Available overrides: ${Object.keys(this.preferences.pathOverrides).join(', ')}`)

    // 1. Check path-specific override first (highest priority)
    if (this.preferences.pathOverrides[pathStr]) {
      this.app.debug(`Found path override for ${pathStr}`)
      return this.preferences.pathOverrides[pathStr]
    }

    // 2. Check path patterns (sorted by priority)
    if (this.preferences.pathPatterns && this.preferences.pathPatterns.length > 0) {
      const sortedPatterns = [...this.preferences.pathPatterns].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0)
      )

      for (const patternRule of sortedPatterns) {
        if (this.matchesPattern(pathStr, patternRule.pattern)) {
          return {
            targetUnit: patternRule.targetUnit,
            displayFormat: patternRule.displayFormat
          }
        }
      }
    }

    // 3. Fall back to category preference
    if (this.preferences.categories[category]) {
      return this.preferences.categories[category]
    }

    return null
  }

  /**
   * Infer metadata from SignalK metadata
   */
  private inferMetadataFromSignalK(
    _pathStr: string,
    units: string
  ): UnitMetadata | null {
    // Try to find a matching base unit and category
    const category = Object.entries(categoryToBaseUnit).find(
      ([_, baseUnit]) => baseUnit === units
    )?.[0]

    if (!category) {
      // Unknown unit, create custom metadata
      return {
        baseUnit: units,
        category: 'custom',
        conversions: {}
      }
    }

    // Find a similar path in default metadata with same category
    const similarPath = Object.entries(defaultUnitsMetadata).find(
      ([_, meta]) => meta.category === category && meta.baseUnit === units
    )

    if (similarPath) {
      return similarPath[1]
    }

    return null
  }

  /**
   * Get all metadata
   */
  getMetadata(): UnitsMetadataStore {
    return this.metadata
  }

  /**
   * Get all preferences
   */
  getPreferences(): UnitsPreferences {
    return this.preferences
  }

  /**
   * Update metadata for a path
   */
  async updateMetadata(pathStr: string, metadata: UnitMetadata): Promise<void> {
    this.metadata[pathStr] = metadata
    await this.saveMetadata()
  }

  /**
   * Update category preference
   */
  async updateCategoryPreference(
    category: string,
    preference: CategoryPreference
  ): Promise<void> {
    this.preferences.categories[category] = preference
    await this.savePreferences()
  }

  /**
   * Update path override
   */
  async updatePathOverride(
    pathStr: string,
    preference: CategoryPreference
  ): Promise<void> {
    this.preferences.pathOverrides[pathStr] = {
      path: pathStr,
      ...preference
    }
    await this.savePreferences()
  }

  /**
   * Delete path override
   */
  async deletePathOverride(pathStr: string): Promise<void> {
    delete this.preferences.pathOverrides[pathStr]
    await this.savePreferences()
  }

  /**
   * Add path pattern rule
   */
  async addPathPattern(pattern: PathPatternRule): Promise<void> {
    if (!this.preferences.pathPatterns) {
      this.preferences.pathPatterns = []
    }
    this.preferences.pathPatterns.push(pattern)
    await this.savePreferences()
  }

  /**
   * Update path pattern rule
   */
  async updatePathPattern(index: number, pattern: PathPatternRule): Promise<void> {
    if (!this.preferences.pathPatterns || index >= this.preferences.pathPatterns.length) {
      throw new Error(`Pattern at index ${index} not found`)
    }
    this.preferences.pathPatterns[index] = pattern
    await this.savePreferences()
  }

  /**
   * Delete path pattern rule
   */
  async deletePathPattern(index: number): Promise<void> {
    if (!this.preferences.pathPatterns || index >= this.preferences.pathPatterns.length) {
      throw new Error(`Pattern at index ${index} not found`)
    }
    this.preferences.pathPatterns.splice(index, 1)
    await this.savePreferences()
  }

  /**
   * Add custom conversion to existing metadata
   */
  async addConversion(
    pathStr: string,
    unitName: string,
    conversion: ConversionDefinition
  ): Promise<void> {
    if (!this.metadata[pathStr]) {
      throw new Error(`No metadata found for path: ${pathStr}`)
    }

    this.metadata[pathStr].conversions[unitName] = conversion
    await this.saveMetadata()
  }
}
