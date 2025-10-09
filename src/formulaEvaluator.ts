/**
 * Safe formula evaluator for unit conversions using mathjs
 * Provides secure mathematical expression evaluation without code injection risks
 */

import { create, all, MathJsStatic } from 'mathjs'

// Create a mathjs instance with all functions
const math: MathJsStatic = create(all) as MathJsStatic

export function evaluateFormula(formula: string, value: number): number | string {
  // Validate input value
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new Error(`Invalid input value: ${value}`)
  }

  try {
    // Check for special duration formatting functions
    if (formula.startsWith('formatDuration')) {
      if (formula === 'formatDurationDHMS(value)') {
        return formatDurationDHMS(value)
      } else if (formula === 'formatDurationHMS(value)') {
        return formatDurationHMS(value)
      } else if (formula === 'formatDurationHMSMillis(value)') {
        return formatDurationHMSMillis(value)
      } else if (formula === 'formatDurationMS(value)') {
        return formatDurationMS(value)
      } else if (formula === 'formatDurationMSMillis(value)') {
        return formatDurationMSMillis(value)
      } else if (formula === 'formatDurationVerbose(value)') {
        return formatDurationVerbose(value)
      } else if (formula === 'formatDurationCompact(value)') {
        return formatDurationCompact(value)
      }
      throw new Error(`Unknown duration format function: ${formula}`)
    }

    // Use mathjs to safely evaluate numeric formulas
    // mathjs provides a sandboxed environment without access to JavaScript runtime
    const result = math.evaluate(formula, { value })

    // Ensure result is a valid number
    if (typeof result !== 'number') {
      throw new Error(`Formula must return a number, got ${typeof result}`)
    }

    if (!isFinite(result)) {
      throw new Error(`Formula produced invalid result: ${result}`)
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to evaluate formula "${formula}": ${errorMessage}`)
  }
}

/**
 * Format a number according to display format
 * Format examples: "0", "0.0", "0.00"
 */
export function formatNumber(value: number, format: string): string {
  const decimalPlaces = format.includes('.') ? format.split('.')[1].length : 0

  return value.toFixed(decimalPlaces)
}

/**
 * Date formatting utilities using date-fns
 */
import {
  format as dateFnsFormat,
  parseISO,
  formatDuration as dateFnsFormatDuration,
  intervalToDuration
} from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const pad2 = (value: number): string => value.toString().padStart(2, '0')
const pad3 = (value: number): string => value.toString().padStart(3, '0')

export interface DateFormatOptions {
  useLocalTime?: boolean
  timezone?: string
}

/**
 * Parse and format an ISO 8601 date string
 */
export function formatDate(
  isoString: string,
  formatPattern: string,
  options: DateFormatOptions = {}
): string {
  try {
    // Parse the ISO string
    const date = parseISO(isoString)

    if (isNaN(date.getTime())) {
      throw new Error('Invalid ISO-8601 date string')
    }

    // Convert to local timezone if requested
    const dateToFormat =
      options.useLocalTime && options.timezone ? toZonedTime(date, options.timezone) : date

    // Format using date-fns
    return dateFnsFormat(dateToFormat, formatPattern)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to format date "${isoString}": ${errorMessage}`)
  }
}

/**
 * Convert epoch seconds to formatted date
 */
export function formatEpochDate(
  epochSeconds: number,
  formatPattern: string,
  options: DateFormatOptions = {}
): string {
  if (typeof epochSeconds !== 'number' || !isFinite(epochSeconds)) {
    throw new Error(`Invalid epoch value: ${epochSeconds}`)
  }

  // Convert epoch seconds to milliseconds
  const date = new Date(epochSeconds * 1000)

  if (isNaN(date.getTime())) {
    throw new Error('Invalid epoch timestamp')
  }

  // Convert to ISO string and format
  return formatDate(date.toISOString(), formatPattern, options)
}

/**
 * Get timezone-aware date parts for custom formatting
 */
export function getDateParts(isoString: string, useLocalTime: boolean = false, timezone?: string) {
  const date = parseISO(isoString)

  if (isNaN(date.getTime())) {
    throw new Error('Invalid ISO-8601 date string')
  }

  const dateToUse = useLocalTime && timezone ? toZonedTime(date, timezone) : date

  return {
    year: useLocalTime ? dateToUse.getFullYear() : dateToUse.getUTCFullYear(),
    month: useLocalTime ? dateToUse.getMonth() : dateToUse.getUTCMonth(),
    day: useLocalTime ? dateToUse.getDate() : dateToUse.getUTCDate(),
    hours: useLocalTime ? dateToUse.getHours() : dateToUse.getUTCHours(),
    minutes: useLocalTime ? dateToUse.getMinutes() : dateToUse.getUTCMinutes(),
    seconds: useLocalTime ? dateToUse.getSeconds() : dateToUse.getUTCSeconds(),
    weekday: useLocalTime ? dateToUse.getDay() : dateToUse.getUTCDay()
  }
}

/**
 * Duration formatting utilities using date-fns
 */

/**
 * Format seconds as DD:HH:MM:SS
 */
export function formatDurationDHMS(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return `${pad2(days)}:${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * Format seconds as HH:MM:SS
 */
export function formatDurationHMS(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * Format seconds as HH:MM:SS.mmm (with milliseconds)
 */
export function formatDurationHMSMillis(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.round((totalSeconds % 1) * 1000)

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`
}

/**
 * Format seconds as MM:SS
 */
export function formatDurationMS(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return `${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * Format seconds as MM:SS.mmm (with milliseconds)
 */
export function formatDurationMSMillis(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.round((totalSeconds % 1) * 1000)

  return `${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`
}

/**
 * Format seconds as verbose duration using date-fns (e.g., "2 days 3 hours 15 minutes")
 */
export function formatDurationVerbose(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  // Convert seconds to duration object
  const duration = intervalToDuration({ start: 0, end: totalSeconds * 1000 })

  // Format with date-fns
  return dateFnsFormatDuration(duration, {
    format: ['days', 'hours', 'minutes', 'seconds'],
    delimiter: ' '
  })
}

/**
 * Format seconds as compact duration (e.g., "2d 3h" or "15m 45s")
 */
export function formatDurationCompact(totalSeconds: number): string {
  if (typeof totalSeconds !== 'number' || !isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(`Invalid duration value: ${totalSeconds}`)
  }

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}
