/**
 * Safe formula evaluator for unit conversions
 * Only allows basic math operations
 */

export function evaluateFormula(formula: string, value: number): number {
  // Replace 'value' with the actual number
  const expression = formula.replace(/value/g, value.toString())

  // Validate: allow numbers, operators, parentheses, whitespace, and Math functions
  // Allow: digits, operators, parentheses, dots, commas, and word characters (for Math.pow, etc)
  const safePattern = /^[\d\s+\-*/().,\w]+$/
  if (!safePattern.test(expression)) {
    throw new Error(`Unsafe formula: ${formula}`)
  }

  // Additional check: only allow specific Math methods
  const allowedMathFunctions = ['Math.pow', 'Math.sqrt', 'Math.abs', 'Math.round', 'Math.floor', 'Math.ceil', 'Math.min', 'Math.max']
  const hasMath = /Math\.\w+/.test(expression)
  if (hasMath) {
    const mathFunctions = expression.match(/Math\.\w+/g) || []
    const invalidFunctions = mathFunctions.filter(fn => !allowedMathFunctions.includes(fn))
    if (invalidFunctions.length > 0) {
      throw new Error(`Unsafe Math functions: ${invalidFunctions.join(', ')}`)
    }
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
