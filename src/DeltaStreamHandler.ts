/**
 * Delta Stream Handler for SignalK Units Preference Plugin
 *
 * Intercepts SignalK delta messages and injects converted values
 * as parallel paths (e.g., path.unitsConverted) to preserve original SI values.
 */

import { ServerAPI } from '@signalk/server-api'
import { UnitsManager } from './UnitsManager'

interface ConversionCache {
  metadata: Map<string, any>
  clearCallback?: () => void
}

/**
 * Registers a delta input handler to inject converted values
 * into the SignalK data stream.
 *
 * @param app - SignalK server API instance
 * @param unitsManager - Units manager instance for conversions
 * @param enabled - Whether delta injection is enabled (default: true)
 * @param sendMeta - Whether to include metadata in every delta (default: true)
 * @returns Function to unregister the handler
 */
export function registerDeltaStreamHandler(
  app: ServerAPI,
  unitsManager: UnitsManager,
  enabled: boolean = true,
  sendMeta: boolean = true
): () => void {

  if (!enabled) {
    app.debug('Delta stream handler disabled by configuration')
    return () => {} // No-op unregister function
  }

  // Cache for conversion metadata (path -> ConversionResponse)
  const cache: ConversionCache = {
    metadata: new Map<string, any>()
  }

  // Clear cache function (called when preferences change)
  cache.clearCallback = () => {
    const oldSize = cache.metadata.size
    cache.metadata.clear()
    app.debug(`Conversion cache cleared (was ${oldSize} entries)`)
  }

  // Register cache clear callback with UnitsManager
  // This will be triggered whenever preferences are saved
  unitsManager.setPreferencesChangeCallback(cache.clearCallback)

  // Register the delta input handler
  app.registerDeltaInputHandler((delta, next) => {
    try {
      processDelta(app, unitsManager, delta as any, cache, sendMeta)
    } catch (error) {
      app.error(`Error in delta stream handler: ${error}`)
    }

    // Always call next to continue the handler chain
    next(delta)
  })

  app.debug('Delta stream handler registered for unit conversions')

  // Return no-op unsubscribe function (SignalK doesn't provide unsubscribe for delta handlers)
  return () => {
    app.debug('Delta stream handler cleanup (no-op)')
  }
}

/**
 * Process a single delta message and emit converted values
 */
function processDelta(
  app: ServerAPI,
  unitsManager: UnitsManager,
  delta: any,
  cache: ConversionCache,
  sendMeta: boolean
): void {

  if (!delta.updates || delta.updates.length === 0) {
    return
  }

  // Process each update separately to preserve timestamp and $source
  for (const update of delta.updates) {
    if (!update.values || update.values.length === 0) {
      continue
    }

    // Collect converted values and metadata for this specific update
    const convertedValues: any[] = []
    const metadataEntries: any[] = []

    for (const pathValue of update.values) {
      const { path, value } = pathValue

      // Skip if path or value is invalid
      if (!path || value === undefined || value === null) {
        continue
      }

      // Skip if path is already a converted path (avoid recursion)
      if (path.endsWith('.unitsConverted')) {
        continue
      }

      try {
        // Get conversion info (with caching)
        let conversion = cache.metadata.get(path)
        if (!conversion) {
          conversion = unitsManager.getConversion(path)
          cache.metadata.set(path, conversion)
        }

        // Skip pass-through conversions (no conversion needed)
        if (isPassThrough(conversion)) {
          continue
        }

        // Convert the value based on type
        const convertedValue = convertValue(unitsManager, path, value, conversion)

        if (convertedValue) {
          const convertedPath = `${path}.unitsConverted`

          convertedValues.push({
            path: convertedPath,
            value: convertedValue
          })

          // Build metadata entry if sendMeta is enabled
          if (sendMeta) {
            metadataEntries.push({
              path: convertedPath,
              value: buildMetadata(path, conversion)
            })
          }
        }

      } catch (error) {
        app.debug(`Failed to convert ${path}: ${error}`)
        // Don't break the chain on conversion errors
      }
    }

    // Emit converted values as a new delta if we have any for this update
    // Use 'units-preference.conversion' as $source to indicate this is converted data
    // Preserve the original timestamp from the update
    if (convertedValues.length > 0) {
      const deltaUpdate: any = {
        $source: 'units-preference.conversion',
        timestamp: update.timestamp || new Date().toISOString(),
        values: convertedValues
      }

      // Add metadata if we have any
      if (metadataEntries.length > 0) {
        deltaUpdate.meta = metadataEntries
      }

      app.handleMessage(
        'signalk-units-preference',
        {
          context: delta.context || 'vessels.self',
          updates: [deltaUpdate]
        } as any
      )
    }
  }
}

/**
 * Build metadata for a converted path (SignalK meta format)
 */
function buildMetadata(originalPath: string, conversion: any): any {
  return {
    units: conversion.targetUnit || conversion.symbol || '',
    displayFormat: conversion.displayFormat || '0.0',
    description: `${originalPath} (converted from ${conversion.baseUnit || 'base unit'})`,
    originalUnits: conversion.baseUnit || '',
    displayName: conversion.symbol ? `${originalPath.split('.').pop()} (${conversion.symbol})` : undefined
  }
}

/**
 * Check if a conversion is a pass-through (no actual conversion needed)
 */
function isPassThrough(conversion: any): boolean {
  // If formula is just "value", it's a pass-through
  if (conversion.formula === 'value') {
    return true
  }

  // If target unit equals base unit, it's a pass-through
  if (conversion.targetUnit && conversion.baseUnit &&
      conversion.targetUnit === conversion.baseUnit) {
    return true
  }

  return false
}

/**
 * Convert a value based on its type
 */
function convertValue(
  unitsManager: UnitsManager,
  path: string,
  value: any,
  conversion: any
): any | null {

  const valueType = conversion.valueType || 'unknown'

  switch (valueType) {
    case 'number':
      return convertNumericValue(unitsManager, path, value)

    case 'date':
      return convertDateValue(unitsManager, path, value, conversion)

    case 'boolean':
      return convertBooleanValue(value)

    case 'string':
      return convertStringValue(value)

    case 'object':
      return convertObjectValue(value)

    default:
      // Unknown type, return as-is with basic formatting
      return {
        converted: value,
        formatted: String(value),
        original: value
      }
  }
}

/**
 * Convert numeric values (speed, temperature, pressure, etc.)
 */
function convertNumericValue(
  unitsManager: UnitsManager,
  path: string,
  value: any
): any | null {

  // Validate numeric input
  if (typeof value !== 'number' || !isFinite(value)) {
    return null
  }

  try {
    const result = unitsManager.convertValue(path, value)

    return {
      converted: result.convertedValue,
      formatted: result.formatted,
      original: value
    }
  } catch (error) {
    return null
  }
}

/**
 * Convert date/time values
 */
function convertDateValue(
  unitsManager: UnitsManager,
  path: string,
  value: any,
  conversion: any
): any | null {

  // Handle numeric epoch values
  if (typeof value === 'number') {
    const normalizedBase = (conversion.baseUnit || '').toLowerCase()
    const isEpochBase = normalizedBase.includes('epoch')
    const date = new Date(value * (isEpochBase ? 1000 : 1))

    if (isNaN(date.getTime())) {
      return null
    }

    value = date.toISOString()
  }

  // Value should now be ISO string
  if (typeof value !== 'string') {
    return null
  }

  try {
    const result = unitsManager.formatDateValue(
      value,
      conversion.targetUnit || '',
      conversion.dateFormat,
      conversion.useLocalTime
    )

    return {
      converted: result.convertedValue,
      formatted: result.formatted,
      original: value
    }
  } catch (error) {
    return null
  }
}

/**
 * Convert boolean values (mostly pass-through)
 */
function convertBooleanValue(value: any): any | null {

  if (typeof value !== 'boolean') {
    return null
  }

  return {
    converted: value,
    formatted: value ? 'true' : 'false',
    original: value
  }
}

/**
 * Convert string values (mostly pass-through)
 */
function convertStringValue(value: any): any | null {

  if (typeof value !== 'string') {
    return null
  }

  return {
    converted: value,
    formatted: value,
    original: value
  }
}

/**
 * Convert object values (mostly pass-through)
 */
function convertObjectValue(value: any): any | null {

  if (value === null || typeof value !== 'object') {
    return null
  }

  return {
    converted: value,
    formatted: JSON.stringify(value),
    original: value
  }
}
