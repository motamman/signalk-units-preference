/**
 * sk-unit-converter
 * Standalone JavaScript library for SignalK unit conversions
 */

import { create, all, MathJsInstance } from 'mathjs'
import { format as dateFnsFormat, parseISO, intervalToDuration, formatDuration } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

// Create mathjs instance
const math = create(all) as MathJsInstance

/**
 * Conversion metadata structure
 */
export interface ConversionDefinition {
  formula: string
  inverseFormula?: string
  symbol: string
  displayFormat?: string
  dateFormat?: string
  useLocalTime?: boolean
  longName?: string
}

export interface UnitMetadata {
  baseUnit: string
  category: string
  conversions: Record<string, ConversionDefinition>
}

export interface ConversionResult {
  value: number | string
  formatted: string
  symbol: string
  baseUnit: string
  targetUnit: string
  formula?: string
  isDate?: boolean
  isDuration?: boolean
}

/**
 * Options for initializing the converter
 */
export interface ConverterOptions {
  metadata?: Record<string, UnitMetadata>
  serverUrl?: string
  autoConnect?: boolean
  apiPath?: string
  wsPath?: string
}

/**
 * SignalK Units Converter
 *
 * Usage:
 * ```ts
 * // Initialize from server
 * const converter = await SignalKUnitsConverter.fromServer('http://localhost:3000')
 *
 * // Simple conversion
 * const speed = converter.convert(5.14, 'm/s', 'kn')
 * // Returns: { value: 9.99, formatted: "9.99 kn", symbol: "kn", ... }
 *
 * // Path-aware conversion (uses preferences)
 * const result = converter.convertPath('navigation.speedOverGround', 5.14)
 * ```
 */
export class SignalKUnitsConverter {
  private metadata: Record<string, UnitMetadata> = {}
  private websocket: WebSocket | null = null
  private preferenceCallbacks: Array<() => void> = []

  constructor(metadata?: Record<string, UnitMetadata>) {
    if (metadata) {
      this.metadata = metadata
    }
  }

  /**
   * Load converter from SignalK server
   */
  static async fromServer(
    serverUrl?: string,
    options: { autoConnect?: boolean; apiPath?: string; wsPath?: string } = {}
  ): Promise<SignalKUnitsConverter> {
    // Default to current origin if in browser and no URL provided
    const url =
      serverUrl || (typeof window !== 'undefined' && window?.location ? window.location.origin : '')

    if (!url) {
      throw new Error('serverUrl is required when running outside of a browser context')
    }

    const apiPath = options.apiPath || '/signalk/v1/conversions'
    const response = await fetch(`${url}${apiPath}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch conversions metadata: ${response.statusText}`)
    }

    const metadata = (await response.json()) as Record<string, UnitMetadata>
    const converter = new SignalKUnitsConverter(metadata)

    if (options.autoConnect) {
      const wsPath = options.wsPath || '/signalk/v1/conversions/stream'
      await converter.watchPreferences(url, wsPath)
    }

    return converter
  }

  /**
   * Create converter with bundled metadata (offline mode)
   */
  static fromMetadata(metadata: Record<string, UnitMetadata>): SignalKUnitsConverter {
    return new SignalKUnitsConverter(metadata)
  }

  /**
   * Watch for live preference updates via WebSocket
   */
  async watchPreferences(
    serverUrl: string,
    wsPath: string = '/signalk/v1/conversions/stream'
  ): Promise<void> {
    const wsUrl = serverUrl.replace(/^http/, 'ws') + wsPath

    return new Promise((resolve, reject) => {
      this.websocket = new WebSocket(wsUrl)

      this.websocket.onopen = () => {
        console.log('Connected to SignalK conversions stream')
        resolve()
      }

      this.websocket.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if ((message.type === 'full' || message.type === 'update') && message.conversions) {
            this.metadata = message.conversions
            // Notify all callbacks
            this.preferenceCallbacks.forEach(cb => cb())
          }
        } catch (error) {
          console.error('Error parsing conversions message:', error)
        }
      }

      this.websocket.onerror = error => {
        console.error('WebSocket error:', error)
        reject(error)
      }
    })
  }

  /**
   * Subscribe to preference changes
   */
  onPreferenceChange(callback: () => void): () => void {
    this.preferenceCallbacks.push(callback)
    return () => {
      const index = this.preferenceCallbacks.indexOf(callback)
      if (index > -1) {
        this.preferenceCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Convert a value from base unit to target unit
   */
  convert(
    value: number | string | boolean,
    baseUnit: string,
    targetUnit: string
  ): ConversionResult {
    const unitMeta = this.findUnitMetadata(baseUnit)

    if (!unitMeta) {
      throw new Error(`No conversion metadata found for base unit: ${baseUnit}`)
    }

    let conversion = unitMeta.conversions[targetUnit]

    // For date/time base units, dynamically generate conversion if not found
    if (!conversion && this.isDateTimeBaseUnit(baseUnit)) {
      conversion = {
        formula: 'value',
        inverseFormula: 'value',
        symbol: '',
        dateFormat: targetUnit,
        useLocalTime: targetUnit.endsWith('-local')
      }
    }

    // For duration formats on seconds base unit, dynamically generate if not found
    if (!conversion && baseUnit === 's' && this.isDurationFormat(targetUnit)) {
      conversion = {
        formula: this.getDurationFormula(targetUnit),
        symbol: '',
        displayFormat: 'duration'
      }
    }

    if (!conversion) {
      throw new Error(`No conversion found from ${baseUnit} to ${targetUnit}`)
    }

    // Handle boolean conversions
    if (baseUnit === 'bool' || unitMeta.category === 'boolean') {
      const boolStr = value ? 'true' : 'false'
      return {
        value: boolStr,
        symbol: '',
        targetUnit,
        baseUnit,
        formula: 'boolean',
        formatted: boolStr
      }
    }

    // Handle date conversions
    if (
      conversion.dateFormat ||
      baseUnit.toLowerCase().includes('rfc 3339') ||
      baseUnit.toLowerCase().includes('iso-8601') ||
      baseUnit.toLowerCase().includes('epoch')
    ) {
      return this.convertDate(value as string | number, baseUnit, targetUnit, conversion)
    }

    // Handle numeric conversions
    if (typeof value !== 'number') {
      throw new Error(`Expected number value for ${baseUnit} → ${targetUnit}, got ${typeof value}`)
    }

    const convertedValue = this.evaluateFormula(conversion.formula, value)
    const isDuration = typeof convertedValue === 'string'
    const formatted = this.formatValue(convertedValue, conversion)

    // For durations and dates, value and formatted should be identical
    return {
      value: isDuration ? formatted : convertedValue,
      formatted,
      symbol: conversion.symbol,
      baseUnit: unitMeta.baseUnit,
      targetUnit,
      formula: conversion.formula,
      isDuration
    }
  }

  /**
   * Convert a value by SignalK path (uses stored preferences)
   */
  convertPath(path: string, value: number | string | boolean): ConversionResult | null {
    const pathMeta = this.metadata[path]

    if (!pathMeta || !pathMeta.conversions) {
      return null
    }

    // Use the first conversion (typically the preferred one)
    const targetUnit = Object.keys(pathMeta.conversions)[0]
    if (!targetUnit) {
      return null
    }

    return this.convert(value, pathMeta.baseUnit, targetUnit)
  }

  /**
   * Batch convert multiple paths
   */
  convertBatch(
    items: Array<{ path: string; value: number | string | boolean }>
  ): Array<ConversionResult | null> {
    return items.map(item => this.convertPath(item.path, item.value))
  }

  /**
   * Get all available conversions for a base unit
   */
  getConversions(baseUnit: string): Record<string, ConversionDefinition> | null {
    const unitMeta = this.findUnitMetadata(baseUnit)
    return unitMeta?.conversions || null
  }

  /**
   * Get metadata for a specific path
   */
  getPathMetadata(path: string): UnitMetadata | null {
    return this.metadata[path] || null
  }

  /**
   * Get all loaded metadata
   */
  getAllMetadata(): Record<string, UnitMetadata> {
    return this.metadata
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }
  }

  // Private helper methods

  private isDateTimeBaseUnit(baseUnit: string): boolean {
    const lower = baseUnit.toLowerCase()
    return (
      lower.includes('rfc 3339') ||
      lower.includes('iso-8601') ||
      lower.includes('epoch seconds')
    )
  }

  private isDurationFormat(targetUnit: string): boolean {
    const durationFormats = [
      'DD:HH:MM:SS',
      'HH:MM:SS',
      'HH:MM:SS.mmm',
      'MM:SS',
      'MM:SS.mmm',
      'duration-verbose',
      'duration-compact'
    ]
    return durationFormats.includes(targetUnit)
  }

  private getDurationFormula(targetUnit: string): string {
    const formulaMap: Record<string, string> = {
      'DD:HH:MM:SS': 'formatDurationDHMS(value)',
      'HH:MM:SS': 'formatDurationHMS(value)',
      'HH:MM:SS.mmm': 'formatDurationHMSMillis(value)',
      'MM:SS': 'formatDurationMS(value)',
      'MM:SS.mmm': 'formatDurationMSMillis(value)',
      'duration-verbose': 'formatDurationVerbose(value)',
      'duration-compact': 'formatDurationCompact(value)'
    }
    return formulaMap[targetUnit] || 'value'
  }

  private findUnitMetadata(baseUnit: string): UnitMetadata | null {
    // Try direct lookup first
    for (const [_key, meta] of Object.entries(this.metadata)) {
      if (meta.baseUnit === baseUnit) {
        return meta
      }
    }

    // Try path-based lookup
    return this.metadata[baseUnit] || null
  }

  private evaluateFormula(formula: string, value: number): number | string {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new Error(`Invalid input value: ${value}`)
    }

    // Handle duration formatting functions
    if (formula.startsWith('formatDuration')) {
      return this.formatDuration(formula, value)
    }

    // Use mathjs for safe evaluation
    const result = math.evaluate(formula, { value })

    if (typeof result !== 'number') {
      throw new Error(`Formula must return a number, got ${typeof result}`)
    }

    if (!isFinite(result)) {
      throw new Error(`Formula produced invalid result: ${result}`)
    }

    return result
  }

  private formatValue(value: number | string, conversion: ConversionDefinition): string {
    if (typeof value === 'string') {
      // Already formatted (duration)
      return conversion.symbol ? `${value} ${conversion.symbol}`.trim() : value
    }

    // Format number
    const displayFormat = conversion.displayFormat || '0.0'
    const decimalPlaces = displayFormat.includes('.') ? displayFormat.split('.')[1].length : 0
    const formattedNumber = value.toFixed(decimalPlaces)

    return `${formattedNumber} ${conversion.symbol}`.trim()
  }

  private convertDate(
    value: string | number,
    baseUnit: string,
    targetUnit: string,
    conversion: ConversionDefinition
  ): ConversionResult {
    const formatKey = conversion.dateFormat || targetUnit
    const useLocalTime = conversion.useLocalTime ?? targetUnit.endsWith('-local')

    // Handle epoch-seconds special case
    if (formatKey.toLowerCase() === 'epoch-seconds') {
      let date: Date
      if (baseUnit.toLowerCase().includes('epoch') || typeof value === 'number') {
        date = new Date((value as number) * 1000)
      } else {
        date = new Date(value as string)
      }

      if (isNaN(date.getTime())) {
        throw new Error('Invalid date value')
      }

      const epochSeconds = Math.floor(date.getTime() / 1000)
      const formatted = String(epochSeconds)
      return {
        value: formatted,
        formatted,
        symbol: '',
        baseUnit,
        targetUnit,
        formula: `date format: ${formatKey}`,
        isDate: true
      }
    }

    const pattern = this.getDateFnsPattern(formatKey)

    if (!pattern) {
      // Unknown format - return as-is
      return {
        value: value as string,
        formatted: String(value),
        symbol: '',
        baseUnit,
        targetUnit,
        formula: `date format: ${formatKey}`,
        isDate: true
      }
    }

    let date: Date

    // Parse input based on base unit type
    if (baseUnit.toLowerCase().includes('epoch') || typeof value === 'number') {
      date = new Date((value as number) * 1000)
    } else {
      date = parseISO(value as string)
    }

    if (isNaN(date.getTime())) {
      throw new Error('Invalid date value')
    }

    // Apply timezone conversion if needed
    const dateToFormat = useLocalTime
      ? toZonedTime(date, Intl.DateTimeFormat().resolvedOptions().timeZone)
      : date

    const formatted = dateFnsFormat(dateToFormat, pattern)

    return {
      value: formatted,
      formatted,
      symbol: '',
      baseUnit,
      targetUnit,
      formula: `date format: ${formatKey}`,
      isDate: true
    }
  }

  private getDateFnsPattern(formatKey: string): string | null {
    const patterns: Record<string, string> = {
      'short-date': 'MMM d, yyyy',
      'short-date-local': 'MMM d, yyyy',
      'long-date': 'EEEE, MMMM d, yyyy',
      'long-date-local': 'EEEE, MMMM d, yyyy',
      'dd/mm/yyyy': 'dd/MM/yyyy',
      'dd/mm/yyyy-local': 'dd/MM/yyyy',
      'mm/dd/yyyy': 'MM/dd/yyyy',
      'mm/dd/yyyy-local': 'MM/dd/yyyy',
      'mm/yyyy': 'MM/yyyy',
      'mm/yyyy-local': 'MM/yyyy',
      'time-24hrs': 'HH:mm:ss',
      'time-24hrs-local': 'HH:mm:ss',
      'time-am/pm': 'hh:mm:ss a',
      'time-am/pm-local': 'hh:mm:ss a',
      'short-date-24hrs': 'MMM d, yyyy HH:mm:ss',
      'short-date-24hrs-local': 'MMM d, yyyy HH:mm:ss',
      'short-date-am/pm': 'MMM d, yyyy hh:mm:ss a',
      'short-date-am/pm-local': 'MMM d, yyyy hh:mm:ss a',
      'long-date-24hrs': 'EEEE, MMMM d, yyyy HH:mm:ss',
      'long-date-24hrs-local': 'EEEE, MMMM d, yyyy HH:mm:ss',
      'long-date-am/pm': 'EEEE, MMMM d, yyyy hh:mm:ss a',
      'long-date-am/pm-local': 'EEEE, MMMM d, yyyy hh:mm:ss a',
      'dd/mm/yyyy-24hrs': 'dd/MM/yyyy HH:mm:ss',
      'dd/mm/yyyy-24hrs-local': 'dd/MM/yyyy HH:mm:ss',
      'dd/mm/yyyy-am/pm': 'dd/MM/yyyy hh:mm:ss a',
      'dd/mm/yyyy-am/pm-local': 'dd/MM/yyyy hh:mm:ss a',
      'mm/dd/yyyy-24hrs': 'MM/dd/yyyy HH:mm:ss',
      'mm/dd/yyyy-24hrs-local': 'MM/dd/yyyy HH:mm:ss',
      'mm/dd/yyyy-am/pm': 'MM/dd/yyyy hh:mm:ss a',
      'mm/dd/yyyy-am/pm-local': 'MM/dd/yyyy hh:mm:ss a'
    }

    return patterns[formatKey.toLowerCase()] || null
  }

  private formatDuration(formula: string, totalSeconds: number): string {
    const pad2 = (value: number) => value.toString().padStart(2, '0')
    const pad3 = (value: number) => value.toString().padStart(3, '0')

    if (formula === 'formatDurationDHMS(value)') {
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = Math.floor(totalSeconds % 60)
      return `${pad2(days)}:${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
    }

    if (formula === 'formatDurationHMS(value)') {
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = Math.floor(totalSeconds % 60)
      return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
    }

    if (formula === 'formatDurationHMSMillis(value)') {
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = Math.floor(totalSeconds % 60)
      const milliseconds = Math.round((totalSeconds % 1) * 1000)
      return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`
    }

    if (formula === 'formatDurationMS(value)') {
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = Math.floor(totalSeconds % 60)
      return `${pad2(minutes)}:${pad2(seconds)}`
    }

    if (formula === 'formatDurationMSMillis(value)') {
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = Math.floor(totalSeconds % 60)
      const milliseconds = Math.round((totalSeconds % 1) * 1000)
      return `${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`
    }

    if (formula === 'formatDurationCompact(value)') {
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = Math.floor(totalSeconds % 60)

      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${minutes}m`
      if (minutes > 0) return `${minutes}m ${seconds}s`
      return `${seconds}s`
    }

    if (formula === 'formatDurationVerbose(value)') {
      const duration = intervalToDuration({ start: 0, end: totalSeconds * 1000 })
      return formatDuration(duration, {
        format: ['days', 'hours', 'minutes', 'seconds'],
        delimiter: ' '
      })
    }

    throw new Error(`Unknown duration format function: ${formula}`)
  }
}

// Export types
export type { MathJsInstance }
