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
  epoch: { targetUnit: 'time-am/pm-local', displayFormat: 'time-am/pm' },
  volume: { targetUnit: 'gal', displayFormat: '0.0' },
  length: { targetUnit: 'ft', displayFormat: '0.0' },
  angularVelocity: { targetUnit: 'deg/s', displayFormat: '0.0' },
  voltage: { targetUnit: 'V', displayFormat: '0.00' },
  current: { targetUnit: 'A', displayFormat: '0.00' },
  power: { targetUnit: 'W', displayFormat: '0.00' },
  frequency: { targetUnit: 'rpm', displayFormat: '0.0' },
  time: { targetUnit: 's', displayFormat: '0.0' },
  charge: { targetUnit: 'Ah', displayFormat: '0.0' },
  volumeRate: { targetUnit: 'gal/h', displayFormat: '0.0' },
  unitless: { targetUnit: 'tr', displayFormat: '0.0' }
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
  private unitDefinitions: Record<string, BaseUnitDefinition>
  private signalKMetadata: Record<string, SignalKPathMetadata> // path -> full metadata
  private preferencesPath: string
  private customDefinitionsPath: string
  private standardUnitsData: Record<string, any> = {}
  private categoriesData: any = {}
  private dateFormatsData: any = {}
  private definitionsDir: string

  constructor(
    private app: ServerAPI,
    private dataDir: string
  ) {
    this.preferencesPath = path.join(dataDir, 'units-preferences.json')
    this.customDefinitionsPath = path.join(dataDir, 'custom-units-definitions.json')
    this.definitionsDir = path.join(__dirname, '..', 'presets', 'definitions')
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
      case 'short-date-24hrs': {
        formatted = `${monthShort} ${parts.day}, ${parts.year} ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
        convertedValue = formatted
        break
      }
      case 'short-date-am/pm': {
        const hours12 = parts.hours % 12 || 12
        const suffix = parts.hours >= 12 ? 'PM' : 'AM'
        formatted = `${monthShort} ${parts.day}, ${parts.year} ${pad2(hours12)}:${pad2(parts.minutes)}:${pad2(parts.seconds)} ${suffix}`
        convertedValue = formatted
        break
      }
      case 'long-date-24hrs': {
        formatted = `${weekdayLong}, ${monthLong} ${parts.day}, ${parts.year} ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
        convertedValue = formatted
        break
      }
      case 'long-date-am/pm': {
        const hours12 = parts.hours % 12 || 12
        const suffix = parts.hours >= 12 ? 'PM' : 'AM'
        formatted = `${weekdayLong}, ${monthLong} ${parts.day}, ${parts.year} ${pad2(hours12)}:${pad2(parts.minutes)}:${pad2(parts.seconds)} ${suffix}`
        convertedValue = formatted
        break
      }
      case 'dd/mm/yyyy-24hrs': {
        formatted = `${pad2(parts.day)}/${pad2(parts.monthIndex + 1)}/${parts.year} ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
        convertedValue = formatted
        break
      }
      case 'dd/mm/yyyy-am/pm': {
        const hours12 = parts.hours % 12 || 12
        const suffix = parts.hours >= 12 ? 'PM' : 'AM'
        formatted = `${pad2(parts.day)}/${pad2(parts.monthIndex + 1)}/${parts.year} ${pad2(hours12)}:${pad2(parts.minutes)}:${pad2(parts.seconds)} ${suffix}`
        convertedValue = formatted
        break
      }
      case 'mm/dd/yyyy-24hrs': {
        formatted = `${pad2(parts.monthIndex + 1)}/${pad2(parts.day)}/${parts.year} ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`
        convertedValue = formatted
        break
      }
      case 'mm/dd/yyyy-am/pm': {
        const hours12 = parts.hours % 12 || 12
        const suffix = parts.hours >= 12 ? 'PM' : 'AM'
        formatted = `${pad2(parts.monthIndex + 1)}/${pad2(parts.day)}/${parts.year} ${pad2(hours12)}:${pad2(parts.minutes)}:${pad2(parts.seconds)} ${suffix}`
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
   * Initialize the manager by loading or creating data files
   */
  async initialize(): Promise<void> {
    this.migrateFileNames()
    this.loadDefinitionFiles()
    await this.loadPreferences()
    await this.loadUnitDefinitions()
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
   * Public API for frontend use
   */
  getCategoriesForBaseUnit(baseUnit: string): string[] {
    // Start with static categories
    const categoryMap = { ...this.getCategoryToBaseUnitMap() }

    // Add custom categories that have a baseUnit defined
    for (const [category, pref] of Object.entries(this.preferences.categories || {})) {
      if (pref.baseUnit) {
        categoryMap[category] = pref.baseUnit
      }
    }

    return Object.entries(categoryMap)
      .filter(([, unit]) => unit === baseUnit)
      .map(([category]) => category)
  }

  /**
   * Get conversions for a base unit (JSON or TypeScript fallback)
   */
  private getConversionsForBaseUnit(baseUnit: string): UnitMetadata | null {
    // Try JSON first
    if (this.standardUnitsData[baseUnit]) {
      return {
        baseUnit,
        category: this.standardUnitsData[baseUnit].category || 'custom',
        conversions: this.standardUnitsData[baseUnit].conversions || {}
      }
    }

    // Fallback to TypeScript
    const builtInDef = Object.values(comprehensiveDefaultUnits).find(
      meta => meta.baseUnit === baseUnit
    )
    if (builtInDef) {
      return builtInDef
    }

    const defaultDef = Object.values(defaultUnitsMetadata).find(meta => meta.baseUnit === baseUnit)
    if (defaultDef) {
      return defaultDef
    }

    return null
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
   * Infer category from path name alone (for paths with no metadata)
   * Checks if the last path element contains any known category name.
   */
  private inferCategoryFromPath(pathStr: string): string | null {
    if (!pathStr) {
      return null
    }

    const pathElements = pathStr.split('.')
    const lastElement = pathElements[pathElements.length - 1].toLowerCase()

    // Get all known categories
    const allCategories = [
      ...this.getCoreCategories(),
      ...Object.keys(this.preferences.categories || {})
    ]

    // Check if last element contains any category name
    const match = allCategories.find(cat => lastElement.includes(cat.toLowerCase()))

    if (match) {
      this.app.debug(
        `Inferred category from path: ${pathStr} → category "${match}" (matched "${lastElement}")`
      )
      return match
    }

    return null
  }

  /**
   * Infer a category from a base unit by looking at custom definitions,
   * built-in metadata, or category defaults.
   *
   * When multiple categories map to the same base unit, uses path heuristic:
   * checks if the last path element contains any category name.
   */
  private getCategoryFromBaseUnit(baseUnit?: string | null, pathStr?: string): string | null {
    if (!baseUnit) {
      return null
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

    // Get all categories that map to this base unit
    const matchingCategories = Object.entries(this.getCategoryToBaseUnitMap())
      .filter(([, unit]) => unit === baseUnit)
      .map(([cat]) => cat)

    if (matchingCategories.length === 0) {
      return null
    }

    if (matchingCategories.length === 1) {
      // 1:1 mapping, return the only category
      return matchingCategories[0]
    }

    // Many-to-one: Use path element heuristic if path is provided
    if (pathStr) {
      const pathElements = pathStr.split('.')
      const lastElement = pathElements[pathElements.length - 1].toLowerCase()

      // Check if last element contains any category name
      const match = matchingCategories.find(cat => lastElement.includes(cat.toLowerCase()))

      if (match) {
        this.app.debug(
          `Smart category assignment: ${pathStr} + base unit "${baseUnit}" → category "${match}" (matched "${lastElement}")`
        )
        return match
      }
    }

    // Fallback: return first matching category
    this.app.debug(
      `Default category assignment: base unit "${baseUnit}" → category "${matchingCategories[0]}" (first of ${matchingCategories.length})`
    )
    return matchingCategories[0]
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

    // Path override takes precedence (highest priority)
    if (pathOverridePref) {
      let baseUnit: string | null = null
      let category: string | null = null

      // If override specifies baseUnit, use it
      if (pathOverridePref.baseUnit) {
        baseUnit = pathOverridePref.baseUnit
      }

      // If override specifies category, always use it
      if (pathOverridePref.category) {
        category = pathOverridePref.category
      }

      // If we have category but no baseUnit yet, get baseUnit from category
      if (category && !baseUnit) {
        baseUnit = this.getBaseUnitForCategory(category)
      }

      // If we have a baseUnit from either source, build metadata
      if (baseUnit) {
        const builtInDef = this.getConversionsForBaseUnit(baseUnit)
        const customDef = this.unitDefinitions[baseUnit]

        // Merge built-in and custom conversions
        const conversions = {
          ...(builtInDef?.conversions || {}),
          ...(customDef?.conversions || {})
        }

        // Use the override's category if specified, otherwise infer from baseUnit
        const finalCategory = category || builtInDef?.category || this.getCategoryFromBaseUnit(baseUnit, pathStr) || 'custom'

        metadata = {
          baseUnit,
          category: finalCategory,
          conversions
        }
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
      const skMetadata = this.signalKMetadata[pathStr]

      if (skMetadata?.units) {
        const inferred = this.inferMetadataFromSignalK(pathStr, skMetadata.units)
        if (inferred) {
          metadata = inferred
        } else {
          const baseUnit = skMetadata.units
          const builtInDef = this.getConversionsForBaseUnit(baseUnit)
          const customDef = this.unitDefinitions[baseUnit]

          // Merge built-in and custom conversions
          const conversions = {
            ...(builtInDef?.conversions || {}),
            ...(customDef?.conversions || {})
          }

          metadata = {
            baseUnit,
            category:
              builtInDef?.category || this.getCategoryFromBaseUnit(baseUnit, pathStr) || 'custom',
            conversions
          }
        }
      }
    }

    // FINAL FALLBACK: Path-only inference (catches paths not in comprehensive defaults)
    if (!metadata) {
      const inferredCategory = this.inferCategoryFromPath(pathStr)
      if (inferredCategory) {
        const baseUnit = this.getBaseUnitForCategory(inferredCategory)
        if (baseUnit) {
          this.app.debug(
            `Path-only inference: ${pathStr} → category "${inferredCategory}" → base unit "${baseUnit}"`
          )
          const builtInDef = this.getConversionsForBaseUnit(baseUnit)
          const customDef = this.unitDefinitions[baseUnit]

          const conversions = {
            ...(builtInDef?.conversions || {}),
            ...(customDef?.conversions || {})
          }

          metadata = {
            baseUnit,
            category: inferredCategory,
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
      const fallback = this.getConversionsForBaseUnit(baseUnit)
      if (fallback?.conversions?.[targetUnit]) {
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
                const schemaBaseUnit = this.getCategoryToBaseUnitMap()[category]
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

      // Only add baseUnit if this is a custom category (not in the static schema)
      // Core categories get their baseUnit from the categoryToBaseUnit map
      const isCoreCategory = !!this.getCategoryToBaseUnitMap()[category]
      if (baseUnit && !existing.baseUnit && !isCoreCategory) {
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
   * Migrate old file names to new naming convention
   */
  private migrateFileNames(): void {
    // Migrate units-definitions.json to custom-units-definitions.json
    const oldCustomPath = path.join(this.dataDir, 'units-definitions.json')
    if (fs.existsSync(oldCustomPath) && !fs.existsSync(this.customDefinitionsPath)) {
      try {
        fs.renameSync(oldCustomPath, this.customDefinitionsPath)
        this.app.debug('Migrated units-definitions.json to custom-units-definitions.json')
      } catch (error) {
        this.app.error(`Failed to migrate units-definitions.json: ${error}`)
      }
    }

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
   * Load unit definitions from file
   */
  private async loadUnitDefinitions(): Promise<void> {
    try {
      if (fs.existsSync(this.customDefinitionsPath)) {
        const data = fs.readFileSync(this.customDefinitionsPath, 'utf-8')
        this.unitDefinitions = JSON.parse(data)
        this.app.debug('Loaded custom unit definitions from file')
      } else {
        this.unitDefinitions = {}
        await this.saveUnitDefinitions()
        this.app.debug('Created default custom unit definitions file')
      }
    } catch (error) {
      this.app.error(`Failed to load custom unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Save unit definitions to file
   */
  async saveUnitDefinitions(): Promise<void> {
    try {
      fs.writeFileSync(
        this.customDefinitionsPath,
        JSON.stringify(this.unitDefinitions, null, 2),
        'utf-8'
      )
      this.app.debug('Saved custom unit definitions')
    } catch (error) {
      this.app.error(`Failed to save custom unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Get all unit definitions (built-in + custom)
   */
  getUnitDefinitions(): Record<string, BaseUnitDefinition & { isCustom?: boolean }> {
    // Extract base unit definitions from JSON or TypeScript fallback
    const baseUnitDefs: Record<string, BaseUnitDefinition & { isCustom?: boolean }> = {}

    // Use JSON data if available, otherwise fall back to TypeScript
    const sourceData =
      Object.keys(this.standardUnitsData).length > 0
        ? this.standardUnitsData
        : comprehensiveDefaultUnits

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
          // Merge conversions if we've seen this base unit before
          baseUnitDefs[meta.baseUnit].conversions = {
            ...baseUnitDefs[meta.baseUnit].conversions,
            ...meta.conversions
          }
        }
      }
    }

    // Merge custom units with built-in units
    // Filter out invalid keys that don't belong in unit definitions
    const invalidKeys = ['categories', 'pathOverrides', 'pathPatterns', 'currentPreset']
    for (const [baseUnit, customDef] of Object.entries(this.unitDefinitions)) {
      // Skip keys that are preferences properties, not unit definitions
      if (invalidKeys.includes(baseUnit)) {
        this.app.error(
          `Skipping invalid key "${baseUnit}" in units-definitions.json - this belongs in units-preferences.json`
        )
        continue
      }

      // Validate that customDef has the expected structure
      if (typeof customDef !== 'object' || customDef === null || !customDef.conversions) {
        this.app.error(
          `Skipping invalid unit definition for "${baseUnit}" - must have conversions property`
        )
        continue
      }

      if (baseUnitDefs[baseUnit]) {
        // This is an extension of a built-in base unit - merge conversions
        const coreConversions = baseUnitDefs[baseUnit].conversions
        const customConvs = customDef.conversions || {}

        // Only mark conversions as custom if they DON'T exist in the core definition
        const customConversionNames = Object.keys(customConvs).filter(
          conv => !coreConversions[conv]
        )

        baseUnitDefs[baseUnit] = {
          baseUnit,
          conversions: {
            ...coreConversions,
            ...customConvs
          },
          isCustom: false, // Mark as not custom since it's extending a built-in
          customConversions: customConversionNames // Only truly custom conversions
        }
      } else {
        // This is a purely custom base unit
        baseUnitDefs[baseUnit] = {
          ...customDef,
          isCustom: true,
          customConversions: Object.keys(customDef.conversions || {}) // All conversions are custom
        }
      }
    }

    return baseUnitDefs
  }

  /**
   * Add or update a unit definition
   */
  async addUnitDefinition(baseUnit: string, definition: BaseUnitDefinition): Promise<void> {
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
      const builtInDef = Object.values(comprehensiveDefaultUnits).find(
        meta => meta.baseUnit === baseUnit
      )

      if (builtInDef) {
        // Create a custom extension for this built-in base unit
        this.unitDefinitions[baseUnit] = {
          baseUnit: baseUnit,
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
      category: this.getCategoryFromBaseUnit(unit, pathStr) || 'none',
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

      // Handle string results (e.g., formatted time)
      let formatted: string
      if (typeof convertedValue === 'string') {
        formatted = conversionInfo.symbol
          ? `${convertedValue} ${conversionInfo.symbol}`
          : convertedValue
      } else {
        const formattedNumber = formatNumber(convertedValue, conversionInfo.displayFormat)
        formatted = `${formattedNumber} ${conversionInfo.symbol}`
      }

      return {
        originalValue: value,
        convertedValue: typeof convertedValue === 'number' ? convertedValue : value,
        symbol: conversionInfo.symbol,
        formatted,
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

    // Get built-in conversions (from JSON or TypeScript fallback)
    const builtInDef = this.getConversionsForBaseUnit(baseUnit)

    // Merge with custom definitions if they exist
    const customDef = this.unitDefinitions[baseUnit]
    if (builtInDef && customDef) {
      // Merge conversions from built-in and custom (custom conversions take priority)
      return this.cloneMetadata({
        baseUnit,
        category: builtInDef.category,
        conversions: {
          ...builtInDef.conversions,
          ...customDef.conversions
        }
      })
    }

    // Return built-in or custom (whichever exists)
    if (builtInDef) {
      return this.cloneMetadata(builtInDef)
    }

    if (customDef) {
      // Custom definition without built-in - infer category
      return this.cloneMetadata({
        ...customDef,
        category: this.getCategoryFromBaseUnit(baseUnit) || 'custom'
      })
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
    const symbol = conversion.symbol || ''

    // If formula returns a string (e.g., formatted time), use it directly without number formatting
    let formatted: string
    if (typeof convertedValue === 'string') {
      formatted = symbol ? `${convertedValue} ${symbol}`.trim() : convertedValue
    } else {
      const formattedNumber = formatNumber(convertedValue, displayFormat)
      formatted = symbol ? `${formattedNumber} ${symbol}`.trim() : formattedNumber
    }

    return {
      convertedValue,
      formatted,
      symbol,
      displayFormat,
      valueType: typeof convertedValue === 'string' ? 'string' : 'number'
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
    const defaultsForBaseUnit = this.getConversionsForBaseUnit(baseUnit)

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

  /**
   * Get base unit for a category from preferences or schema
   */
  private getBaseUnitForCategory(category: string): string | null {
    // Check if category preference has a custom baseUnit
    const categoryPref = this.preferences.categories?.[category]
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
    const category = Object.entries(this.getCategoryToBaseUnitMap()).find(
      ([, baseUnit]) => baseUnit === units
    )?.[0]

    if (!category) {
      // Unknown unit - return null so fallback can handle it
      return null
    }

    // Try to get conversions for this base unit
    const conversions = this.getConversionsForBaseUnit(units)
    if (conversions && conversions.category === category) {
      return conversions
    }

    // Found category but no conversions - return null to let fallback code handle it
    return null
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
            this.getCategoryFromBaseUnit(pathOverride.baseUnit || skMetadata?.units, path) ||
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
            metadataEntry?.category || this.getCategoryFromBaseUnit(skMetadata.units, path) || '-'

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
          // No metadata at all - try to infer category from path name
          const inferredCategory = this.inferCategoryFromPath(path)

          if (inferredCategory) {
            status = 'inferred'
            source = 'Inferred from path'
            baseUnit = this.getBaseUnitForCategory(inferredCategory) || '-'
            category = inferredCategory

            // Check if inferred category has preferences
            const categoryPref = this.preferences.categories?.[inferredCategory]
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
      // Use paths from signalKMetadata (sent by frontend) instead of stale API snapshot
      const pathsSet = new Set<string>(Object.keys(this.signalKMetadata))

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
            category: this.getCategoryFromBaseUnit(baseUnit, path) || 'none',
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
    coreCategories: string[]
    baseUnitDefinitions: Record<string, { conversions: Record<string, any>; description?: string; isCustom?: boolean }>
  } {
    // Extract unique base units from comprehensive defaults
    const baseUnitsSet = new Set<string>()
    const categoriesSet = new Set<string>()
    const targetUnitsByBase: Record<string, Set<string>> = {}

    // Start with the static category-to-baseUnit mapping from defaultUnits
    // This ensures standard SignalK categories use the correct base units
    const categoryToBaseUnitMap: Record<string, string> = { ...this.getCategoryToBaseUnitMap() }

    // Track which categories are core (from the static schema)
    const coreCategories = this.getCoreCategories()

    // Add all core categories to the set (so they always appear even if no paths use them)
    for (const category of coreCategories) {
      categoriesSet.add(category)
    }

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

    // Scan standard unit definitions
    const sourceData =
      Object.keys(this.standardUnitsData).length > 0
        ? this.standardUnitsData
        : comprehensiveDefaultUnits

    if (sourceData === this.standardUnitsData) {
      // JSON format (baseUnit as keys)
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

    // Scan custom unit definitions (override/extend standard)
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

    // Scan all metadata to discover categories (but NOT to add conversions)
    // Path-specific metadata conversions shouldn't pollute the global schema
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

      // NOTE: We do NOT add path-specific conversions to targetUnitsByBase
      // Those are only for specific paths, not global schema
    }

    // Add date formats as target units for dateTime/epoch base units
    if (this.dateFormatsData?.formats) {
      const dateFormatNames = Object.keys(this.dateFormatsData.formats)

      // Add to RFC 3339 (UTC) base unit
      if (!targetUnitsByBase['RFC 3339 (UTC)']) {
        targetUnitsByBase['RFC 3339 (UTC)'] = new Set()
      }
      dateFormatNames.forEach(format => targetUnitsByBase['RFC 3339 (UTC)'].add(format))

      // Add to Epoch Seconds base unit
      if (!targetUnitsByBase['Epoch Seconds']) {
        targetUnitsByBase['Epoch Seconds'] = new Set()
      }
      dateFormatNames.forEach(format => targetUnitsByBase['Epoch Seconds'].add(format))
    }

    // Convert sets to arrays and create labeled base units
    const baseUnitsArray = Array.from(baseUnitsSet).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )
    const baseUnits = baseUnitsArray.map(unit => ({
      value: unit,
      label: this.getBaseUnitLabel(unit)
    }))

    const targetUnitsMap: Record<string, string[]> = {}
    for (const [baseUnit, units] of Object.entries(targetUnitsByBase)) {
      targetUnitsMap[baseUnit] = Array.from(units).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      )
    }

    // Build complete base unit definitions with conversions
    const baseUnitDefinitions: Record<string, { conversions: Record<string, any>; description?: string; isCustom?: boolean }> = {}

    // Add standard units from JSON or TypeScript fallback
    const standardSource = Object.keys(this.standardUnitsData).length > 0 ? this.standardUnitsData : comprehensiveDefaultUnits

    if (standardSource === this.standardUnitsData) {
      // JSON format
      for (const [baseUnit, data] of Object.entries(standardSource)) {
        baseUnitDefinitions[baseUnit] = {
          conversions: data.conversions || {},
          description: data.description,
          isCustom: false
        }
      }
    } else {
      // TypeScript format - extract unique base units
      const processedBaseUnits = new Set<string>()
      for (const [, meta] of Object.entries(standardSource)) {
        if (meta.baseUnit && !processedBaseUnits.has(meta.baseUnit)) {
          processedBaseUnits.add(meta.baseUnit)
          baseUnitDefinitions[meta.baseUnit] = {
            conversions: meta.conversions || {},
            isCustom: false
          }
        } else if (meta.baseUnit && meta.conversions) {
          // Merge conversions if we've seen this base unit
          baseUnitDefinitions[meta.baseUnit].conversions = {
            ...baseUnitDefinitions[meta.baseUnit].conversions,
            ...meta.conversions
          }
        }
      }
    }

    // Merge custom unit definitions
    for (const [baseUnit, customDef] of Object.entries(this.unitDefinitions)) {
      if (baseUnitDefinitions[baseUnit]) {
        // Extend existing base unit with custom conversions
        baseUnitDefinitions[baseUnit].conversions = {
          ...baseUnitDefinitions[baseUnit].conversions,
          ...(customDef.conversions || {})
        }
      } else {
        // Purely custom base unit
        baseUnitDefinitions[baseUnit] = {
          conversions: customDef.conversions || {},
          description: customDef.description,
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
