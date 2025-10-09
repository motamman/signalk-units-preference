import { evaluateFormula } from '../src/formulaEvaluator'

describe('Formula Evaluator', () => {
  describe('Basic arithmetic conversions', () => {
    test('should evaluate simple multiplication (m/s to knots)', () => {
      const result = evaluateFormula('value * 1.94384', 5.14)
      expect(result).toBeCloseTo(9.987, 2)
    })

    test('should evaluate simple division', () => {
      const result = evaluateFormula('value / 3.6', 100)
      expect(result).toBeCloseTo(27.778, 2)
    })

    test('should evaluate addition (Kelvin to Celsius)', () => {
      const result = evaluateFormula('value - 273.15', 293.15)
      expect(result).toBeCloseTo(20, 2)
    })

    test('should evaluate complex formula (Kelvin to Fahrenheit)', () => {
      const result = evaluateFormula('(value - 273.15) * 9/5 + 32', 293.15)
      expect(result).toBeCloseTo(68, 2)
    })
  })

  describe('Math functions', () => {
    test('should support pow for exponentiation', () => {
      const result = evaluateFormula('value / pow(1024, 2)', 1048576)
      expect(result).toBe(1)
    })

    test('should support sqrt', () => {
      const result = evaluateFormula('sqrt(value)', 16)
      expect(result).toBe(4)
    })

    test('should support abs', () => {
      const result = evaluateFormula('abs(value)', -10)
      expect(result).toBe(10)
    })

    test('should support round', () => {
      const result = evaluateFormula('round(value * 100) / 100', 3.14159)
      expect(result).toBeCloseTo(3.14, 2)
    })
  })

  describe('Edge cases', () => {
    test('should handle zero values', () => {
      const result = evaluateFormula('value * 1.94384', 0)
      expect(result).toBe(0)
    })

    test('should handle negative values', () => {
      const result = evaluateFormula('value - 273.15', 253.15)
      expect(result).toBeCloseTo(-20, 10)
    })

    test('should handle very small numbers', () => {
      const result = evaluateFormula('value * 1000', 0.001)
      expect(result).toBe(1)
    })

    test('should handle very large numbers', () => {
      const result = evaluateFormula('value / 1000000', 5000000)
      expect(result).toBe(5)
    })
  })

  describe('Security - should prevent code injection', () => {
    test('should not allow arbitrary code execution', () => {
      expect(() => {
        evaluateFormula('constructor.constructor("return process")()', 1)
      }).toThrow()
    })

    test('should not allow eval injection', () => {
      expect(() => {
        evaluateFormula('eval("1+1")', 1)
      }).toThrow()
    })

    test('should not allow process access', () => {
      expect(() => {
        evaluateFormula('process.exit()', 1)
      }).toThrow()
    })
  })

  describe('Error handling', () => {
    test('should throw on invalid syntax', () => {
      expect(() => {
        evaluateFormula('value * * 2', 5)
      }).toThrow()
    })

    test('should throw on division by zero resulting in Infinity', () => {
      expect(() => {
        evaluateFormula('value / 0', 10)
      }).toThrow()
    })

    test('should throw on NaN results', () => {
      expect(() => {
        evaluateFormula('value / "text"', 10)
      }).toThrow()
    })

    test('should throw on undefined variable', () => {
      expect(() => {
        evaluateFormula('undefinedVar * 2', 5)
      }).toThrow()
    })
  })

  describe('Common unit conversions', () => {
    test('should convert meters to feet', () => {
      const result = evaluateFormula('value * 3.28084', 10)
      expect(result).toBeCloseTo(32.8084, 3)
    })

    test('should convert km/h to mph', () => {
      const result = evaluateFormula('value * 0.621371', 100)
      expect(result).toBeCloseTo(62.1371, 3)
    })

    test('should convert Pa to psi', () => {
      const result = evaluateFormula('value * 0.000145038', 100000)
      expect(result).toBeCloseTo(14.5038, 3)
    })

    test('should convert radians to degrees', () => {
      const result = evaluateFormula('value * 180 / pi', Math.PI)
      expect(result).toBeCloseTo(180, 2)
    })
  })

  describe('Pass-through (identity) conversion', () => {
    test('should handle identity conversion', () => {
      const result = evaluateFormula('value', 42)
      expect(result).toBe(42)
    })

    test('should preserve decimal precision in pass-through', () => {
      const result = evaluateFormula('value', 3.14159265359)
      expect(result).toBe(3.14159265359)
    })
  })
})
