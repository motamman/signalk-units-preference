import { ServerAPI } from '@signalk/server-api'
import {
  ConversionDefinition,
  UnitMetadata,
  BaseUnitDefinition,
  PathValueType,
  ConvertValueResponse
} from './types'
import { evaluateFormula, formatNumber, formatDate } from './formulaEvaluator'

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnitConversionError'
  }
}

/**
 * ConversionEngine handles all unit conversion logic and formula evaluation.
 * Responsibilities:
 * - Core conversion logic and formula evaluation
 * - Date/time formatting
 * - Unit value conversions
 * - Find conversions by key or longName
 */
export class ConversionEngine {
  private dateFormatsData: any

  constructor(
    private app: ServerAPI,
    dateFormatsData?: any
  ) {
    this.dateFormatsData = dateFormatsData || {}
  }

  /**
   * Update date formats data (called when reloading configuration)
   */
  setDateFormatsData(dateFormatsData: any): void {
    this.dateFormatsData = dateFormatsData
  }

  /**
   * Map custom date format keys to date-fns format patterns
   * Now uses date-formats.json as single source of truth
   */
  private getDateFnsPattern(formatKey: string): string | null {
    // Try to get pattern from loaded date formats data
    if (this.dateFormatsData?.formats?.[formatKey]?.pattern) {
      return this.dateFormatsData.formats[formatKey].pattern
    }

    // Fallback to hardcoded patterns only if date formats not loaded
    const fallbackPatterns: Record<string, string> = {
      'short-date': 'MMM d, yyyy',
      'long-date': 'EEEE, MMMM d, yyyy',
      'dd/mm/yyyy': 'dd/MM/yyyy',
      'mm/dd/yyyy': 'MM/dd/yyyy',
      'mm/yyyy': 'MM/yyyy',
      'time-24hrs': 'HH:mm:ss',
      'time-am/pm': 'hh:mm:ss a',
      'short-date-24hrs': 'MMM d, yyyy HH:mm:ss',
      'short-date-am/pm': 'MMM d, yyyy hh:mm:ss a',
      'long-date-24hrs': 'EEEE, MMMM d, yyyy HH:mm:ss',
      'long-date-am/pm': 'EEEE, MMMM d, yyyy hh:mm:ss a',
      'dd/mm/yyyy-24hrs': 'dd/MM/yyyy HH:mm:ss',
      'dd/mm/yyyy-am/pm': 'dd/MM/yyyy hh:mm:ss a',
      'mm/dd/yyyy-24hrs': 'MM/dd/yyyy HH:mm:ss',
      'mm/dd/yyyy-am/pm': 'MM/dd/yyyy hh:mm:ss a'
    }

    const pattern = fallbackPatterns[formatKey]
    if (!pattern && Object.keys(this.dateFormatsData).length === 0) {
      this.app.debug(`Date formats not loaded, using fallback for: ${formatKey}`)
    }

    return pattern || null
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
    const normalizedTarget = targetUnit.endsWith('-local')
      ? targetUnit.replace(/-local$/, '')
      : targetUnit

    const formatKey = (dateFormat || normalizedTarget || '').toLowerCase()
    const useLocalTime = useLocalOverride ?? targetUnit.endsWith('-local')

    // Handle epoch-seconds special case
    if (formatKey === 'epoch-seconds') {
      const date = new Date(isoValue)
      if (isNaN(date.getTime())) {
        throw new UnitConversionError('Invalid ISO-8601 date value')
      }
      const epochSeconds = Math.floor(date.getTime() / 1000)
      return {
        convertedValue: epochSeconds,
        formatted: String(epochSeconds),
        displayFormat: 'epoch-seconds',
        useLocalTime: false,
        dateFormat: 'epoch-seconds'
      }
    }

    // Get date-fns format pattern
    const dateFnsPattern = this.getDateFnsPattern(formatKey)

    if (dateFnsPattern) {
      try {
        // Use date-fns for safe, robust date formatting
        const timezone = useLocalTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
        const formatted = formatDate(isoValue, dateFnsPattern, {
          useLocalTime,
          timezone
        })

        const displayFormat = dateFormat || formatKey || 'ISO-8601'

        return {
          convertedValue: formatted,
          formatted,
          displayFormat,
          useLocalTime,
          dateFormat: displayFormat
        }
      } catch (error) {
        throw new UnitConversionError(`Failed to format date: ${error}`)
      }
    }

    // Fallback to ISO-8601
    return {
      convertedValue: isoValue,
      formatted: isoValue,
      displayFormat: dateFormat || formatKey || 'ISO-8601',
      useLocalTime,
      dateFormat: dateFormat || formatKey || 'ISO-8601'
    }
  }

  /**
   * Find a conversion by either key (symbol) or longName.
   * Returns both the matching key and the conversion.
   */
  findConversionByKeyOrLongName(
    conversions: Record<string, ConversionDefinition>,
    targetUnit: string
  ): { key: string; conversion: ConversionDefinition } | null {
    // First try direct key match
    if (conversions[targetUnit]) {
      return { key: targetUnit, conversion: conversions[targetUnit] }
    }

    // Then try longName match (case-insensitive)
    const targetLower = targetUnit.toLowerCase()
    for (const [key, conv] of Object.entries(conversions)) {
      if (conv.longName?.toLowerCase() === targetLower) {
        return { key, conversion: conv }
      }
    }

    return null
  }

  /**
   * Find unit definition for a base unit
   */
  findUnitDefinition(
    baseUnit: string,
    unitDefinitions: Record<string, BaseUnitDefinition>,
    getConversionsForBaseUnit: (baseUnit: string) => UnitMetadata | null,
    getCategoryFromBaseUnit: (baseUnit: string) => string | null
  ): UnitMetadata | null {
    if (!baseUnit) {
      return null
    }

    // Get built-in conversions (from JSON or TypeScript fallback)
    const builtInDef = getConversionsForBaseUnit(baseUnit)

    // Merge with custom definitions if they exist
    const customDef = unitDefinitions[baseUnit]
    if (builtInDef && customDef) {
      // Merge conversions from built-in and custom (custom conversions take priority)
      return {
        baseUnit,
        category: builtInDef.category,
        conversions: {
          ...builtInDef.conversions,
          ...customDef.conversions
        }
      }
    }

    // Return built-in or custom (whichever exists)
    if (builtInDef) {
      return builtInDef
    }

    if (customDef) {
      // Custom definition without built-in - infer category
      return {
        ...customDef,
        category: getCategoryFromBaseUnit(baseUnit) || 'custom'
      }
    }

    return null
  }

  /**
   * Convert a value using a conversion formula
   */
  convertWithFormula(
    value: number,
    formula: string,
    symbol: string,
    displayFormat: string
  ): ConvertValueResponse {
    try {
      // evaluateFormula can return number or string (for duration formatting)
      const convertedValue = evaluateFormula(formula, value)

      let formatted: string
      if (typeof convertedValue === 'string') {
        // Duration formatting - already formatted
        formatted = symbol ? `${convertedValue} ${symbol}`.trim() : convertedValue
      } else {
        // Numeric conversion
        const formattedNumber = formatNumber(convertedValue, displayFormat)
        formatted = `${formattedNumber} ${symbol}`.trim()
      }

      return {
        originalValue: value,
        convertedValue: typeof convertedValue === 'number' ? convertedValue : value,
        symbol,
        formatted,
        displayFormat
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
   * Convert a unit value from base unit to target unit
   */
  convertUnitValue(
    baseUnit: string,
    targetUnit: string,
    rawValue: unknown,
    unitDefinitions: Record<string, BaseUnitDefinition>,
    getConversionsForBaseUnit: (baseUnit: string) => UnitMetadata | null,
    getCategoryFromBaseUnit: (baseUnit: string) => string | null,
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
    const definition = this.findUnitDefinition(
      baseUnit,
      unitDefinitions,
      getConversionsForBaseUnit,
      getCategoryFromBaseUnit
    )

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

    // evaluateFormula can return number or string (for duration formatting)
    const convertedValue = evaluateFormula(conversion.formula, numericValue)

    const displayFormat = options?.displayFormat || '0.0'
    const symbol = conversion.symbol || ''

    let formatted: string
    if (typeof convertedValue === 'string') {
      // Duration formatting - already formatted
      formatted = symbol ? `${convertedValue} ${symbol}`.trim() : convertedValue
    } else {
      // Numeric conversion
      const formattedNumber = formatNumber(convertedValue, displayFormat)
      formatted = symbol ? `${formattedNumber} ${symbol}`.trim() : formattedNumber
    }

    return {
      convertedValue: typeof convertedValue === 'number' ? convertedValue : numericValue,
      formatted,
      symbol,
      displayFormat,
      valueType: typeof convertedValue === 'string' ? 'string' : 'number'
    }
  }
}
