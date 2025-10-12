import { ServerAPI } from '@signalk/server-api'
import * as fs from 'fs'
import * as path from 'path'
import {
  UnitsMetadataStore,
  UnitsPreferences,
  UnitMetadata,
  BaseUnitDefinition,
  ConversionResponse,
  CategoryPreference,
  ConversionDefinition,
  PathPatternRule,
  ConvertValueResponse,
  SignalKPathMetadata
} from './types'
import { categoryToBaseUnit, builtInUnits } from './builtInUnits'
import { MetadataManager } from './MetadataManager'
import { ConversionEngine } from './ConversionEngine'
import { PreferencesStore } from './PreferencesStore'
import { PatternMatcher } from './PatternMatcher'

/**
 * UnitsManager orchestrates all unit conversion subsystems.
 * It delegates responsibilities to specialized classes:
 * - MetadataManager: path metadata and SignalK integration
 * - ConversionEngine: core conversion logic
 * - PreferencesStore: persistence and CRUD operations
 * - PatternMatcher: path pattern matching logic
 */
export class UnitsManager {
  private metadataManager!: MetadataManager
  private conversionEngine: ConversionEngine
  private preferencesStore: PreferencesStore
  private patternMatcher: PatternMatcher

  private standardUnitsData: Record<string, any> = {}
  private categoriesData: any = {}
  private dateFormatsData: any = {}
  private definitionsDir: string

  // Simple time-based cache for getUnitSchema
  private cachedSchema: ReturnType<UnitsManager['buildUnitSchema']> | null = null
  private schemaCacheTimestamp: number = 0
  private readonly SCHEMA_CACHE_TTL_MS = 15000 // 15 seconds

  constructor(
    private app: ServerAPI,
    private dataDir: string
  ) {
    this.definitionsDir = path.join(__dirname, '..', 'presets', 'definitions')

    // Initialize subsystems
    this.preferencesStore = new PreferencesStore(app, dataDir)
    this.conversionEngine = new ConversionEngine(app) // Will be updated with dateFormatsData after loading
    this.patternMatcher = new PatternMatcher(app)
    // MetadataManager needs standardUnitsData, so we'll initialize it after loading definition files
  }

  /**
   * Load JSON definition files with fallback to TypeScript
   */
  private loadDefinitionFiles(): void {
    try {
      // Load standard-units-definitions.json
      const standardUnitsPath = path.join(this.definitionsDir, 'standard-units-definitions.json')
      if (fs.existsSync(standardUnitsPath)) {
        const data = fs.readFileSync(standardUnitsPath, 'utf-8')
        this.standardUnitsData = JSON.parse(data)
        this.app.debug('Loaded standard-units-definitions.json')
      } else {
        this.app.debug('standard-units-definitions.json not found, using TypeScript defaults')
      }
    } catch (error) {
      this.app.error(`Error loading standard-units-definitions.json: ${error}`)
      this.app.debug('Using TypeScript fallback for standard units')
    }

    try {
      // Load categories.json
      const categoriesPath = path.join(this.definitionsDir, 'categories.json')
      if (fs.existsSync(categoriesPath)) {
        const data = fs.readFileSync(categoriesPath, 'utf-8')
        this.categoriesData = JSON.parse(data)
        this.app.debug('Loaded categories.json')
      } else {
        this.app.debug('categories.json not found, using TypeScript defaults')
      }
    } catch (error) {
      this.app.error(`Error loading categories.json: ${error}`)
      this.app.debug('Using TypeScript fallback for categories')
    }

    try {
      // Load date-formats.json
      const dateFormatsPath = path.join(this.definitionsDir, 'date-formats.json')
      if (fs.existsSync(dateFormatsPath)) {
        const data = fs.readFileSync(dateFormatsPath, 'utf-8')
        this.dateFormatsData = JSON.parse(data)
        this.app.debug('Loaded date-formats.json')
      } else {
        this.app.debug('date-formats.json not found, using TypeScript defaults')
      }
    } catch (error) {
      this.app.error(`Error loading date-formats.json: ${error}`)
      this.app.debug('Using TypeScript fallback for date formats')
    }
  }

  /**
   * Migrate old file names to new naming convention
   */
  private migrateFileNames(): void {
    // Migrate conversions.json to standard-units-definitions.json
    const oldStandardPath = path.join(this.definitionsDir, 'conversions.json')
    const newStandardPath = path.join(this.definitionsDir, 'standard-units-definitions.json')
    if (fs.existsSync(oldStandardPath) && !fs.existsSync(newStandardPath)) {
      try {
        fs.renameSync(oldStandardPath, newStandardPath)
        this.app.debug('Migrated conversions.json to standard-units-definitions.json')
      } catch (error) {
        this.app.error(`Failed to migrate conversions.json: ${error}`)
      }
    }
  }

  /**
   * Validate that JSON and TypeScript definitions are consistent
   */
  private validateDefinitions(): void {
    // Validate category-to-baseUnit mapping consistency
    if (this.categoriesData?.categoryToBaseUnit) {
      const jsonMapping = this.categoriesData.categoryToBaseUnit
      const tsMapping = categoryToBaseUnit

      for (const [category, jsonBaseUnit] of Object.entries(jsonMapping)) {
        const tsBaseUnit = tsMapping[category]
        if (tsBaseUnit && tsBaseUnit !== jsonBaseUnit) {
          this.app.error(
            `VALIDATION ERROR: Category "${category}" has inconsistent base units: ` +
              `JSON=${jsonBaseUnit}, TypeScript=${tsBaseUnit}. Using JSON value.`
          )
        }
      }

      // Check for categories in TypeScript but not in JSON
      for (const [category, tsBaseUnit] of Object.entries(tsMapping)) {
        if (!jsonMapping[category]) {
          this.app.debug(
            `Category "${category}" exists in TypeScript (${tsBaseUnit}) but not in categories.json`
          )
        }
      }
    }

    // Validate date format patterns if loaded
    if (this.dateFormatsData?.formats && Object.keys(this.dateFormatsData.formats).length > 0) {
      this.app.debug(
        `Validated ${Object.keys(this.dateFormatsData.formats).length} date format patterns from JSON`
      )
    }
  }

  /**
   * Initialize the manager by loading or creating data files
   */
  async initialize(): Promise<void> {
    this.migrateFileNames()
    this.loadDefinitionFiles()

    // Validate JSON and TypeScript consistency
    this.validateDefinitions()

    // Now initialize MetadataManager with loaded data
    this.metadataManager = new MetadataManager(
      this.app,
      this.standardUnitsData,
      this.categoriesData
    )

    // Update ConversionEngine with loaded date formats data
    this.conversionEngine.setDateFormatsData(this.dateFormatsData)

    await this.preferencesStore.initialize(this.getCategoryToBaseUnitMap(), this.definitionsDir)
  }

  /**
   * Set up callback for preference changes (used by delta stream handler for cache invalidation)
   * This is exposed on UnitsManager to support the DeltaStreamHandler's cache clearing mechanism.
   */
  setPreferencesChangeCallback(callback: () => void): void {
    this.preferencesStore.setOnPreferencesChanged(callback)
  }

  /**
   * Get category to base unit mapping (JSON or TypeScript fallback)
   */
  private getCategoryToBaseUnitMap(): Record<string, string> {
    if (this.categoriesData?.categoryToBaseUnit) {
      return this.categoriesData.categoryToBaseUnit
    }
    return categoryToBaseUnit
  }

  /**
   * Get core categories list (JSON or TypeScript fallback)
   */
  private getCoreCategories(): string[] {
    if (this.categoriesData?.coreCategories) {
      return this.categoriesData.coreCategories
    }
    return Object.keys(categoryToBaseUnit)
  }

  /**
   * Get all categories that map to a given base unit
   */
  getCategoriesForBaseUnit(baseUnit: string): string[] {
    const categoryMap = { ...this.getCategoryToBaseUnitMap() }
    const preferences = this.preferencesStore.getPreferences()

    // Add custom categories that have a baseUnit defined
    for (const [category, pref] of Object.entries(preferences.categories || {})) {
      if (pref.baseUnit) {
        categoryMap[category] = pref.baseUnit
      }
    }

    return Object.entries(categoryMap)
      .filter(([, unit]) => unit === baseUnit)
      .map(([category]) => category)
  }

  /**
   * Set SignalK metadata from frontend
   */
  setSignalKMetadata(metadata: Record<string, SignalKPathMetadata>): void {
    this.metadataManager.setSignalKMetadata(metadata)
  }

  /**
   * Get base unit for a category from preferences or schema
   */
  private getBaseUnitForCategory(category: string): string | null {
    const preferences = this.preferencesStore.getPreferences()

    // Check if category preference has a custom baseUnit
    const categoryPref = preferences.categories?.[category]
    if (categoryPref?.baseUnit) {
      return categoryPref.baseUnit
    }

    // Look up in category mapping
    const baseUnit = this.getCategoryToBaseUnitMap()[category]
    return baseUnit || null
  }

  /**
   * Get preference for a path (check overrides first, then patterns, then category)
   */
  private getPreferenceForPath(pathStr: string, category: string): CategoryPreference | null {
    const preferences = this.preferencesStore.getPreferences()
    this.app.debug(`getPreferenceForPath: path=${pathStr}, category=${category}`)
    this.app.debug(`Available overrides: ${Object.keys(preferences.pathOverrides).join(', ')}`)

    // 1. Check path-specific override first (highest priority)
    if (preferences.pathOverrides[pathStr]) {
      this.app.debug(`Found path override for ${pathStr}`)
      return preferences.pathOverrides[pathStr]
    }

    // 2. Check path patterns (sorted by priority)
    if (preferences.pathPatterns && preferences.pathPatterns.length > 0) {
      const sortedPatterns = [...preferences.pathPatterns].sort(
        (a, b) => (b.priority || 0) - (a.priority || 0)
      )

      for (const patternRule of sortedPatterns) {
        if (this.patternMatcher.matchesPattern(pathStr, patternRule.pattern)) {
          // Get category defaults
          const categoryDefault = preferences.categories[category]

          return {
            targetUnit: patternRule.targetUnit || categoryDefault?.targetUnit || '',
            displayFormat: patternRule.displayFormat || categoryDefault?.displayFormat || '0.0'
          }
        }
      }
    }

    // 3. Fall back to category preference
    if (preferences.categories[category]) {
      return preferences.categories[category]
    }

    return null
  }

  /**
   * Resolve the selected conversion for a path based on current preferences.
   */
  private resolveSelectedConversion(
    pathStr: string,
    metadata: UnitMetadata
  ): {
    preference: CategoryPreference | null
    targetUnit: string | null
    conversion: ConversionDefinition | null
  } {
    const preference = this.getPreferenceForPath(pathStr, metadata.category)

    if (!preference) {
      return { preference: null, targetUnit: null, conversion: null }
    }

    const targetUnit = preference.targetUnit?.trim() ? preference.targetUnit.trim() : null

    if (!targetUnit) {
      return { preference, targetUnit: null, conversion: null }
    }

    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    // Try to find conversion by key or longName
    let conversionMatch = metadata.conversions
      ? this.conversionEngine.findConversionByKeyOrLongName(metadata.conversions, targetUnit)
      : null

    const baseUnit = metadata.baseUnit || preference.baseUnit

    if (!conversionMatch && baseUnit) {
      const unitDef = unitDefinitions[baseUnit]
      if (unitDef?.conversions) {
        conversionMatch = this.conversionEngine.findConversionByKeyOrLongName(
          unitDef.conversions,
          targetUnit
        )
      }
    }

    if (!conversionMatch && baseUnit) {
      const fallback = this.metadataManager.getConversionsForBaseUnit(
        baseUnit,
        this.dateFormatsData
      )
      if (fallback?.conversions) {
        conversionMatch = this.conversionEngine.findConversionByKeyOrLongName(
          fallback.conversions,
          targetUnit
        )
      }
    }

    return {
      preference,
      targetUnit: conversionMatch?.key || targetUnit,
      conversion: conversionMatch?.conversion || null
    }
  }

  /**
   * Get conversion information for a path
   */
  getConversion(pathStr: string): ConversionResponse {
    this.app.debug(`getConversion called for: ${pathStr}`)

    const preferences = this.preferencesStore.getPreferences()
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    const metadata = this.metadataManager.resolveMetadataForPath(
      pathStr,
      preferences,
      unitDefinitions,
      {
        findMatchingPattern: (path: string) =>
          this.patternMatcher.findMatchingPattern(path, preferences.pathPatterns || []),
        generateMetadataFromPattern: (pattern: PathPatternRule) =>
          this.patternMatcher.generateMetadataFromPattern(
            pattern,
            unitDefinitions,
            (baseUnit: string) =>
              this.metadataManager.getConversionsForBaseUnit(baseUnit, this.dateFormatsData),
            (category: string) => this.getBaseUnitForCategory(category)
          )
      },
      () => this.getCategoryToBaseUnitMap(),
      (category: string) => this.getBaseUnitForCategory(category),
      this.dateFormatsData
    )

    if (!metadata) {
      this.app.debug(`No metadata resolved for ${pathStr}, returning pass-through conversion.`)
      return this.getPassThroughConversion(pathStr)
    }

    const { preference, targetUnit, conversion } = this.resolveSelectedConversion(pathStr, metadata)
    this.app.debug(`Preference found: ${preference ? JSON.stringify(preference) : 'no'}`)

    if (!preference || !targetUnit || !conversion) {
      this.app.debug(`No conversion preference resolved for path: ${pathStr}`)
      return this.getPassThroughConversion(pathStr, metadata.baseUnit || undefined)
    }

    if (!conversion.formula) {
      this.app.error(`Conversion for ${targetUnit} has no formula`)
      return this.getPassThroughConversion(pathStr, metadata.baseUnit || undefined)
    }

    const skMeta = this.metadataManager.getSignalKMetadata(pathStr)
    const valueType = this.metadataManager.detectValueType(
      skMeta?.units || metadata.baseUnit || undefined,
      skMeta?.value
    )

    const isDateCategory = metadata.category === 'dateTime' || metadata.category === 'epoch'
    const displayFormat = isDateCategory
      ? conversion.dateFormat || preference.displayFormat || 'ISO-8601'
      : preference.displayFormat || targetUnit || ''

    const dateFormatValue = isDateCategory
      ? conversion.dateFormat || preference.displayFormat || 'ISO-8601'
      : conversion.dateFormat || undefined

    return {
      path: pathStr,
      baseUnit: metadata.baseUnit,
      targetUnit,
      formula: conversion.formula,
      inverseFormula: conversion.inverseFormula,
      displayFormat,
      symbol: conversion.symbol,
      category: metadata.category,
      valueType,
      dateFormat: dateFormatValue,
      useLocalTime: conversion.useLocalTime,
      supportsPut: skMeta?.supportsPut,
      signalkTimestamp: skMeta?.timestamp,
      signalkSource: skMeta?.$source || skMeta?.source
    }
  }

  /**
   * Get a pass-through conversion (no conversion applied)
   */
  private getPassThroughConversion(pathStr: string, signalKUnit?: string): ConversionResponse {
    const skMeta = this.metadataManager.getSignalKMetadata(pathStr)
    let unit = signalKUnit

    if (!unit) {
      unit = skMeta?.units
      if (!unit) {
        const appMetadata = this.app.getMetadata(pathStr)
        if (appMetadata?.units) {
          unit = appMetadata.units
        }
      }
    }

    const valueType = this.metadataManager.detectValueType(unit, skMeta?.value)

    let displayFormat = '0.0'
    let symbol = ''

    if (valueType === 'boolean') {
      displayFormat = 'boolean'
      symbol = ''
    } else if (valueType === 'date') {
      displayFormat = 'ISO-8601'
      symbol = ''
    } else if (valueType === 'string') {
      displayFormat = 'string'
      symbol = ''
    }

    return {
      path: pathStr,
      baseUnit: unit || 'none',
      targetUnit: unit || 'none',
      formula: 'value',
      inverseFormula: 'value',
      displayFormat: displayFormat,
      symbol: symbol,
      category:
        this.metadataManager.getCategoryFromBaseUnit(
          unit,
          this.getCategoryToBaseUnitMap(),
          pathStr
        ) || 'none',
      valueType: valueType,
      dateFormat: valueType === 'date' ? 'ISO-8601' : undefined,
      useLocalTime: valueType === 'date' ? false : undefined,
      supportsPut: skMeta?.supportsPut,
      signalkTimestamp: skMeta?.timestamp,
      signalkSource: skMeta?.$source || skMeta?.source
    }
  }

  /**
   * UNIFIED conversion method - handles ALL value types (number, date, boolean, string, object)
   * This is the SINGLE source of truth for conversions used by both API and WebSocket
   */
  convertPathValue(
    pathStr: string,
    value: unknown
  ): {
    converted: any
    formatted: string
    original: any
    metadata: {
      units: string
      displayFormat: string
      description: string
      originalUnits: string
      displayName?: string
    }
  } {
    const conversionInfo = this.getConversion(pathStr)

    // Runtime check: if value is an object (but not null), pass it through regardless of metadata
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      return {
        converted: value,
        formatted: JSON.stringify(value),
        original: value,
        metadata: {
          units: conversionInfo.symbol || '',
          displayFormat: conversionInfo.displayFormat,
          description: `${pathStr} (${conversionInfo.category || 'converted'})`,
          originalUnits: conversionInfo.baseUnit || '',
          displayName: conversionInfo.symbol
            ? `${pathStr.split('.').pop()} (${conversionInfo.symbol})`
            : undefined
        }
      }
    }

    // Determine value type - use category as secondary check for dates
    const isDateCategory =
      conversionInfo.category === 'dateTime' || conversionInfo.category === 'epoch'
    const valueType =
      isDateCategory || conversionInfo.valueType === 'date' ? 'date' : conversionInfo.valueType

    let converted: any
    let formatted: string

    switch (valueType) {
      case 'number': {
        if (typeof value !== 'number' || !isFinite(value)) {
          throw new Error(`Expected numeric value for path ${pathStr}, got ${typeof value}`)
        }
        const result = this.conversionEngine.convertWithFormula(
          value,
          conversionInfo.formula,
          conversionInfo.symbol || '',
          conversionInfo.displayFormat
        )
        converted = result.convertedValue
        formatted = result.formatted
        break
      }

      case 'date': {
        let isoValue: string
        if (typeof value === 'number') {
          // Handle epoch timestamps (assume seconds, check baseUnit for multiplier)
          const normalizedBase = (conversionInfo.baseUnit || '').toLowerCase()
          const isEpochBase = normalizedBase.includes('epoch')
          const date = new Date(value * (isEpochBase ? 1000 : 1))
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid epoch timestamp: ${value}`)
          }
          isoValue = date.toISOString()
        } else if (typeof value === 'string') {
          isoValue = value
        } else if (value instanceof Date) {
          isoValue = value.toISOString()
        } else {
          throw new Error(
            `Expected date/number/string for date path ${pathStr}, got ${typeof value}`
          )
        }

        const dateResult = this.conversionEngine.formatDateValue(
          isoValue,
          conversionInfo.targetUnit || '',
          conversionInfo.dateFormat,
          conversionInfo.useLocalTime
        )
        converted = dateResult.convertedValue
        formatted = dateResult.formatted
        break
      }

      case 'boolean': {
        if (typeof value !== 'boolean') {
          throw new Error(`Expected boolean value for path ${pathStr}, got ${typeof value}`)
        }
        converted = value
        formatted = value ? 'true' : 'false'
        break
      }

      case 'string': {
        converted = String(value)
        formatted = converted
        break
      }

      case 'object': {
        if (value === null || typeof value !== 'object') {
          throw new Error(`Expected object for path ${pathStr}, got ${typeof value}`)
        }
        converted = value
        formatted = JSON.stringify(value)
        break
      }

      default: {
        // Unknown type - pass through
        converted = value
        formatted = String(value)
        break
      }
    }

    return {
      converted,
      formatted,
      original: value,
      metadata: {
        units: conversionInfo.symbol || '',
        displayFormat: conversionInfo.displayFormat,
        description: `${pathStr} (${conversionInfo.category || 'converted'})`,
        originalUnits: conversionInfo.baseUnit || '',
        displayName: conversionInfo.symbol
          ? `${pathStr.split('.').pop()} (${conversionInfo.symbol})`
          : undefined
      }
    }
  }

  /**
   * Convert a value using the conversion formula (DEPRECATED: use convertPathValue instead)
   */
  convertValue(pathStr: string, value: number): ConvertValueResponse {
    const conversionInfo = this.getConversion(pathStr)
    const skMeta = this.metadataManager.getSignalKMetadata(pathStr)

    const result = this.conversionEngine.convertWithFormula(
      value,
      conversionInfo.formula,
      conversionInfo.symbol || '',
      conversionInfo.displayFormat
    )

    return {
      ...result,
      signalkTimestamp: skMeta?.timestamp,
      signalkSource: skMeta?.$source || skMeta?.source
    }
  }

  /**
   * Format a date value according to target unit and format
   */
  formatDateValue(
    isoValue: string,
    targetUnit: string,
    dateFormat?: string,
    useLocalOverride?: boolean
  ): {
    convertedValue: any
    formatted: string
    displayFormat: string
    useLocalTime: boolean
    dateFormat: string
  } {
    return this.conversionEngine.formatDateValue(isoValue, targetUnit, dateFormat, useLocalOverride)
  }

  /**
   * Convert a unit value from base unit to target unit
   */
  convertUnitValue(
    baseUnit: string,
    targetUnit: string,
    rawValue: unknown,
    options?: { displayFormat?: string; useLocalTime?: boolean }
  ): {
    convertedValue: any
    formatted: string
    symbol: string
    displayFormat: string
    valueType: any
    dateFormat?: string
    useLocalTime?: boolean
  } {
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    return this.conversionEngine.convertUnitValue(
      baseUnit,
      targetUnit,
      rawValue,
      unitDefinitions,
      (bu: string) => this.metadataManager.getConversionsForBaseUnit(bu, this.dateFormatsData),
      (bu: string) =>
        this.metadataManager.getCategoryFromBaseUnit(bu, this.getCategoryToBaseUnitMap()),
      options
    )
  }

  /**
   * Get all paths with their conversion configuration
   */
  async getAllPathsInfo(): Promise<any[]> {
    const pathsInfo: any[] = []
    const preferences = this.preferencesStore.getPreferences()

    try {
      const pathsSet = await this.metadataManager.collectSignalKPaths()
      const paths = Array.from(pathsSet)
      this.app.debug(`Processing ${paths.length} total unique paths`)

      if (paths.length === 0) {
        this.app.debug('No paths found from SignalK API')
        return []
      }

      const unitDefinitions = this.preferencesStore.getUnitDefinitions()

      // Build info for each path
      for (const path of paths) {
        const pathOverride = preferences.pathOverrides?.[path]
        const matchingPattern = this.patternMatcher.findMatchingPattern(
          path,
          preferences.pathPatterns || []
        )
        const skMetadata = this.metadataManager.getSignalKMetadata(path)
        const metadataEntry = this.metadataManager.resolveMetadataForPath(
          path,
          preferences,
          unitDefinitions,
          {
            findMatchingPattern: (p: string) =>
              this.patternMatcher.findMatchingPattern(p, preferences.pathPatterns || []),
            generateMetadataFromPattern: (pattern: PathPatternRule) =>
              this.patternMatcher.generateMetadataFromPattern(
                pattern,
                unitDefinitions,
                (baseUnit: string) =>
                  this.metadataManager.getConversionsForBaseUnit(baseUnit, this.dateFormatsData),
                (category: string) => this.getBaseUnitForCategory(category)
              )
          },
          () => this.getCategoryToBaseUnitMap(),
          (category: string) => this.getBaseUnitForCategory(category),
          this.dateFormatsData
        )

        let status: string
        let source: string
        let baseUnit: string
        let category: string
        let displayUnit: string
        let targetUnit: string | undefined

        // Determine status and configuration based on priority hierarchy
        if (pathOverride) {
          status = 'override'
          source = 'Path Override'
          baseUnit = pathOverride.baseUnit || skMetadata?.units || '-'
          const overrideCategory = (pathOverride as any)?.category as string | undefined
          category =
            overrideCategory ||
            matchingPattern?.category ||
            metadataEntry?.category ||
            this.metadataManager.getCategoryFromBaseUnit(
              pathOverride.baseUnit || skMetadata?.units,
              this.getCategoryToBaseUnitMap(),
              path
            ) ||
            '-'
          displayUnit = pathOverride.targetUnit
          targetUnit = pathOverride.targetUnit
        } else if (matchingPattern) {
          status = 'pattern'
          source = `Pattern: ${matchingPattern.pattern}`
          const patternBaseUnit =
            matchingPattern.baseUnit || this.getBaseUnitForCategory(matchingPattern.category)
          baseUnit = patternBaseUnit || '-'
          category = matchingPattern.category
          const categoryPref = preferences.categories?.[matchingPattern.category]
          targetUnit = matchingPattern.targetUnit || categoryPref?.targetUnit
          displayUnit = targetUnit || baseUnit || '-'
        } else if (skMetadata?.units) {
          baseUnit = skMetadata.units
          category =
            metadataEntry?.category ||
            this.metadataManager.getCategoryFromBaseUnit(
              skMetadata.units,
              this.getCategoryToBaseUnitMap(),
              path
            ) ||
            '-'

          const categoryPref = category !== '-' ? preferences.categories?.[category] : null

          if (categoryPref && categoryPref.targetUnit) {
            status = 'auto'
            source = 'SignalK Auto'
            targetUnit = categoryPref.targetUnit
            displayUnit = targetUnit || baseUnit
          } else {
            status = 'signalk'
            source = 'SignalK Only'
            displayUnit = baseUnit
            targetUnit = undefined
          }
        } else {
          const allCategories = [
            ...this.getCoreCategories(),
            ...Object.keys(preferences.categories || {})
          ]
          const inferredCategory = this.metadataManager.inferCategoryFromPath(path, allCategories)

          if (inferredCategory) {
            status = 'inferred'
            source = 'Inferred from path'
            baseUnit = this.getBaseUnitForCategory(inferredCategory) || '-'
            category = inferredCategory

            const categoryPref = preferences.categories?.[inferredCategory]
            if (categoryPref?.targetUnit && baseUnit !== '-') {
              targetUnit = categoryPref.targetUnit
              displayUnit = targetUnit
            } else {
              displayUnit = baseUnit
              targetUnit = undefined
            }
          } else {
            status = 'none'
            source = 'None'
            baseUnit = '-'
            category = '-'
            displayUnit = '-'
            targetUnit = undefined
          }
        }

        const value = this.app.getSelfPath(path)
        const valueType = this.metadataManager.detectValueType(skMetadata?.units, value)

        pathsInfo.push({
          path,
          status,
          source,
          baseUnit,
          category,
          displayUnit,
          targetUnit,
          valueType,
          supportsPut: skMetadata?.supportsPut || false,
          value: value !== undefined ? value : null,
          units: skMetadata?.units || null,
          description: skMetadata?.description || null
        })
      }

      this.app.debug(`Built info for ${pathsInfo.length} paths`)
      return pathsInfo
    } catch (error) {
      this.app.error(`Error getting all paths info: ${error}`)
      return []
    }
  }

  /**
   * Get resolved metadata for a specific path (includes all conversions)
   */
  getMetadataForPath(pathStr: string): UnitMetadata | null {
    const preferences = this.preferencesStore.getPreferences()
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    return this.metadataManager.resolveMetadataForPath(
      pathStr,
      preferences,
      unitDefinitions,
      {
        findMatchingPattern: (path: string) =>
          this.patternMatcher.findMatchingPattern(path, preferences.pathPatterns || []),
        generateMetadataFromPattern: (pattern: PathPatternRule) =>
          this.patternMatcher.generateMetadataFromPattern(
            pattern,
            unitDefinitions,
            (baseUnit: string) =>
              this.metadataManager.getConversionsForBaseUnit(baseUnit, this.dateFormatsData),
            (category: string) => this.getBaseUnitForCategory(category)
          )
      },
      () => this.getCategoryToBaseUnitMap(),
      (category: string) => this.getBaseUnitForCategory(category),
      this.dateFormatsData
    )
  }

  /**
   * Build a map of all discovered paths to their metadata definitions.
   */
  async getPathsMetadata(): Promise<Record<string, UnitMetadata>> {
    const result: Record<string, UnitMetadata> = {}
    const preferences = this.preferencesStore.getPreferences()
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    try {
      // Collect paths directly from SignalK API instead of relying on signalKMetadata
      // which may be empty if frontend hasn't called POST /signalk-metadata
      const pathsSet = await this.metadataManager.collectSignalKPaths()

      // Also include any path overrides that may not be in SignalK
      Object.keys(preferences.pathOverrides || {}).forEach(path => pathsSet.add(path))

      for (const path of pathsSet) {
        const metadata = this.metadataManager.resolveMetadataForPath(
          path,
          preferences,
          unitDefinitions,
          {
            findMatchingPattern: (p: string) =>
              this.patternMatcher.findMatchingPattern(p, preferences.pathPatterns || []),
            generateMetadataFromPattern: (pattern: PathPatternRule) =>
              this.patternMatcher.generateMetadataFromPattern(
                pattern,
                unitDefinitions,
                (baseUnit: string) =>
                  this.metadataManager.getConversionsForBaseUnit(baseUnit, this.dateFormatsData),
                (category: string) => this.getBaseUnitForCategory(category)
              )
          },
          () => this.getCategoryToBaseUnitMap(),
          (category: string) => this.getBaseUnitForCategory(category),
          this.dateFormatsData
        )

        if (metadata) {
          const { targetUnit, conversion } = this.resolveSelectedConversion(path, metadata)

          result[path] = {
            baseUnit: metadata.baseUnit,
            category: metadata.category,
            conversions:
              targetUnit && conversion
                ? {
                    [targetUnit]: {
                      formula: conversion.formula,
                      inverseFormula: conversion.inverseFormula,
                      symbol: conversion.symbol,
                      dateFormat: conversion.dateFormat,
                      useLocalTime: conversion.useLocalTime
                    }
                  }
                : {}
          }
        } else {
          const skMeta = this.app.getMetadata(path)
          const baseUnit = skMeta?.units || null
          result[path] = {
            baseUnit,
            category:
              this.metadataManager.getCategoryFromBaseUnit(
                baseUnit,
                this.getCategoryToBaseUnitMap(),
                path
              ) || 'none',
            conversions: {}
          }
        }
      }

      return result
    } catch (error) {
      this.app.error(`Error building path metadata map: ${error}`)
      return {}
    }
  }

  /**
   * Get all metadata
   */
  getMetadata(): UnitsMetadataStore {
    return this.metadataManager.getMetadata()
  }

  /**
   * Get all preferences
   */
  getPreferences(): UnitsPreferences {
    return this.preferencesStore.getPreferences()
  }

  /**
   * Get all unit definitions (built-in + custom)
   */
  getUnitDefinitions(): Record<string, BaseUnitDefinition & { isCustom?: boolean }> {
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()
    const baseUnitDefs: Record<string, BaseUnitDefinition & { isCustom?: boolean }> = {}

    // Use JSON data if available, otherwise fall back to TypeScript
    const sourceData =
      Object.keys(this.standardUnitsData).length > 0 ? this.standardUnitsData : builtInUnits

    // Handle JSON format (baseUnit as keys)
    if (sourceData === this.standardUnitsData) {
      for (const [baseUnit, data] of Object.entries(sourceData)) {
        baseUnitDefs[baseUnit] = {
          baseUnit,
          conversions: data.conversions || {},
          isCustom: false
        }
      }
    } else {
      // Handle TypeScript format (path-based entries)
      for (const [, meta] of Object.entries(sourceData)) {
        if (meta.baseUnit && !baseUnitDefs[meta.baseUnit]) {
          baseUnitDefs[meta.baseUnit] = {
            baseUnit: meta.baseUnit,
            conversions: meta.conversions || {},
            isCustom: false
          }
        } else if (meta.baseUnit && meta.conversions) {
          baseUnitDefs[meta.baseUnit].conversions = {
            ...baseUnitDefs[meta.baseUnit].conversions,
            ...meta.conversions
          }
        }
      }
    }

    // Merge custom units with built-in units
    const invalidKeys = ['categories', 'pathOverrides', 'pathPatterns', 'currentPreset']
    for (const [baseUnit, customDef] of Object.entries(unitDefinitions)) {
      if (invalidKeys.includes(baseUnit)) {
        this.app.error(
          `Skipping invalid key "${baseUnit}" in units-definitions.json - this belongs in units-preferences.json`
        )
        continue
      }

      if (typeof customDef !== 'object' || customDef === null || !customDef.conversions) {
        this.app.error(
          `Skipping invalid unit definition for "${baseUnit}" - must have conversions property`
        )
        continue
      }

      if (baseUnitDefs[baseUnit]) {
        const coreConversions = baseUnitDefs[baseUnit].conversions
        const customConvs = customDef.conversions || {}

        const customConversionNames = Object.keys(customConvs).filter(
          conv => !coreConversions[conv]
        )

        baseUnitDefs[baseUnit] = {
          baseUnit,
          conversions: {
            ...coreConversions,
            ...customConvs
          },
          isCustom: false,
          customConversions: customConversionNames
        }
      } else {
        baseUnitDefs[baseUnit] = {
          ...customDef,
          isCustom: true,
          customConversions: Object.keys(customDef.conversions || {})
        }
      }
    }

    return baseUnitDefs
  }

  /**
   * Get unit schema (base units, categories, target units mapping)
   * Uses a 15-second TTL cache for performance
   */
  getUnitSchema(): {
    baseUnits: Array<{ value: string; label: string }>
    categories: string[]
    targetUnitsByBase: Record<string, string[]>
    categoryToBaseUnit: Record<string, string>
    coreCategories: string[]
    baseUnitDefinitions: Record<
      string,
      { conversions: Record<string, any>; description?: string; isCustom?: boolean }
    >
  } {
    const now = Date.now()

    // Return cached schema if it's still fresh
    if (this.cachedSchema && now - this.schemaCacheTimestamp < this.SCHEMA_CACHE_TTL_MS) {
      this.app.debug('Returning cached schema')
      return this.cachedSchema
    }

    // Cache expired or doesn't exist - rebuild it
    this.app.debug('Building fresh schema (cache expired or empty)')
    const schema = this.buildUnitSchema()

    // Update cache
    this.cachedSchema = schema
    this.schemaCacheTimestamp = now

    return schema
  }

  /**
   * Build unit schema from scratch (expensive operation)
   * Called by getUnitSchema() when cache is stale
   */
  private buildUnitSchema(): {
    baseUnits: Array<{ value: string; label: string }>
    categories: string[]
    targetUnitsByBase: Record<string, string[]>
    categoryToBaseUnit: Record<string, string>
    coreCategories: string[]
    baseUnitDefinitions: Record<
      string,
      { conversions: Record<string, any>; description?: string; isCustom?: boolean }
    >
  } {
    const preferences = this.preferencesStore.getPreferences()
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    const baseUnitsSet = new Set<string>()
    const categoriesSet = new Set<string>()
    const targetUnitsByBase: Record<string, Set<string>> = {}

    const categoryToBaseUnitMap: Record<string, string> = { ...this.getCategoryToBaseUnitMap() }
    const coreCategories = this.getCoreCategories()

    for (const category of coreCategories) {
      categoriesSet.add(category)
    }

    // Scan custom categories from preferences
    for (const [category, pref] of Object.entries(preferences.categories || {})) {
      if (pref.baseUnit) {
        categoriesSet.add(category)
        baseUnitsSet.add(pref.baseUnit)
        categoryToBaseUnitMap[category] = pref.baseUnit

        if (!targetUnitsByBase[pref.baseUnit]) {
          targetUnitsByBase[pref.baseUnit] = new Set()
        }
        targetUnitsByBase[pref.baseUnit].add(pref.targetUnit)
      }
    }

    // Scan standard unit definitions
    const sourceData =
      Object.keys(this.standardUnitsData).length > 0 ? this.standardUnitsData : builtInUnits

    if (sourceData === this.standardUnitsData) {
      for (const [baseUnit, data] of Object.entries(sourceData)) {
        baseUnitsSet.add(baseUnit)
        if (data.conversions) {
          if (!targetUnitsByBase[baseUnit]) {
            targetUnitsByBase[baseUnit] = new Set()
          }
          for (const targetUnit of Object.keys(data.conversions)) {
            targetUnitsByBase[baseUnit].add(targetUnit)
          }
        }
      }
    }

    // Scan custom unit definitions
    for (const [baseUnit, def] of Object.entries(unitDefinitions)) {
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

    // Scan all metadata to discover categories
    const allMetadata = { ...builtInUnits, ...this.metadataManager.getMetadata() }

    for (const [, meta] of Object.entries(allMetadata)) {
      if (!meta.baseUnit) continue

      baseUnitsSet.add(meta.baseUnit)

      if (meta.category && meta.category !== 'custom') {
        categoriesSet.add(meta.category)
        if (!categoryToBaseUnitMap[meta.category]) {
          categoryToBaseUnitMap[meta.category] = meta.baseUnit
        }
      }
    }

    // Add date formats as target units
    if (this.dateFormatsData?.formats) {
      const dateFormatNames = Object.keys(this.dateFormatsData.formats)

      if (!targetUnitsByBase['RFC 3339 (UTC)']) {
        targetUnitsByBase['RFC 3339 (UTC)'] = new Set()
      }
      dateFormatNames.forEach(format => targetUnitsByBase['RFC 3339 (UTC)'].add(format))

      if (!targetUnitsByBase['Epoch Seconds']) {
        targetUnitsByBase['Epoch Seconds'] = new Set()
      }
      dateFormatNames.forEach(format => targetUnitsByBase['Epoch Seconds'].add(format))
    }

    const baseUnitsArray = Array.from(baseUnitsSet).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )
    const baseUnits = baseUnitsArray.map(unit => ({
      value: unit,
      label: this.getBaseUnitLabel(unit)
    }))

    // Ensure each base unit is always included in its own target units list
    for (const baseUnit of baseUnitsArray) {
      if (!targetUnitsByBase[baseUnit]) {
        targetUnitsByBase[baseUnit] = new Set()
      }
      targetUnitsByBase[baseUnit].add(baseUnit)
    }

    const targetUnitsMap: Record<string, string[]> = {}
    for (const [baseUnit, units] of Object.entries(targetUnitsByBase)) {
      targetUnitsMap[baseUnit] = Array.from(units).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      )
    }

    // Build complete base unit definitions
    const baseUnitDefinitions: Record<
      string,
      { conversions: Record<string, any>; description?: string; isCustom?: boolean }
    > = {}

    const standardSource =
      Object.keys(this.standardUnitsData).length > 0 ? this.standardUnitsData : builtInUnits

    if (standardSource === this.standardUnitsData) {
      for (const [baseUnit, data] of Object.entries(standardSource)) {
        baseUnitDefinitions[baseUnit] = {
          conversions: data.conversions || {},
          description: data.description,
          isCustom: false
        }
      }
    } else {
      const processedBaseUnits = new Set<string>()
      for (const [, meta] of Object.entries(standardSource)) {
        if (meta.baseUnit && !processedBaseUnits.has(meta.baseUnit)) {
          processedBaseUnits.add(meta.baseUnit)
          baseUnitDefinitions[meta.baseUnit] = {
            conversions: meta.conversions || {},
            isCustom: false
          }
        } else if (meta.baseUnit && meta.conversions) {
          baseUnitDefinitions[meta.baseUnit].conversions = {
            ...baseUnitDefinitions[meta.baseUnit].conversions,
            ...meta.conversions
          }
        }
      }
    }

    // Merge custom unit definitions
    for (const [baseUnit, customDef] of Object.entries(unitDefinitions)) {
      if (baseUnitDefinitions[baseUnit]) {
        baseUnitDefinitions[baseUnit].conversions = {
          ...baseUnitDefinitions[baseUnit].conversions,
          ...(customDef.conversions || {})
        }
      } else {
        baseUnitDefinitions[baseUnit] = {
          conversions: customDef.conversions || {},
          description: customDef.longName || customDef.description,
          isCustom: true
        }
      }
    }

    return {
      baseUnits,
      categories: Array.from(categoriesSet).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      ),
      targetUnitsByBase: targetUnitsMap,
      categoryToBaseUnit: categoryToBaseUnitMap,
      coreCategories,
      baseUnitDefinitions
    }
  }

  /**
   * Get a human-readable label for a base unit
   */
  private getBaseUnitLabel(unit: string): string {
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    // Try to get longName from standard units data
    const standardDef = this.standardUnitsData[unit]
    if (standardDef?.longName) {
      return `${standardDef.longName} (${unit})`
    }

    // Try custom definitions (check both longName and description for backwards compatibility)
    const customDef = unitDefinitions[unit]
    if (customDef?.longName) {
      return `${customDef.longName} (${unit})`
    }
    if (customDef?.description) {
      return `${customDef.description} (${unit})`
    }

    // Fallback to hardcoded labels
    const labels: Record<string, string> = {
      'm/s': 'm/s (speed)',
      K: 'K (temperature)',
      Pa: 'Pa (pressure)',
      m: 'm (distance/depth)',
      rad: 'rad (angle)',
      m3: 'm³ (volume)',
      V: 'V (voltage)',
      A: 'A (current)',
      W: 'W (power)',
      Hz: 'Hz (frequency)',
      ratio: 'ratio (percentage)',
      s: 's (time)',
      C: 'C (charge)',
      deg: 'deg (latitude/longitude)',
      'm3/s': 'm³/s (volume rate)',
      'RFC 3339 (UTC)': 'RFC 3339 (UTC) (date/time)',
      'Epoch Seconds': 'Epoch Seconds (Unix timestamp)',
      tr: 'tr (tabula rasa - blank slate for custom transformations)'
    }
    return labels[unit] || unit
  }

  // ===== Delegation methods for PreferencesStore CRUD =====

  async savePreferences(): Promise<void> {
    return this.preferencesStore.savePreferences()
  }

  async updateCategoryPreference(category: string, preference: CategoryPreference): Promise<void> {
    return this.preferencesStore.updateCategoryPreference(category, preference)
  }

  async deleteCategoryPreference(category: string): Promise<void> {
    return this.preferencesStore.deleteCategoryPreference(category)
  }

  async updateCurrentPreset(type: string, name: string, version: string): Promise<void> {
    return this.preferencesStore.updateCurrentPreset(type, name, version)
  }

  async updatePathOverride(pathStr: string, preference: CategoryPreference): Promise<void> {
    return this.preferencesStore.updatePathOverride(pathStr, preference)
  }

  async deletePathOverride(pathStr: string): Promise<void> {
    return this.preferencesStore.deletePathOverride(pathStr)
  }

  async addPathPattern(pattern: PathPatternRule): Promise<void> {
    return this.preferencesStore.addPathPattern(pattern)
  }

  async updatePathPattern(index: number, pattern: PathPatternRule): Promise<void> {
    return this.preferencesStore.updatePathPattern(index, pattern)
  }

  async deletePathPattern(index: number): Promise<void> {
    return this.preferencesStore.deletePathPattern(index)
  }

  async addUnitDefinition(baseUnit: string, definition: BaseUnitDefinition): Promise<void> {
    return this.preferencesStore.addUnitDefinition(baseUnit, definition)
  }

  async deleteUnitDefinition(baseUnit: string): Promise<void> {
    return this.preferencesStore.deleteUnitDefinition(baseUnit)
  }

  async addConversionToUnit(
    baseUnit: string,
    targetUnit: string,
    conversion: ConversionDefinition
  ): Promise<void> {
    const unitDefinitions = this.preferencesStore.getUnitDefinitions()

    // If base unit doesn't exist in custom definitions, check built-in
    if (!unitDefinitions[baseUnit]) {
      const builtInDef = Object.values(builtInUnits).find(meta => meta.baseUnit === baseUnit)

      if (!builtInDef) {
        throw new Error(`Base unit "${baseUnit}" not found`)
      }
    }

    return this.preferencesStore.addConversionToUnit(baseUnit, targetUnit, conversion)
  }

  async deleteConversionFromUnit(baseUnit: string, targetUnit: string): Promise<void> {
    return this.preferencesStore.deleteConversionFromUnit(baseUnit, targetUnit)
  }
}
