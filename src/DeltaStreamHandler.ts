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
 * @returns Function to unregister the handler
 */
export function registerDeltaStreamHandler(
  app: ServerAPI,
  unitsManager: UnitsManager,
  enabled: boolean = true
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
      processDelta(app, unitsManager, delta as any, cache)
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
  cache: ConversionCache
): void {

  if (!delta.updates || delta.updates.length === 0) {
    return
  }

  // Process each update separately to preserve timestamp and $source
  for (const update of delta.updates) {
    if (!update.values || update.values.length === 0) {
      continue
    }

    // Collect converted values for this specific update
    const convertedValues: any[] = []

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
          convertedValues.push({
            path: `${path}.unitsConverted`,
            value: convertedValue
          })
        }

      } catch (error) {
        app.debug(`Failed to convert ${path}: ${error}`)
        // Don't break the chain on conversion errors
      }
    }

    // Emit converted values as a new delta if we have any for this update
    // Preserve the original timestamp and $source from the update
    if (convertedValues.length > 0) {
      app.handleMessage(
        'signalk-units-preference',
        {
          context: delta.context || 'vessels.self',
          updates: [{
            $source: update.$source || 'units-preference.conversion',
            timestamp: update.timestamp || new Date().toISOString() as any,
            values: convertedValues
          }]
        } as any
      )
    }
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
      return convertNumericValue(unitsManager, path, value, conversion)

    case 'date':
      return convertDateValue(unitsManager, path, value, conversion)

    case 'boolean':
      return convertBooleanValue(value, conversion)

    case 'string':
      return convertStringValue(value, conversion)

    case 'object':
      return convertObjectValue(value, conversion)

    default:
      // Unknown type, return as-is with basic formatting
      return {
        value: value,
        formatted: String(value),
        symbol: '',
        displayFormat: conversion.displayFormat || 'unknown',
        baseUnit: conversion.baseUnit || '',
        targetUnit: conversion.targetUnit || '',
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
  value: any,
  conversion: any
): any | null {

  // Validate numeric input
  if (typeof value !== 'number' || !isFinite(value)) {
    return null
  }

  try {
    const result = unitsManager.convertValue(path, value)

    return {
      value: result.convertedValue,
      formatted: result.formatted,
      symbol: result.symbol || '',
      displayFormat: result.displayFormat,
      baseUnit: conversion.baseUnit || '',
      targetUnit: conversion.targetUnit || '',
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
      value: result.convertedValue,
      formatted: result.formatted,
      displayFormat: result.displayFormat,
      dateFormat: result.dateFormat,
      useLocalTime: result.useLocalTime,
      baseUnit: conversion.baseUnit || '',
      targetUnit: conversion.targetUnit || '',
      original: value
    }
  } catch (error) {
    return null
  }
}

/**
 * Convert boolean values (mostly pass-through)
 */
function convertBooleanValue(value: any, conversion: any): any | null {

  if (typeof value !== 'boolean') {
    return null
  }

  return {
    value: value,
    formatted: value ? 'true' : 'false',
    symbol: '',
    displayFormat: 'boolean',
    baseUnit: conversion.baseUnit || '',
    targetUnit: conversion.targetUnit || '',
    original: value
  }
}

/**
 * Convert string values (mostly pass-through)
 */
function convertStringValue(value: any, conversion: any): any | null {

  if (typeof value !== 'string') {
    return null
  }

  return {
    value: value,
    formatted: value,
    symbol: '',
    displayFormat: 'string',
    baseUnit: conversion.baseUnit || '',
    targetUnit: conversion.targetUnit || '',
    original: value
  }
}

/**
 * Convert object values (mostly pass-through)
 */
function convertObjectValue(value: any, conversion: any): any | null {

  if (value === null || typeof value !== 'object') {
    return null
  }

  return {
    value: value,
    formatted: JSON.stringify(value),
    symbol: '',
    displayFormat: 'json',
    baseUnit: conversion.baseUnit || '',
    targetUnit: conversion.targetUnit || '',
    original: value
  }
}
