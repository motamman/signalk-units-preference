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
  private unitDefinitions: Record<string, UnitMetadata>
  private signalKMetadata: Record<string, string> // path -> units
  private preferencesPath: string
  private definitionsPath: string

  constructor(
    private app: ServerAPI,
    private dataDir: string
  ) {
    this.preferencesPath = path.join(dataDir, 'units-preferences.json')
    this.definitionsPath = path.join(dataDir, 'units-definitions.json')
    // Use only built-in default metadata (no custom file loading)
    this.metadata = { ...defaultUnitsMetadata, ...comprehensiveDefaultUnits }
    this.preferences = {
      categories: {},
      pathOverrides: {}
    }
    this.unitDefinitions = {}
    this.signalKMetadata = {}
  }

  /**
   * Initialize the manager by loading or creating data files
   */
  async initialize(): Promise<void> {
    await this.loadPreferences()
    await this.loadUnitDefinitions()
  }

  /**
   * Set SignalK metadata from frontend
   */
  setSignalKMetadata(metadata: Record<string, string>): void {
    this.signalKMetadata = metadata
    this.app.debug(`Received SignalK metadata for ${Object.keys(metadata).length} paths`)
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
              targetUnit: 'celsius',
              displayFormat: '0',
              priority: 100
            },
            {
              pattern: '*.pressure',
              category: 'pressure',
              targetUnit: 'hPa',
              displayFormat: '0',
              priority: 100
            },
            {
              pattern: '*.speed*',
              category: 'speed',
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
   * Load unit definitions from file
   */
  private async loadUnitDefinitions(): Promise<void> {
    try {
      if (fs.existsSync(this.definitionsPath)) {
        const data = fs.readFileSync(this.definitionsPath, 'utf-8')
        this.unitDefinitions = JSON.parse(data)
        this.app.debug('Loaded unit definitions from file')
      } else {
        this.unitDefinitions = {}
        await this.saveUnitDefinitions()
        this.app.debug('Created default unit definitions file')
      }
    } catch (error) {
      this.app.error(`Failed to load unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Save unit definitions to file
   */
  async saveUnitDefinitions(): Promise<void> {
    try {
      fs.writeFileSync(
        this.definitionsPath,
        JSON.stringify(this.unitDefinitions, null, 2),
        'utf-8'
      )
      this.app.debug('Saved unit definitions')
    } catch (error) {
      this.app.error(`Failed to save unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Get all unit definitions (built-in + custom)
   */
  getUnitDefinitions(): Record<string, UnitMetadata> {
    // Extract base unit definitions from comprehensive defaults
    const baseUnitDefs: Record<string, UnitMetadata> = {}

    for (const [_path, meta] of Object.entries(comprehensiveDefaultUnits)) {
      if (meta.baseUnit && !baseUnitDefs[meta.baseUnit]) {
        baseUnitDefs[meta.baseUnit] = {
          baseUnit: meta.baseUnit,
          category: meta.category || meta.baseUnit,
          conversions: meta.conversions || {}
        }
      } else if (meta.baseUnit && meta.conversions) {
        // Merge conversions if we've seen this base unit before
        baseUnitDefs[meta.baseUnit].conversions = {
          ...baseUnitDefs[meta.baseUnit].conversions,
          ...meta.conversions
        }
      }
    }

    // Merge built-in units with custom units (custom units override built-in)
    return { ...baseUnitDefs, ...this.unitDefinitions }
  }

  /**
   * Add or update a unit definition
   */
  async addUnitDefinition(baseUnit: string, definition: UnitMetadata): Promise<void> {
    this.unitDefinitions[baseUnit] = definition
    await this.saveUnitDefinitions()
  }

  /**
   * Delete a unit definition
   */
  async deleteUnitDefinition(baseUnit: string): Promise<void> {
    delete this.unitDefinitions[baseUnit]
    await this.saveUnitDefinitions()
  }

  /**
   * Add a conversion to a unit definition
   */
  async addConversionToUnit(
    baseUnit: string,
    targetUnit: string,
    conversion: ConversionDefinition
  ): Promise<void> {
    if (!this.unitDefinitions[baseUnit]) {
      throw new Error(`Base unit ${baseUnit} not found`)
    }
    this.unitDefinitions[baseUnit].conversions[targetUnit] = conversion
    await this.saveUnitDefinitions()
  }

  /**
   * Delete a conversion from a unit definition
   */
  async deleteConversionFromUnit(baseUnit: string, targetUnit: string): Promise<void> {
    if (this.unitDefinitions[baseUnit]?.conversions[targetUnit]) {
      delete this.unitDefinitions[baseUnit].conversions[targetUnit]
      await this.saveUnitDefinitions()
    }
  }

  /**
   * Get conversion information for a path
   */
  getConversion(pathStr: string): ConversionResponse {
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
        this.app.debug(`SignalK metadata for ${pathStr}: ${JSON.stringify(skMetadata)}`)
        if (skMetadata?.units) {
          this.app.debug(`Found units in SignalK metadata: ${skMetadata.units}`)
          const inferred = this.inferMetadataFromSignalK(pathStr, skMetadata.units)
          if (!inferred) {
            this.app.debug(`Could not infer metadata for path: ${pathStr}`)
            // Return pass-through conversion with SignalK unit
            return this.getPassThroughConversion(pathStr, skMetadata.units)
          }
          metadata = inferred
          this.app.debug(`Inferred metadata: ${JSON.stringify(metadata)}`)
        } else {
          this.app.debug(`No SignalK metadata units found for path: ${pathStr}`)
          // Return pass-through conversion
          return this.getPassThroughConversion(pathStr)
        }
      }
    }

    // Get preference (path-specific or category-level)
    const preference = this.getPreferenceForPath(pathStr, metadata.category)
    this.app.debug(`Preference found: ${preference ? JSON.stringify(preference) : 'no'}`)

    if (!preference) {
      this.app.debug(`No preference found for path: ${pathStr}`)
      // Return pass-through conversion using metadata's baseUnit
      return this.getPassThroughConversion(pathStr, metadata.baseUnit || undefined)
    }

    // Get conversion definition
    const conversion = metadata.conversions[preference.targetUnit]

    if (!conversion) {
      this.app.debug(
        `No conversion found for ${preference.targetUnit} in path: ${pathStr}`
      )
      // Return pass-through conversion using metadata's baseUnit
      return this.getPassThroughConversion(pathStr, metadata.baseUnit || undefined)
    }

    this.app.debug(`Conversion object: ${JSON.stringify(conversion)}`)

    if (!conversion.formula) {
      this.app.error(`Conversion for ${preference.targetUnit} has no formula`)
      return this.getPassThroughConversion(pathStr, metadata.baseUnit || undefined)
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
   * Get a pass-through conversion (no conversion applied)
   * If path has SignalK metadata with units, use that as baseUnit/targetUnit
   */
  private getPassThroughConversion(pathStr: string, signalKUnit?: string): ConversionResponse {
    // Check SignalK metadata if not provided
    let unit = signalKUnit
    if (!unit) {
      // First check the metadata from frontend
      unit = this.signalKMetadata[pathStr]
      if (!unit) {
        // Fallback to app.getMetadata
        const skMetadata = this.app.getMetadata(pathStr)
        if (skMetadata?.units) {
          unit = skMetadata.units
        }
      }
    }

    return {
      path: pathStr,
      baseUnit: unit || 'none',
      targetUnit: unit || 'none',
      formula: 'value',
      inverseFormula: 'value',
      displayFormat: '0.0',
      symbol: '',
      category: 'none'
    }
  }

  /**
   * Convert a value using the conversion formula
   */
  convertValue(pathStr: string, value: number): ConvertValueResponse {
    const conversionInfo = this.getConversion(pathStr)

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
      // Return pass-through on error
      return {
        originalValue: value,
        convertedValue: value,
        symbol: '',
        formatted: `${value}`,
        displayFormat: '0.0'
      }
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
    // Use pattern's baseUnit if provided, otherwise derive from category
    const baseUnit = pattern.baseUnit || this.getBaseUnitForCategory(pattern.category)

    if (!baseUnit) {
      this.app.debug(`No base unit found for category: ${pattern.category}`)
      return null
    }

    // Check unit definitions first
    if (this.unitDefinitions[baseUnit]) {
      return {
        baseUnit: baseUnit,
        category: pattern.category,
        conversions: this.unitDefinitions[baseUnit].conversions
      }
    }

    // Try to find default conversions for this base unit
    const defaultsForBaseUnit = Object.values(comprehensiveDefaultUnits).find(
      (meta) => meta.baseUnit === baseUnit
    )

    if (!defaultsForBaseUnit) {
      this.app.debug(`No default conversions found for base unit: ${baseUnit}`)
      return null
    }

    return {
      baseUnit: baseUnit,
      category: pattern.category,
      conversions: defaultsForBaseUnit.conversions
    }
  }

  /**
   * Get base unit for a category from preferences or schema
   */
  private getBaseUnitForCategory(category: string): string | null {
    // Check if category preference has a custom baseUnit
    const categoryPref = this.preferences.categories?.[category]
    if (categoryPref?.baseUnit) {
      return categoryPref.baseUnit
    }

    // Look up in comprehensive defaults
    const defaultMeta = Object.values(comprehensiveDefaultUnits).find(
      (meta) => meta.category === category
    )

    return defaultMeta?.baseUnit || null
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
          // Get category defaults
          const categoryDefault = this.preferences.categories[category]

          return {
            targetUnit: patternRule.targetUnit || categoryDefault?.targetUnit || '',
            displayFormat: patternRule.displayFormat || categoryDefault?.displayFormat || '0.0'
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

    // Try comprehensive defaults
    const comprehensivePath = Object.entries(comprehensiveDefaultUnits).find(
      ([_, meta]) => meta.category === category && meta.baseUnit === units
    )

    if (comprehensivePath) {
      return comprehensivePath[1]
    }

    // Return basic metadata with baseUnit and category, no conversions
    return {
      baseUnit: units,
      category: category,
      conversions: {}
    }
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
   * Delete category preference
   */
  async deleteCategoryPreference(category: string): Promise<void> {
    if (this.preferences.categories[category]) {
      delete this.preferences.categories[category]
      await this.savePreferences()
    }
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
   * Get unit schema (base units, categories, target units mapping)
   */
  getUnitSchema(): {
    baseUnits: Array<{ value: string; label: string }>
    categories: string[]
    targetUnitsByBase: Record<string, string[]>
    categoryToBaseUnit: Record<string, string>
  } {
    // Extract unique base units from comprehensive defaults
    const baseUnitsSet = new Set<string>()
    const categoriesSet = new Set<string>()
    const targetUnitsByBase: Record<string, Set<string>> = {}

    // Start with the static category-to-baseUnit mapping from defaultUnits
    // This ensures standard SignalK categories use the correct base units
    const categoryToBaseUnitMap: Record<string, string> = { ...categoryToBaseUnit }

    // Scan custom categories from preferences
    for (const [category, pref] of Object.entries(this.preferences.categories || {})) {
      if (pref.baseUnit) {
        // This is a custom category
        categoriesSet.add(category)
        baseUnitsSet.add(pref.baseUnit)
        categoryToBaseUnitMap[category] = pref.baseUnit

        // Add the target unit to the targetUnitsByBase mapping
        if (!targetUnitsByBase[pref.baseUnit]) {
          targetUnitsByBase[pref.baseUnit] = new Set()
        }
        targetUnitsByBase[pref.baseUnit].add(pref.targetUnit)
      }
    }

    // Scan custom unit definitions
    for (const [baseUnit, def] of Object.entries(this.unitDefinitions)) {
      baseUnitsSet.add(baseUnit)

      if (def.conversions) {
        if (!targetUnitsByBase[baseUnit]) {
          targetUnitsByBase[baseUnit] = new Set()
        }
        for (const targetUnit of Object.keys(def.conversions)) {
          targetUnitsByBase[baseUnit].add(targetUnit)
        }
      }
    }

    // Scan all metadata (including comprehensive defaults)
    const allMetadata = { ...comprehensiveDefaultUnits, ...this.metadata }

    for (const [_path, meta] of Object.entries(allMetadata)) {
      if (!meta.baseUnit) continue

      baseUnitsSet.add(meta.baseUnit)

      if (meta.category) {
        categoriesSet.add(meta.category)
        // For custom categories not in the static mapping, add them
        if (!categoryToBaseUnitMap[meta.category]) {
          categoryToBaseUnitMap[meta.category] = meta.baseUnit
        }
      }

      if (meta.conversions) {
        if (!targetUnitsByBase[meta.baseUnit]) {
          targetUnitsByBase[meta.baseUnit] = new Set()
        }
        for (const targetUnit of Object.keys(meta.conversions)) {
          targetUnitsByBase[meta.baseUnit].add(targetUnit)
        }
      }
    }

    // Convert sets to arrays and create labeled base units
    const baseUnitsArray = Array.from(baseUnitsSet).sort()
    const baseUnits = baseUnitsArray.map(unit => ({
      value: unit,
      label: this.getBaseUnitLabel(unit)
    }))

    const targetUnitsMap: Record<string, string[]> = {}
    for (const [baseUnit, units] of Object.entries(targetUnitsByBase)) {
      targetUnitsMap[baseUnit] = Array.from(units).sort()
    }

    return {
      baseUnits,
      categories: Array.from(categoriesSet).sort(),
      targetUnitsByBase: targetUnitsMap,
      categoryToBaseUnit: categoryToBaseUnitMap
    }
  }

  /**
   * Get a human-readable label for a base unit
   */
  private getBaseUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      'm/s': 'm/s (speed)',
      'K': 'K (temperature)',
      'Pa': 'Pa (pressure)',
      'm': 'm (distance/depth)',
      'rad': 'rad (angle)',
      'm3': 'm³ (volume)',
      'V': 'V (voltage)',
      'A': 'A (current)',
      'W': 'W (power)',
      'Hz': 'Hz (frequency)',
      'ratio': 'ratio (percentage)',
      's': 's (time)',
      'C': 'C (charge)',
      'deg': 'deg (latitude/longitude)',
      'm3/s': 'm³/s (volume rate)'
    }
    return labels[unit] || unit
  }
}
