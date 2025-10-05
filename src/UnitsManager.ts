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
  ConvertValueResponse,
  PathValueType,
  SignalKPathMetadata,
  PathPreference
} from './types'
import { defaultUnitsMetadata, categoryToBaseUnit } from './defaultUnits'
import { comprehensiveDefaultUnits } from './comprehensiveDefaults'
import { evaluateFormula, formatNumber } from './formulaEvaluator'

class UnitConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnitConversionError'
  }
}

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]
const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const WEEKDAY_NAMES_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const pad2 = (value: number): string => value.toString().padStart(2, '0')

const DEFAULT_CATEGORY_PREFERENCES: Record<string, CategoryPreference & { baseUnit?: string }> = {
  speed: { targetUnit: 'knots', displayFormat: '0.0' },
  temperature: { targetUnit: 'celsius', displayFormat: '0' },
  pressure: { targetUnit: 'hPa', displayFormat: '0' },
  distance: { targetUnit: 'nm', displayFormat: '0.0' },
  depth: { targetUnit: 'm', displayFormat: '0.0' },
  angle: { targetUnit: 'deg', displayFormat: '0' },
  percentage: { targetUnit: 'percent', displayFormat: '0' },
  dateTime: { targetUnit: 'time-am/pm-local', displayFormat: 'time-am/pm' },
  epoch: { targetUnit: 'time-am/pm-local', displayFormat: 'time-am/pm', baseUnit: 'Epoch Seconds' },
  volume: { targetUnit: 'gal', displayFormat: '0.0' },
  length: { targetUnit: 'ft', displayFormat: '0.0' },
  angularVelocity: { targetUnit: 'deg/s', displayFormat: '0.0' },
  voltage: { targetUnit: 'V', displayFormat: '0.00' },
  current: { targetUnit: 'A', displayFormat: '0.00' },
  power: { targetUnit: 'W', displayFormat: '0.00' },
  frequency: { targetUnit: 'rpm', displayFormat: '0.0' },
  time: { targetUnit: 's', displayFormat: '0.0' },
  charge: { targetUnit: 'Ah', displayFormat: '0.0' },
  volumeRate: { targetUnit: 'gal/h', displayFormat: '0.0' }
}

const DEFAULT_PATH_PATTERNS: PathPatternRule[] = [
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
  },
  {
    pattern: '**.timeEpoch',
    category: 'epoch',
    targetUnit: 'time-am/pm-local',
    priority: 100,
    baseUnit: 'Epoch Seconds'
  }
]

export class UnitsManager {
  private metadata: UnitsMetadataStore
  private preferences: UnitsPreferences
  private unitDefinitions: Record<string, UnitMetadata>
  private signalKMetadata: Record<string, SignalKPathMetadata> // path -> full metadata
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

  private getDateParts(date: Date, useLocal: boolean) {
    return {
      year: useLocal ? date.getFullYear() : date.getUTCFullYear(),
      monthIndex: useLocal ? date.getMonth() : date.getUTCMonth(),
      day: useLocal ? date.getDate() : date.getUTCDate(),
      hours: useLocal ? date.getHours() : date.getUTCHours(),
      minutes: useLocal ? date.getMinutes() : date.getUTCMinutes(),
      seconds: useLocal ? date.getSeconds() : date.getUTCSeconds(),
      weekday: useLocal ? date.getDay() : date.getUTCDay()
    }
  }

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
    const date = new Date(isoValue)
    if (Number.isNaN(date.getTime())) {
      throw new UnitConversionError('Invalid ISO-8601 date value')
    }

    const normalizedTarget = targetUnit.endsWith('-local')
      ? targetUnit.replace(/-local$/, '')
      : targetUnit

    const formatKey = (dateFormat || normalizedTarget || '').toLowerCase()
    const useLocalTime = useLocalOverride ?? targetUnit.endsWith('-local')

    const parts = this.getDateParts(date, useLocalTime)
    const monthShort = MONTH_NAMES_SHORT[parts.monthIndex] || ''
    const monthLong = MONTH_NAMES_LONG[parts.monthIndex] || ''
    const weekdayLong = WEEKDAY_NAMES_LONG[parts.weekday] || ''

    let formatted: string
    let convertedValue: any

    switch (formatKey) {
      case 'short-date': {
        formatted = `${monthShort} ${parts.day}, ${parts.year}`
        convertedValue = formatted
        break
      }
      case 'long-date': {
        formatted = `${weekdayLong}, ${monthLong} ${parts.day}, ${parts.year}`
        convertedValue = formatted
        break
      }
      case 'dd/mm/yyyy': {
        formatted = `${pad2(parts.day)}/${pad2(parts.monthIndex + 1)}/${parts.year}`
        convertedValue = formatted
        break
      }
      case 'mm/dd/yyyy': {
        formatted = `${pad2(parts.monthIndex + 1)}/${pad2(parts.day)}/${parts.year}`
        convertedValue = formatted
        break
      }
      case 'mm/yyyy': {
        formatted = `${pad2(parts.monthIndex + 1)}/${parts.year}`
        convertedValue = formatted
        break
      }
      case 'time-24hrs': {
        formatted = `${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
        convertedValue = formatted
        break
      }
      case 'time-am/pm': {
        const hours12 = parts.hours % 12 || 12
        const suffix = parts.hours >= 12 ? 'PM' : 'AM'
        formatted = `${pad2(hours12)}:${pad2(parts.minutes)}:${pad2(parts.seconds)} ${suffix}`
        convertedValue = formatted
        break
      }
      case 'epoch-seconds': {
        const epochSeconds = Math.floor(date.getTime() / 1000)
        convertedValue = epochSeconds
        formatted = String(epochSeconds)
        break
      }
      default: {
        formatted = isoValue
        convertedValue = isoValue
        break
      }
    }

    const displayFormat = dateFormat || formatKey || 'ISO-8601'

    return {
      convertedValue,
      formatted,
      displayFormat,
      useLocalTime,
      dateFormat: displayFormat
    }
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
  setSignalKMetadata(metadata: Record<string, SignalKPathMetadata>): void {
    this.signalKMetadata = metadata
    this.app.debug(`Received SignalK metadata for ${Object.keys(metadata).length} paths`)
  }

  /**
   * Detect value type from units or value
   */
  private detectValueType(units?: string, value?: any): PathValueType {
    // Date detection from units
    if (units === 'RFC 3339 (UTC)' || units === 'ISO-8601 (UTC)') {
      return 'date'
    }

    // If we have a value, detect from it
    if (value !== undefined && value !== null) {
      const valueType = typeof value
      if (valueType === 'boolean') return 'boolean'
      if (valueType === 'number') return 'number'
      if (valueType === 'string') {
        // Check if string is RFC3339 date
        const rfc3339 =
          /^([0-9]+)-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])[Tt]([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(([Zz])|([+-]([01][0-9]|2[0-3]):[0-5][0-9]))$/
        if (rfc3339.test(value)) {
          return 'date'
        }
        return 'string'
      }
      if (valueType === 'object') return 'object'
    }

    // Default: if has units, assume number
    if (units && units !== '') {
      return 'number'
    }

    return 'unknown'
  }

  /**
   * Infer a category from a base unit by looking at custom definitions,
   * built-in metadata, or category defaults.
   */
  private getCategoryFromBaseUnit(baseUnit?: string | null): string | null {
    if (!baseUnit) {
      return null
    }

    // Custom unit definitions override everything else
    if (this.unitDefinitions[baseUnit]?.category) {
      return this.unitDefinitions[baseUnit].category
    }

    // Check current metadata store
    const metadataEntry = Object.values(this.metadata).find(meta => meta.baseUnit === baseUnit)
    if (metadataEntry?.category) {
      return metadataEntry.category
    }

    // Search comprehensive defaults
    const comprehensiveEntry = Object.values(comprehensiveDefaultUnits).find(
      meta => meta.baseUnit === baseUnit
    )
    if (comprehensiveEntry?.category) {
      return comprehensiveEntry.category
    }

    // Fallback to category-to-base mapping (may be many-to-one, choose first)
    const categoryMatch = Object.entries(categoryToBaseUnit).find(([, unit]) => unit === baseUnit)
    if (categoryMatch) {
      return categoryMatch[0]
    }

    return null
  }

  /**
   * Create a defensive copy of UnitMetadata so callers don't mutate shared references.
   */
  private cloneMetadata(meta: UnitMetadata): UnitMetadata {
    return {
      baseUnit: meta.baseUnit,
      category: meta.category,
      conversions: Object.fromEntries(
        Object.entries(meta.conversions || {}).map(([target, def]) => [target, { ...def }])
      )
    }
  }

  /**
   * Resolve metadata for a specific path, taking into account overrides, patterns,
   * SignalK metadata, and comprehensive defaults.
   */
  private resolveMetadataForPath(pathStr: string): UnitMetadata | null {
    const pathOverridePref = this.preferences.pathOverrides?.[pathStr] as PathPreference | undefined

    let metadata = this.metadata[pathStr]
    if (metadata) {
      return this.cloneMetadata(metadata)
    }

    // Path override takes precedence when specifying a base unit
    if (pathOverridePref?.baseUnit) {
      const baseUnit = pathOverridePref.baseUnit
      const builtInDef = Object.values(comprehensiveDefaultUnits).find(
        meta => meta.baseUnit === baseUnit
      )
      const customDef = this.unitDefinitions[baseUnit]

      // Merge built-in and custom conversions
      const conversions = {
        ...(builtInDef?.conversions || {}),
        ...(customDef?.conversions || {})
      }

      metadata = {
        baseUnit,
        category: customDef?.category || builtInDef?.category || this.getCategoryFromBaseUnit(baseUnit) || 'custom',
        conversions
      }
    }

    // Attempt to generate from user-defined patterns if still missing
    if (!metadata) {
      const matchingPattern = this.findMatchingPattern(pathStr)
      if (matchingPattern) {
        const generated = this.generateMetadataFromPattern(matchingPattern)
        if (generated) {
          metadata = generated
        }
      }
    }

    // Fall back to SignalK metadata units
    if (!metadata) {
      const skMetadata = this.app.getMetadata(pathStr)

      if (skMetadata?.units) {
        const inferred = this.inferMetadataFromSignalK(pathStr, skMetadata.units)
        if (inferred) {
          metadata = inferred
        } else {
          const baseUnit = skMetadata.units
          const builtInDef = Object.values(comprehensiveDefaultUnits).find(
            meta => meta.baseUnit === baseUnit
          )
          const customDef = this.unitDefinitions[baseUnit]

          // Merge built-in and custom conversions
          const conversions = {
            ...(builtInDef?.conversions || {}),
            ...(customDef?.conversions || {})
          }

          metadata = {
            baseUnit,
            category: customDef?.category || builtInDef?.category || this.getCategoryFromBaseUnit(baseUnit) || 'custom',
            conversions
          }
        }
      }
    }

    if (!metadata) {
      return null
    }

    const cloned = this.cloneMetadata(metadata)
    this.metadata[pathStr] = cloned
    return this.cloneMetadata(cloned)
  }

  /**
   * Collect all SignalK paths by walking the server data model.
   */
  private async collectSignalKPaths(): Promise<Set<string>> {
    const pathsSet = new Set<string>()

    try {
      let hostname = 'localhost'
      let port = 3000
      let protocol = 'http'

      const configSettings = (this.app as any).config?.settings
      if (configSettings) {
        hostname = configSettings.hostname || hostname
        port = configSettings.port || port
        protocol = configSettings.ssl ? 'https' : protocol
      }

      const apiUrl = `${protocol}://${hostname}:${port}/signalk/v1/api/`

      const globalFetch = (globalThis as any).fetch
      if (typeof globalFetch !== 'function') {
        this.app.error(
          'Fetch API is unavailable. Unable to load SignalK metadata without native fetch support.'
        )
        return pathsSet
      }

      const fetchFn = globalFetch.bind(globalThis) as (
        input: string,
        init?: any
      ) => Promise<{ ok: boolean; statusText: string; json(): Promise<any> }>

      this.app.debug(`Fetching from SignalK API: ${apiUrl}`)
      const response = await fetchFn(apiUrl)

      if (!response.ok) {
        this.app.error(`Failed to fetch from SignalK API: ${response.statusText}`)
        return pathsSet
      }

      const data = await response.json()

      const extractPathsRecursive = (obj: any, prefix = ''): void => {
        if (!obj || typeof obj !== 'object') return

        for (const key in obj) {
          if (
            key === 'meta' ||
            key === 'timestamp' ||
            key === 'source' ||
            key === '$source' ||
            key === 'values' ||
            key === 'sentence'
          ) {
            continue
          }

          const currentPath = prefix ? `${prefix}.${key}` : key

          if (obj[key] && typeof obj[key] === 'object') {
            if (obj[key].value !== undefined) {
              pathsSet.add(currentPath)
            }
            extractPathsRecursive(obj[key], currentPath)
          }
        }
      }

      const selfVesselId = data.self
      const actualSelfId =
        selfVesselId && selfVesselId.startsWith('vessels.')
          ? selfVesselId.replace('vessels.', '')
          : selfVesselId

      if (data.vessels && actualSelfId && data.vessels[actualSelfId]) {
        this.app.debug(`Extracting paths from vessel: ${actualSelfId}`)
        extractPathsRecursive(data.vessels[actualSelfId], '')
        this.app.debug(`Extracted ${pathsSet.size} paths from SignalK API`)
      }
    } catch (error) {
      this.app.error(`Error collecting SignalK paths: ${error}`)
    }

    return pathsSet
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

    let conversion = metadata.conversions?.[targetUnit] || null
    const baseUnit = metadata.baseUnit || preference.baseUnit

    if (!conversion && baseUnit) {
      const unitDef = this.unitDefinitions[baseUnit]
      if (unitDef?.conversions?.[targetUnit]) {
        conversion = unitDef.conversions[targetUnit]
      }
    }

    if (!conversion && baseUnit) {
      const fallback = Object.values(comprehensiveDefaultUnits).find(
        meta => meta.baseUnit === baseUnit && meta.conversions?.[targetUnit]
      )
      if (fallback) {
        conversion = fallback.conversions[targetUnit]
      }
    }

    return { preference, targetUnit, conversion: conversion || null }
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

        let preferencesChanged = false

        if (!this.preferences.categories) {
          this.preferences.categories = {}
          preferencesChanged = true
        }

        if (!this.preferences.pathOverrides) {
          this.preferences.pathOverrides = {}
          preferencesChanged = true
        }

        if (!this.preferences.pathPatterns) {
          this.preferences.pathPatterns = []
          preferencesChanged = true
        }

        preferencesChanged = this.ensureCategoryDefaults() || preferencesChanged
        preferencesChanged = this.ensureDefaultPathPatterns() || preferencesChanged

        if (preferencesChanged) {
          await this.savePreferences()
        }
      } else {
        this.preferences = {
          categories: {},
          pathOverrides: {},
          pathPatterns: DEFAULT_PATH_PATTERNS.map(rule => ({ ...rule }))
        }

        this.ensureCategoryDefaults()
        this.ensureDefaultPathPatterns()

        // Apply Imperial US preset by default on virgin install
        try {
          const presetPath = path.join(__dirname, '..', 'presets', 'imperial-us.json')
          if (fs.existsSync(presetPath)) {
            const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
            const preset = presetData.categories

            // Apply preset categories (create missing categories automatically)
            for (const [category, settings] of Object.entries(preset)) {
              const castSettings = settings as {
                targetUnit?: string
                displayFormat?: string
                baseUnit?: string
              }

              const existing = this.preferences.categories[category]
              if (existing) {
                this.preferences.categories[category] = {
                  targetUnit: castSettings.targetUnit || existing.targetUnit || '',
                  displayFormat: castSettings.displayFormat || existing.displayFormat || '0.0'
                }
              } else {
                const schemaBaseUnit = categoryToBaseUnit[category]
                const presetBaseUnit = castSettings.baseUnit

                const newCategoryPref: CategoryPreference = {
                  targetUnit: castSettings.targetUnit || '',
                  displayFormat: castSettings.displayFormat || '0.0'
                }

                if (presetBaseUnit && (!schemaBaseUnit || schemaBaseUnit !== presetBaseUnit)) {
                  newCategoryPref.baseUnit = presetBaseUnit
                }

                this.preferences.categories[category] = newCategoryPref
              }
            }

            // Set current preset info
            this.preferences.currentPreset = {
              type: 'imperial-us',
              name: presetData.name,
              version: presetData.version,
              appliedDate: new Date().toISOString()
            }

            this.app.debug('Applied Imperial (US) preset as default for virgin install')
          }
        } catch (error) {
          this.app.error(`Failed to apply default preset: ${error}`)
        }

        this.ensureCategoryDefaults()
        this.ensureDefaultPathPatterns()
        await this.savePreferences()
        this.app.debug('Created default units preferences file')
      }
    } catch (error) {
      this.app.error(`Failed to load preferences: ${error}`)
      throw error
    }
  }

  private ensureCategoryDefaults(): boolean {
    let updated = false

    if (!this.preferences.categories) {
      this.preferences.categories = {}
      updated = true
    }

    for (const [category, defaults] of Object.entries(DEFAULT_CATEGORY_PREFERENCES)) {
      const existing = this.preferences.categories[category]
      const { targetUnit, displayFormat, baseUnit } = defaults

      if (!existing) {
        this.preferences.categories[category] = {
          targetUnit,
          displayFormat,
          ...(baseUnit ? { baseUnit } : {})
        }
        updated = true
        continue
      }

      if (baseUnit && !existing.baseUnit) {
        existing.baseUnit = baseUnit
        updated = true
      }

      if (!existing.targetUnit && targetUnit) {
        existing.targetUnit = targetUnit
        updated = true
      }

      if (!existing.displayFormat && displayFormat) {
        existing.displayFormat = displayFormat
        updated = true
      }
    }

    return updated
  }

  private ensureDefaultPathPatterns(): boolean {
    let updated = false

    if (!this.preferences.pathPatterns) {
      this.preferences.pathPatterns = []
      updated = true
    }

    for (const defaultRule of DEFAULT_PATH_PATTERNS) {
      const existing = this.preferences.pathPatterns.find(
        rule => rule.pattern === defaultRule.pattern
      )

      if (!existing) {
        this.preferences.pathPatterns.push({ ...defaultRule })
        updated = true
        continue
      }

      if (defaultRule.category && !existing.category) {
        existing.category = defaultRule.category
        updated = true
      }

      if (defaultRule.baseUnit && !existing.baseUnit) {
        existing.baseUnit = defaultRule.baseUnit
        updated = true
      }

      if (defaultRule.targetUnit && !existing.targetUnit) {
        existing.targetUnit = defaultRule.targetUnit
        updated = true
      }

      if (defaultRule.displayFormat && !existing.displayFormat) {
        existing.displayFormat = defaultRule.displayFormat
        updated = true
      }

      if (defaultRule.priority !== undefined && existing.priority === undefined) {
        existing.priority = defaultRule.priority
        updated = true
      }
    }

    return updated
  }

  /**
   * Save preferences to file
   */
  async savePreferences(): Promise<void> {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2), 'utf-8')
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
      fs.writeFileSync(this.definitionsPath, JSON.stringify(this.unitDefinitions, null, 2), 'utf-8')
      this.app.debug('Saved unit definitions')
    } catch (error) {
      this.app.error(`Failed to save unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Get all unit definitions (built-in + custom)
   */
  getUnitDefinitions(): Record<string, UnitMetadata & { isCustom?: boolean }> {
    // Extract base unit definitions from comprehensive defaults
    const baseUnitDefs: Record<string, UnitMetadata & { isCustom?: boolean }> = {}

    for (const [, meta] of Object.entries(comprehensiveDefaultUnits)) {
      if (meta.baseUnit && !baseUnitDefs[meta.baseUnit]) {
        baseUnitDefs[meta.baseUnit] = {
          baseUnit: meta.baseUnit,
          category: meta.category || meta.baseUnit,
          conversions: meta.conversions || {},
          isCustom: false
        }
      } else if (meta.baseUnit && meta.conversions) {
        // Merge conversions if we've seen this base unit before
        baseUnitDefs[meta.baseUnit].conversions = {
          ...baseUnitDefs[meta.baseUnit].conversions,
          ...meta.conversions
        }
      }
    }

    // Merge custom units with built-in units
    for (const [baseUnit, customDef] of Object.entries(this.unitDefinitions)) {
      if (baseUnitDefs[baseUnit]) {
        // This is an extension of a built-in base unit - merge conversions
        baseUnitDefs[baseUnit] = {
          baseUnit,
          category: baseUnitDefs[baseUnit].category,
          conversions: {
            ...baseUnitDefs[baseUnit].conversions,
            ...customDef.conversions
          },
          isCustom: false // Mark as not custom since it's extending a built-in
        }
      } else {
        // This is a purely custom base unit
        baseUnitDefs[baseUnit] = {
          ...customDef,
          isCustom: true
        }
      }
    }

    return baseUnitDefs
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
    // If this base unit doesn't exist in custom definitions, create it
    if (!this.unitDefinitions[baseUnit]) {
      // Check if it exists in built-in definitions
      const builtInDef = Object.values(comprehensiveDefaultUnits).find(meta => meta.baseUnit === baseUnit)

      if (builtInDef) {
        // Create a custom extension for this built-in base unit
        this.unitDefinitions[baseUnit] = {
          baseUnit: baseUnit,
          category: builtInDef.category,
          conversions: {}
        }
      } else {
        throw new Error(`Base unit "${baseUnit}" not found`)
      }
    }

    if (!this.unitDefinitions[baseUnit].conversions) {
      this.unitDefinitions[baseUnit].conversions = {}
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
    const metadata = this.resolveMetadataForPath(pathStr)

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

    const skMeta = this.signalKMetadata[pathStr]
    const valueType = this.detectValueType(
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
   * If path has SignalK metadata with units, use that as baseUnit/targetUnit
   */
  private getPassThroughConversion(pathStr: string, signalKUnit?: string): ConversionResponse {
    // Get SignalK metadata
    const skMeta = this.signalKMetadata[pathStr]
    let unit = signalKUnit

    if (!unit) {
      // First check the metadata from frontend
      unit = skMeta?.units
      if (!unit) {
        // Fallback to app.getMetadata
        const appMetadata = this.app.getMetadata(pathStr)
        if (appMetadata?.units) {
          unit = appMetadata.units
        }
      }
    }

    // Detect value type
    const valueType = this.detectValueType(unit, skMeta?.value)

    // For booleans and dates, use appropriate display format
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
      category: 'none',
      valueType: valueType,
      dateFormat: valueType === 'date' ? 'ISO-8601' : undefined,
      useLocalTime: valueType === 'date' ? false : undefined,
      supportsPut: skMeta?.supportsPut,
      signalkTimestamp: skMeta?.timestamp,
      signalkSource: skMeta?.$source || skMeta?.source
    }
  }

  /**
   * Convert a value using the conversion formula
   */
  convertValue(pathStr: string, value: number): ConvertValueResponse {
    const conversionInfo = this.getConversion(pathStr)
    const skMeta = this.signalKMetadata[pathStr]

    try {
      const convertedValue = evaluateFormula(conversionInfo.formula, value)
      const formatted = formatNumber(convertedValue, conversionInfo.displayFormat)

      return {
        originalValue: value,
        convertedValue,
        symbol: conversionInfo.symbol,
        formatted: `${formatted} ${conversionInfo.symbol}`,
        displayFormat: conversionInfo.displayFormat,
        signalkTimestamp: skMeta?.timestamp,
        signalkSource: skMeta?.$source || skMeta?.source
      }
    } catch (error) {
      this.app.error(`Error converting value: ${error}`)
      // Return pass-through on error
      return {
        originalValue: value,
        convertedValue: value,
        symbol: '',
        formatted: `${value}`,
        displayFormat: '0.0',
        signalkTimestamp: skMeta?.timestamp,
        signalkSource: skMeta?.$source || skMeta?.source
      }
    }
  }

  private findUnitDefinition(baseUnit: string): UnitMetadata | null {
    if (!baseUnit) {
      return null
    }

    const customDef = this.unitDefinitions[baseUnit]
    if (customDef) {
      return this.cloneMetadata(customDef)
    }

    const metadataDef = Object.values(this.metadata).find(meta => meta.baseUnit === baseUnit)
    if (metadataDef) {
      return this.cloneMetadata(metadataDef)
    }

    const comprehensiveDef = Object.values(comprehensiveDefaultUnits).find(
      meta => meta.baseUnit === baseUnit
    )
    if (comprehensiveDef) {
      return this.cloneMetadata(comprehensiveDef)
    }

    const defaultDef = Object.values(defaultUnitsMetadata).find(meta => meta.baseUnit === baseUnit)
    if (defaultDef) {
      return this.cloneMetadata(defaultDef)
    }

    return null
  }

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
    valueType: PathValueType
    dateFormat?: string
    useLocalTime?: boolean
  } {
    const definition = this.findUnitDefinition(baseUnit)

    if (!definition) {
      throw new UnitConversionError(`Unknown base unit: ${baseUnit}`)
    }

    const conversion = definition.conversions?.[targetUnit]
    if (!conversion) {
      throw new UnitConversionError(`No conversion defined from ${baseUnit} to ${targetUnit}`)
    }

    const normalizedBaseUnit = (baseUnit || '').toLowerCase()
    const isDateConversion =
      normalizedBaseUnit.includes('rfc 3339') ||
      normalizedBaseUnit.includes('epoch') ||
      !!conversion.dateFormat

    if (isDateConversion) {
      let isoString: string

      if (typeof rawValue === 'string') {
        isoString = rawValue
      } else if (typeof rawValue === 'number') {
        const isEpochBase = (baseUnit || '').toLowerCase().includes('epoch')
        const date = new Date(rawValue * (isEpochBase ? 1000 : 1))
        if (Number.isNaN(date.getTime())) {
          throw new UnitConversionError('Invalid epoch value supplied for date conversion')
        }
        isoString = date.toISOString()
      } else {
        throw new UnitConversionError('Date conversions require ISO-8601 string or epoch value')
      }

      const dateResult = this.formatDateValue(
        isoString,
        targetUnit,
        conversion.dateFormat,
        options?.useLocalTime ?? conversion.useLocalTime
      )

      return {
        convertedValue: dateResult.convertedValue,
        formatted: dateResult.formatted,
        symbol: conversion.symbol || '',
        displayFormat: dateResult.displayFormat,
        valueType: 'date',
        dateFormat: dateResult.dateFormat,
        useLocalTime: dateResult.useLocalTime
      }
    }

    let numericValue: number

    if (typeof rawValue === 'number') {
      numericValue = rawValue
    } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
      const parsed = Number(rawValue)
      if (Number.isNaN(parsed)) {
        throw new UnitConversionError('Value must be numeric for this conversion')
      }
      numericValue = parsed
    } else {
      throw new UnitConversionError('Value must be numeric for this conversion')
    }

    const convertedValue = evaluateFormula(conversion.formula, numericValue)

    const displayFormat = options?.displayFormat || '0.0'
    const formattedNumber = formatNumber(convertedValue, displayFormat)
    const symbol = conversion.symbol || ''
    const formatted = symbol ? `${formattedNumber} ${symbol}`.trim() : formattedNumber

    return {
      convertedValue,
      formatted,
      symbol,
      displayFormat,
      valueType: 'number'
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
    this.app.debug(
      `generateMetadataFromPattern - pattern: ${pattern.pattern}, category: ${pattern.category}, baseUnit: ${baseUnit}`
    )

    if (!baseUnit) {
      this.app.debug(`No base unit found for category: ${pattern.category}`)
      return null
    }

    // Check unit definitions first
    if (this.unitDefinitions[baseUnit]) {
      this.app.debug(`Found in unitDefinitions: ${baseUnit}`)
      return {
        baseUnit: baseUnit,
        category: pattern.category,
        conversions: this.unitDefinitions[baseUnit].conversions
      }
    }

    // Try to find default conversions for this base unit
    const defaultsForBaseUnit =
      Object.values(comprehensiveDefaultUnits).find(meta => meta.baseUnit === baseUnit) ||
      Object.values(defaultUnitsMetadata).find(meta => meta.baseUnit === baseUnit)

    if (!defaultsForBaseUnit) {
      this.app.debug(`No default conversions found for base unit: ${baseUnit}`)
      return null
    }

    this.app.debug(
      `Found in comprehensiveDefaultUnits, conversions: ${Object.keys(defaultsForBaseUnit.conversions).join(', ')}`
    )

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
      meta => meta.category === category
    )

    return defaultMeta?.baseUnit || null
  }

  /**
   * Get preference for a path (check overrides first, then patterns, then category)
   */
  private getPreferenceForPath(pathStr: string, category: string): CategoryPreference | null {
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
  private inferMetadataFromSignalK(_pathStr: string, units: string): UnitMetadata | null {
    // Try to find a matching base unit and category
    const category = Object.entries(categoryToBaseUnit).find(
      ([, baseUnit]) => baseUnit === units
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
      ([, meta]) => meta.category === category && meta.baseUnit === units
    )

    if (similarPath) {
      return similarPath[1]
    }

    // Try comprehensive defaults
    const comprehensivePath = Object.entries(comprehensiveDefaultUnits).find(
      ([, meta]) => meta.category === category && meta.baseUnit === units
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
   * Get all paths with their conversion configuration
   */
  async getAllPathsInfo(): Promise<any[]> {
    const pathsInfo: any[] = []

    try {
      const pathsSet = await this.collectSignalKPaths()
      const paths = Array.from(pathsSet)
      this.app.debug(`Processing ${paths.length} total unique paths`)

      if (paths.length === 0) {
        this.app.debug('No paths found from SignalK API')
        return []
      }

      // Build info for each path
      for (const path of paths) {
        const pathOverride = this.preferences.pathOverrides?.[path]
        const matchingPattern = this.findMatchingPattern(path)
        const skMetadata = this.signalKMetadata[path]
        const metadataEntry = this.resolveMetadataForPath(path)

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
            this.getCategoryFromBaseUnit(pathOverride.baseUnit || skMetadata?.units) ||
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
          const categoryPref = this.preferences.categories?.[matchingPattern.category]
          targetUnit = matchingPattern.targetUnit || categoryPref?.targetUnit
          displayUnit = targetUnit || baseUnit || '-'
        } else if (skMetadata?.units) {
          // Try to auto-assign category from SignalK base unit
          baseUnit = skMetadata.units
          category =
            metadataEntry?.category || this.getCategoryFromBaseUnit(skMetadata.units) || '-'

          // Check if this category has a preference (auto-assign to category)
          const categoryPref = category !== '-' ? this.preferences.categories?.[category] : null

          if (categoryPref && categoryPref.targetUnit) {
            // Category has preferences - use them (auto-category assignment)
            status = 'auto'
            source = 'SignalK Auto'
            targetUnit = categoryPref.targetUnit
            displayUnit = targetUnit || baseUnit
          } else {
            // No category preference - SignalK only (pass-through)
            status = 'signalk'
            source = 'SignalK Only'
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

        // Get value details if available
        const value = this.app.getSelfPath(path)
        const valueType = this.detectValueType(skMetadata?.units, value)

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
    return this.resolveMetadataForPath(pathStr)
  }

  /**
   * Build a map of all discovered paths to their metadata definitions.
   */
  async getPathsMetadata(): Promise<Record<string, UnitMetadata>> {
    const result: Record<string, UnitMetadata> = {}

    try {
      const pathsSet = await this.collectSignalKPaths()

      // Include any overrides even if not currently present in the SignalK data
      Object.keys(this.preferences.pathOverrides || {}).forEach(path => pathsSet.add(path))

      for (const path of pathsSet) {
        const metadata = this.resolveMetadataForPath(path)

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
            category: this.getCategoryFromBaseUnit(baseUnit) || 'custom',
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
   * Extract all paths from SignalK data object
   */
  private extractAllPaths(obj: any, prefix = ''): string[] {
    const paths: string[] = []

    if (!obj || typeof obj !== 'object') {
      return paths
    }

    for (const key in obj) {
      // Skip meta keys
      if (
        key === 'meta' ||
        key === 'timestamp' ||
        key === 'source' ||
        key === '$source' ||
        key === 'values' ||
        key === 'sentence'
      ) {
        continue
      }

      const currentPath = prefix ? `${prefix}.${key}` : key
      const value = obj[key]

      if (value && typeof value === 'object') {
        // If it has a 'value' property, it's a leaf node
        if ('value' in value) {
          paths.push(currentPath)
        }
        // Recurse into nested objects
        paths.push(...this.extractAllPaths(value, currentPath))
      }
    }

    return paths
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
  async updateCategoryPreference(category: string, preference: CategoryPreference): Promise<void> {
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
   * Update current preset information
   */
  async updateCurrentPreset(type: string, name: string, version: string): Promise<void> {
    this.preferences.currentPreset = {
      type,
      name,
      version,
      appliedDate: new Date().toISOString()
    }
    await this.savePreferences()
  }

  /**
   * Update path override
   */
  async updatePathOverride(pathStr: string, preference: CategoryPreference): Promise<void> {
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

    for (const [, meta] of Object.entries(allMetadata)) {
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
    const baseUnitsArray = Array.from(baseUnitsSet).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    const baseUnits = baseUnitsArray.map(unit => ({
      value: unit,
      label: this.getBaseUnitLabel(unit)
    }))

    const targetUnitsMap: Record<string, string[]> = {}
    for (const [baseUnit, units] of Object.entries(targetUnitsByBase)) {
      targetUnitsMap[baseUnit] = Array.from(units).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    }

    return {
      baseUnits,
      categories: Array.from(categoriesSet).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
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
      tr: 'tr (tabula rasa - blank slate for custom transformations)'
    }
    return labels[unit] || unit
  }
}
