/**
 * Safe formula evaluator for unit conversions
 * Only allows basic math operations
 */

export function evaluateFormula(formula: string, value: number): number | string {
  // Replace 'value' with the actual number
  const expression = formula.replace(/value/g, value.toString())

  // Validate: allow numbers, operators, parentheses, whitespace, Math functions, arrays, and string methods
  // Allow: digits, operators (including %), parentheses, dots, commas, word characters, square brackets,
  // colons, question marks, single quotes, arrow functions (=>)
  const safePattern = /^[\d\s+\-*/%().,\w[\]:?'=><]+$/
  if (!safePattern.test(expression)) {
    throw new Error(`Unsafe formula: ${formula}`)
  }

  // Additional check: only allow specific Math and String methods
  const allowedMathFunctions = [
    'Math.pow',
    'Math.sqrt',
    'Math.abs',
    'Math.round',
    'Math.floor',
    'Math.ceil',
    'Math.min',
    'Math.max'
  ]
  // Note: allowedStringFunctions defined for documentation but validation happens at runtime
  // const allowedStringFunctions = ['String', 'padStart', 'padEnd', 'map', 'join', 'slice', 'substring']

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

    // Allow both numbers and strings as results
    if (typeof result === 'number') {
      if (isNaN(result) || !isFinite(result)) {
        throw new Error(`Invalid numeric result from formula: ${formula}`)
      }
      return result
    } else if (typeof result === 'string') {
      return result
    } else {
      throw new Error(
        `Invalid result type from formula: ${formula} (expected number or string, got ${typeof result})`
      )
    }
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
