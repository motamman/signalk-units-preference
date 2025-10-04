/**
 * Safe formula evaluator for unit conversions
 * Only allows basic math operations
 */

export function evaluateFormula(formula: string, value: number): number {
  // Replace 'value' with the actual number
  const expression = formula.replace(/value/g, value.toString())

  // Validate: only allow numbers, operators, parentheses, and whitespace
  const safePattern = /^[\d\s+\-*/().]+$/
  if (!safePattern.test(expression)) {
    throw new Error(`Unsafe formula: ${formula}`)
  }

  try {
    // Use Function constructor for safe evaluation (no access to scope)
    const result = new Function(`return (${expression})`)()

    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      throw new Error(`Invalid result from formula: ${formula}`)
    }

    return result
  } catch (error) {
    throw new Error(`Failed to evaluate formula "${formula}": ${error}`)
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
