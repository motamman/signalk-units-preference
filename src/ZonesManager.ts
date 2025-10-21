import { ServerAPI } from '@signalk/server-api'
import { UnitsManager } from './UnitsManager'
import { MetadataManager } from './MetadataManager'
import {
  SignalKZone,
  ZoneDefinition,
  PathZones,
  BulkZonesResponse,
  ZonesDiscoveryResponse
} from './types'

/**
 * ZonesManager
 *
 * Manages zone/notification range conversions for gauge visualizations.
 * Fetches zones from SignalK metadata and converts them to user-preferred units.
 */
export class ZonesManager {
  private app: ServerAPI
  private unitsManager: UnitsManager
  private metadataManager: MetadataManager

  // Cache for converted zones
  private zonesCache: Map<string, PathZones> | null = null
  private zonesLoadedAt: number = 0
  private cacheTTL: number // milliseconds

  constructor(
    app: ServerAPI,
    unitsManager: UnitsManager,
    metadataManager: MetadataManager,
    cacheTTLMinutes: number = 5
  ) {
    this.app = app
    this.unitsManager = unitsManager
    this.metadataManager = metadataManager
    this.cacheTTL = cacheTTLMinutes * 60 * 1000

    this.app.debug(`ZonesManager initialized with ${cacheTTLMinutes}min cache TTL`)
  }

  /**
   * Get converted zones for a single path
   */
  async getPathZones(path: string): Promise<PathZones> {
    try {
      // Check cache
      const cached = this.getCachedZones(path)
      if (cached) {
        this.app.debug(`Returning cached zones for ${path}`)
        return cached
      }

      // Get SignalK zones from metadata
      const signalKZones = this.metadataManager.getPathZones(path)

      // Get user preference for this path
      const conversion = this.unitsManager.getConversion(path)
      const baseUnit = conversion.baseUnit || null
      const targetUnit = conversion.targetUnit || baseUnit || 'unknown'
      const displayFormat = conversion.displayFormat || '0.0'

      // Convert zone bounds
      const convertedZones = this.convertZones(signalKZones, baseUnit, targetUnit)

      const result: PathZones = {
        path,
        baseUnit,
        targetUnit,
        displayFormat,
        zones: convertedZones,
        timestamp: new Date().toISOString(),
        message: convertedZones.length === 0 ? 'No zones defined for this path' : undefined
      }

      // Cache the result
      this.cachePathZones(path, result)

      return result
    } catch (error) {
      this.app.error(`Error getting zones for ${path}: ${error}`)
      // Return empty zones on error
      return {
        path,
        baseUnit: null,
        targetUnit: 'unknown',
        displayFormat: '0.0',
        zones: [],
        timestamp: new Date().toISOString(),
        message: `Error loading zones: ${error}`
      }
    }
  }

  /**
   * Get converted zones for multiple paths (bulk operation)
   */
  async getBulkZones(paths: string[]): Promise<BulkZonesResponse> {
    const zonesMap: Record<string, Omit<PathZones, 'timestamp'>> = {}

    for (const path of paths) {
      try {
        const pathZones = await this.getPathZones(path)
        // Omit timestamp from individual entries (add global timestamp instead)
        const { timestamp, ...zoneData } = pathZones
        zonesMap[path] = zoneData
      } catch (error) {
        this.app.error(`Error getting zones for ${path} in bulk query: ${error}`)
        // Include empty zones for failed paths
        zonesMap[path] = {
          path,
          baseUnit: null,
          targetUnit: 'unknown',
          displayFormat: '0.0',
          zones: [],
          message: `Error: ${error}`
        }
      }
    }

    return {
      zones: zonesMap,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Discover all paths that have zones defined
   */
  async getAllZonesPaths(): Promise<ZonesDiscoveryResponse> {
    try {
      const allPaths = await this.metadataManager.collectSignalKPaths()
      const pathsWithZones: string[] = []

      for (const path of allPaths) {
        const zones = this.metadataManager.getPathZones(path)
        if (zones.length > 0) {
          pathsWithZones.push(path)
        }
      }

      return {
        paths: pathsWithZones,
        count: pathsWithZones.length,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      this.app.error(`Error discovering paths with zones: ${error}`)
      return {
        paths: [],
        count: 0,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Convert zones from base units to target units
   */
  private convertZones(
    signalKZones: SignalKZone[],
    baseUnit: string | null,
    targetUnit: string
  ): ZoneDefinition[] {
    if (!baseUnit || baseUnit === targetUnit) {
      // No conversion needed, return as-is
      return signalKZones.map(zone => ({
        state: zone.state,
        lower: zone.lower ?? null,
        upper: zone.upper ?? null,
        message: zone.message
      }))
    }

    return signalKZones.map(zone => {
      const convertedZone: ZoneDefinition = {
        state: zone.state,
        lower: this.convertZoneBound(zone.lower, baseUnit, targetUnit),
        upper: this.convertZoneBound(zone.upper, baseUnit, targetUnit),
        message: zone.message
      }

      return convertedZone
    })
  }

  /**
   * Convert a single zone bound value
   */
  private convertZoneBound(
    value: number | null | undefined,
    baseUnit: string,
    targetUnit: string
  ): number | null {
    if (value === null || value === undefined) {
      return null
    }

    try {
      const result = this.unitsManager.convertUnitValue(baseUnit, targetUnit, value)
      return result.convertedValue
    } catch (error) {
      this.app.error(
        `Error converting zone bound ${value} from ${baseUnit} to ${targetUnit}: ${error}`
      )
      // Return unconverted value on error
      return value
    }
  }

  /**
   * Get cached zones for a path (if still fresh)
   */
  private getCachedZones(path: string): PathZones | null {
    const now = Date.now()

    // Check if cache is expired
    if (this.zonesCache && now - this.zonesLoadedAt > this.cacheTTL) {
      this.app.debug('Zones cache expired, invalidating...')
      this.zonesCache = null
      return null
    }

    if (!this.zonesCache) {
      return null
    }

    return this.zonesCache.get(path) || null
  }

  /**
   * Cache zones for a path
   */
  private cachePathZones(path: string, zones: PathZones): void {
    if (!this.zonesCache) {
      this.zonesCache = new Map()
      this.zonesLoadedAt = Date.now()
    }

    this.zonesCache.set(path, zones)
  }

  /**
   * Invalidate the zones cache (call when preferences change)
   */
  public invalidateCache(): void {
    this.app.debug('Zones cache invalidated')
    this.zonesCache = null
  }
}
