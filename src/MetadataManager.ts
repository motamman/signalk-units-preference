import { ServerAPI } from '@signalk/server-api'
import {
  UnitsMetadataStore,
  UnitMetadata,
  SignalKPathMetadata,
  PathValueType,
  BaseUnitDefinition,
  UnitsPreferences,
  PathPatternRule
} from './types'
import { builtInUnits } from './builtInUnits'

/**
 * MetadataManager handles path metadata resolution and SignalK integration.
 * Responsibilities:
 * - Manage SignalK metadata integration
 * - Resolve metadata for paths (with fallbacks and inference)
 * - Collect SignalK paths from API
 * - Detect value types
 * - Infer categories from paths
 */
export class MetadataManager {
  private metadata: UnitsMetadataStore
  private signalKMetadata: Record<string, SignalKPathMetadata> = {}
  private standardUnitsData: Record<string, any> = {}
  private categoriesData: any = {}

  constructor(
    private app: ServerAPI,
    standardUnitsData: Record<string, any> = {},
    categoriesData: any = {}
  ) {
    // Use only built-in default metadata (no custom file loading)
    this.metadata = { ...builtInUnits }
    this.standardUnitsData = standardUnitsData
    this.categoriesData = categoriesData
  }

  /**
   * Set SignalK metadata from frontend or auto-initialization
   * Merges new metadata with existing cache to handle paths appearing over time
   */
  setSignalKMetadata(metadata: Record<string, SignalKPathMetadata>): void {
    const existingCount = Object.keys(this.signalKMetadata).length
    const newCount = Object.keys(metadata).length

    // Merge new metadata with existing (new paths win on conflicts)
    this.signalKMetadata = {
      ...this.signalKMetadata,
      ...metadata
    }

    const totalCount = Object.keys(this.signalKMetadata).length
    this.app.debug(
      `Metadata cache updated: ${existingCount} existing + ${newCount} new = ${totalCount} total paths`
    )
  }

  /**
   * Get SignalK metadata for a path
   */
  getSignalKMetadata(pathStr: string): SignalKPathMetadata | undefined {
    return this.signalKMetadata[pathStr]
  }

  /**
   * Get all SignalK metadata
   */
  getAllSignalKMetadata(): Record<string, SignalKPathMetadata> {
    return this.signalKMetadata
  }

  /**
   * Detect value type from units or value
   */
  detectValueType(units?: string, value?: any): PathValueType {
    // Date detection from units
    if (units === 'RFC 3339 (UTC)' || units === 'ISO-8601 (UTC)' || units === 'Epoch Seconds') {
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
  inferCategoryFromPath(pathStr: string, allCategories: string[]): string | null {
    if (!pathStr) {
      return null
    }

    const pathElements = pathStr.split('.')
    const lastElement = pathElements[pathElements.length - 1].toLowerCase()

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
  getCategoryFromBaseUnit(
    baseUnit: string | null | undefined,
    categoryToBaseUnitMap: Record<string, string>,
    pathStr?: string
  ): string | null {
    if (!baseUnit) {
      return null
    }

    // Check current metadata store (skip 'custom' fallback entries)
    const metadataEntry = Object.values(this.metadata).find(meta => meta.baseUnit === baseUnit)
    if (metadataEntry?.category && metadataEntry.category !== 'custom') {
      return metadataEntry.category
    }

    // Search built-in defaults
    const builtInEntry = Object.values(builtInUnits).find(meta => meta.baseUnit === baseUnit)
    if (builtInEntry?.category) {
      return builtInEntry.category
    }

    // Get all categories that map to this base unit
    const matchingCategories = Object.entries(categoryToBaseUnitMap)
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
   * Get conversions for a base unit (JSON or TypeScript fallback)
   */
  getConversionsForBaseUnit(baseUnit: string, dateFormatsData?: any): UnitMetadata | null {
    // Try JSON first
    this.app.debug(
      `getConversionsForBaseUnit: baseUnit=${baseUnit}, standardUnitsData keys=${Object.keys(this.standardUnitsData).join(', ')}`
    )
    if (this.standardUnitsData[baseUnit]) {
      this.app.debug(`Using JSON conversions for ${baseUnit}`)
      const conversions = { ...(this.standardUnitsData[baseUnit].conversions || {}) }

      // For date/time base units, dynamically add date format conversions
      if (
        (baseUnit === 'RFC 3339 (UTC)' || baseUnit === 'Epoch Seconds') &&
        dateFormatsData?.formats
      ) {
        for (const [formatKey, formatMeta] of Object.entries(dateFormatsData.formats)) {
          // Skip if already defined in standardUnitsData
          if (!conversions[formatKey]) {
            conversions[formatKey] = {
              formula: 'value',
              inverseFormula: 'value',
              symbol: '',
              longName: (formatMeta as any).description || formatKey,
              dateFormat: formatKey,
              useLocalTime: (formatMeta as any).useLocalTime || false
            }
          }
        }
      }

      return {
        baseUnit,
        category: this.standardUnitsData[baseUnit].category || 'custom',
        conversions
      }
    }

    // Fallback to TypeScript built-in units
    const builtInDef = Object.values(builtInUnits).find(meta => meta.baseUnit === baseUnit)
    if (builtInDef) {
      return builtInDef
    }

    return null
  }

  /**
   * Resolve metadata for a specific path, taking into account overrides, patterns,
   * SignalK metadata, and comprehensive defaults.
   */
  resolveMetadataForPath(
    pathStr: string,
    preferences: UnitsPreferences,
    unitDefinitions: Record<string, BaseUnitDefinition>,
    patternMatcher: {
      findMatchingPattern: (path: string) => PathPatternRule | null
      generateMetadataFromPattern: (pattern: PathPatternRule) => UnitMetadata | null
    },
    getCategoryToBaseUnitMap: () => Record<string, string>,
    getBaseUnitForCategory: (category: string) => string | null,
    dateFormatsData?: any
  ): UnitMetadata | null {
    const pathOverridePref = preferences.pathOverrides?.[pathStr]

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
      if ((pathOverridePref as any).category) {
        category = (pathOverridePref as any).category
      }

      // If we have category but no baseUnit yet, get baseUnit from category
      if (category && !baseUnit) {
        baseUnit = getBaseUnitForCategory(category)
      }

      // If we have a baseUnit from either source, build metadata
      if (baseUnit) {
        const builtInDef = this.getConversionsForBaseUnit(baseUnit, dateFormatsData)
        const customDef = unitDefinitions[baseUnit]

        // Merge built-in and custom conversions
        const conversions = {
          ...(builtInDef?.conversions || {}),
          ...(customDef?.conversions || {})
        }

        // Use the override's category if specified, otherwise infer from baseUnit
        const finalCategory =
          category ||
          builtInDef?.category ||
          this.getCategoryFromBaseUnit(baseUnit, getCategoryToBaseUnitMap(), pathStr) ||
          'custom'

        metadata = {
          baseUnit,
          category: finalCategory,
          conversions
        }
      }
    }

    // Attempt to generate from user-defined patterns if still missing
    if (!metadata) {
      const matchingPattern = patternMatcher.findMatchingPattern(pathStr)
      if (matchingPattern) {
        const generated = patternMatcher.generateMetadataFromPattern(matchingPattern)
        if (generated) {
          metadata = generated
        }
      }
    }

    // Fall back to SignalK metadata units
    if (!metadata) {
      // First try cached metadata
      let skMetadata = this.signalKMetadata[pathStr]

      // If not in cache, try live query to SignalK server
      if (!skMetadata?.units) {
        const liveMetadata = this.app.getMetadata(pathStr)
        if (liveMetadata?.units) {
          this.app.debug(
            `Live metadata fallback for ${pathStr}: found units=${liveMetadata.units}`
          )
          // Cache it for future use
          skMetadata = {
            units: liveMetadata.units,
            description: liveMetadata.description,
            value: undefined,
            $source: undefined,
            timestamp: undefined
          }
          // Add to cache
          this.signalKMetadata[pathStr] = skMetadata
        }
      }

      if (skMetadata?.units) {
        const inferred = this.inferMetadataFromSignalK(
          pathStr,
          skMetadata.units,
          getCategoryToBaseUnitMap(),
          dateFormatsData
        )
        if (inferred) {
          metadata = inferred
        } else {
          const baseUnit = skMetadata.units
          const builtInDef = this.getConversionsForBaseUnit(baseUnit, dateFormatsData)
          const customDef = unitDefinitions[baseUnit]

          // Merge built-in and custom conversions
          const conversions = {
            ...(builtInDef?.conversions || {}),
            ...(customDef?.conversions || {})
          }

          metadata = {
            baseUnit,
            category:
              this.getCategoryFromBaseUnit(baseUnit, getCategoryToBaseUnitMap(), pathStr) ||
              builtInDef?.category ||
              'custom',
            conversions
          }
        }
      }
    }

    // FINAL FALLBACK: Path-only inference (catches paths not in comprehensive defaults)
    if (!metadata) {
      const allCategories = [
        ...Object.keys(getCategoryToBaseUnitMap()),
        ...Object.keys(preferences.categories || {})
      ]
      const inferredCategory = this.inferCategoryFromPath(pathStr, allCategories)
      if (inferredCategory) {
        const baseUnit = getBaseUnitForCategory(inferredCategory)
        if (baseUnit) {
          this.app.debug(
            `Path-only inference: ${pathStr} → category "${inferredCategory}" → base unit "${baseUnit}"`
          )
          const builtInDef = this.getConversionsForBaseUnit(baseUnit, dateFormatsData)
          const customDef = unitDefinitions[baseUnit]

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
   * Infer metadata from SignalK metadata
   */
  private inferMetadataFromSignalK(
    _pathStr: string,
    units: string,
    categoryToBaseUnitMap: Record<string, string>,
    dateFormatsData?: any
  ): UnitMetadata | null {
    // Try to find a matching base unit and category
    const category = Object.entries(categoryToBaseUnitMap).find(
      ([, baseUnit]) => baseUnit === units
    )?.[0]

    if (!category) {
      // Unknown unit - return null so fallback can handle it
      return null
    }

    // Try to get conversions for this base unit
    const conversions = this.getConversionsForBaseUnit(units, dateFormatsData)
    if (conversions && conversions.category === category) {
      return conversions
    }

    // Found category but no conversions - return null to let fallback code handle it
    return null
  }

  /**
   * Auto-initialize SignalK metadata cache by fetching from SignalK API
   * This eliminates the need for the web app to POST metadata
   */
  async autoInitializeSignalKMetadata(): Promise<void> {
    try {
      this.app.debug('Auto-initializing SignalK metadata cache...')

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
          'Fetch API unavailable. Metadata will not be auto-initialized. Conversions will still work but may be limited until metadata is received.'
        )
        return
      }

      const fetchFn = globalFetch.bind(globalThis) as (
        input: string,
        init?: any
      ) => Promise<{ ok: boolean; statusText: string; json(): Promise<any> }>

      this.app.debug(`Fetching SignalK metadata from: ${apiUrl}`)
      const response = await fetchFn(apiUrl)

      if (!response.ok) {
        this.app.error(
          `Failed to auto-initialize metadata: ${response.statusText}. Conversions will still work but may be limited.`
        )
        return
      }

      const data = await response.json()

      // Extract metadata just like the web app does
      const metadataMap: Record<string, SignalKPathMetadata> = {}

      const extractMeta = (obj: any, prefix = ''): void => {
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
            // If this object has meta, capture it
            if (obj[key].meta) {
              metadataMap[currentPath] = {
                ...obj[key].meta,
                value: obj[key].value,
                $source: obj[key].$source || obj[key].source,
                timestamp: obj[key].timestamp
              }
            }
            extractMeta(obj[key], currentPath)
          }
        }
      }

      // Extract from self vessel
      const selfId = data.self?.replace('vessels.', '')
      if (data.vessels && selfId && data.vessels[selfId]) {
        extractMeta(data.vessels[selfId])
      }

      // Cache the metadata
      if (Object.keys(metadataMap).length > 0) {
        this.setSignalKMetadata(metadataMap)
        this.app.debug(
          `✓ Auto-initialized ${Object.keys(metadataMap).length} SignalK metadata entries`
        )
      } else {
        this.app.debug('No SignalK metadata found to cache (vessel may have no active paths yet)')
      }
    } catch (error) {
      this.app.error(
        `Error auto-initializing SignalK metadata: ${error}. Conversions will still work but may be limited.`
      )
    }
  }

  /**
   * Collect all SignalK paths by walking the server data model.
   */
  async collectSignalKPaths(): Promise<Set<string>> {
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

      // Extract paths from ALL vessels (self + AIS targets + buddy boats)
      if (data.vessels && typeof data.vessels === 'object') {
        const vesselIds = Object.keys(data.vessels)
        this.app.debug(`Found ${vesselIds.length} vessels, extracting paths from all...`)

        for (const vesselId of vesselIds) {
          const vesselData = data.vessels[vesselId]
          if (vesselData && typeof vesselData === 'object') {
            const beforeSize = pathsSet.size
            extractPathsRecursive(vesselData, '')
            const addedPaths = pathsSet.size - beforeSize
            if (addedPaths > 0) {
              this.app.debug(`Extracted ${addedPaths} paths from vessel: ${vesselId}`)
            }
          }
        }

        this.app.debug(`Total: Extracted ${pathsSet.size} unique paths from all vessels`)
      }
    } catch (error) {
      this.app.error(`Error collecting SignalK paths: ${error}`)
    }

    return pathsSet
  }

  /**
   * Extract all paths from SignalK data object
   */
  extractAllPaths(obj: any, prefix = ''): string[] {
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
   * Get all metadata
   */
  getMetadata(): UnitsMetadataStore {
    return this.metadata
  }

  /**
   * Get metadata for a specific path
   */
  getMetadataForPath(pathStr: string): UnitMetadata | null {
    return this.metadata[pathStr] || null
  }
}
