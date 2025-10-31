/**
 * Safe formula evaluator for unit conversions using mathjs
 * Provides secure mathematical expression evaluation without code injection risks
 */

import { create, all, MathJsStatic } from 'mathjs'
import {
  formatDuration as dateFnsFormatDuration,
  intervalToDuration
} from 'date-fns'

// Create a mathjs instance with all functions
const math: MathJsStatic = create(all) as MathJsStatic

/**
 * Safely evaluate a mathematical formula with a given value
 * @param formula - The mathematical formula to evaluate
 * @param value - The input value to substitute in the formula
 * @returns The computed result or formatted string for duration functions
 * @throws Error if the formula is invalid or evaluation fails
 */
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

// Helper functions for padding numbers
const pad2 = (value: number): string => value.toString().padStart(2, '0')
const pad3 = (value: number): string => value.toString().padStart(3, '0')

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