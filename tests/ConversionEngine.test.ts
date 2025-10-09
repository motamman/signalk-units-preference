import { ConversionEngine } from '../src/ConversionEngine'
import { BaseUnitDefinition, UnitMetadata } from '../src/types'

// Mock ServerAPI
const mockApp = {
  debug: jest.fn(),
  error: jest.fn(),
  setPluginStatus: jest.fn(),
  setPluginError: jest.fn()
} as any

describe('ConversionEngine', () => {
  let engine: ConversionEngine
  let mockUnitDefinitions: Record<string, BaseUnitDefinition>
  let mockGetConversionsForBaseUnit: jest.Mock
  let mockGetCategoryFromBaseUnit: jest.Mock

  beforeEach(() => {
    engine = new ConversionEngine(mockApp)
    mockUnitDefinitions = {}
    mockGetConversionsForBaseUnit = jest.fn()
    mockGetCategoryFromBaseUnit = jest.fn()
  })

  describe('findConversionByKeyOrLongName', () => {
    test('should find conversion by exact key match', () => {
      const conversions = {
        knots: {
          formula: 'value * 1.94384',
          inverseFormula: 'value * 0.514444',
          symbol: 'kn'
        },
        'km/h': {
          formula: 'value * 3.6',
          inverseFormula: 'value / 3.6',
          symbol: 'km/h'
        }
      }

      const result = engine.findConversionByKeyOrLongName(conversions, 'knots')
      expect(result).toBeTruthy()
      expect(result?.key).toBe('knots')
      expect(result?.conversion.symbol).toBe('kn')
    })

    test('should find conversion by longName (case-insensitive)', () => {
      const conversions = {
        kts: {
          formula: 'value * 1.94384',
          inverseFormula: 'value * 0.514444',
          symbol: 'kn',
          longName: 'Knots'
        }
      }

      const result = engine.findConversionByKeyOrLongName(conversions, 'knots')
      expect(result).toBeTruthy()
      expect(result?.key).toBe('kts')
      expect(result?.conversion.longName).toBe('Knots')
    })

    test('should return null if conversion not found', () => {
      const conversions = {
        knots: {
          formula: 'value * 1.94384',
          inverseFormula: 'value * 0.514444',
          symbol: 'kn'
        }
      }

      const result = engine.findConversionByKeyOrLongName(conversions, 'mph')
      expect(result).toBeNull()
    })
  })

  describe('findUnitDefinition', () => {
    test('should return built-in unit definition', () => {
      const builtInDef: UnitMetadata = {
        baseUnit: 'm/s',
        category: 'speed',
        conversions: {
          knots: {
            formula: 'value * 1.94384',
            inverseFormula: 'value * 0.514444',
            symbol: 'kn'
          }
        }
      }

      mockGetConversionsForBaseUnit.mockReturnValue(builtInDef)

      const result = engine.findUnitDefinition(
        'm/s',
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit
      )

      expect(result).toEqual(builtInDef)
      expect(mockGetConversionsForBaseUnit).toHaveBeenCalledWith('m/s')
    })

    test('should merge built-in and custom conversions', () => {
      const builtInDef: UnitMetadata = {
        baseUnit: 'm/s',
        category: 'speed',
        conversions: {
          knots: {
            formula: 'value * 1.94384',
            inverseFormula: 'value * 0.514444',
            symbol: 'kn'
          }
        }
      }

      const customDef: BaseUnitDefinition = {
        baseUnit: 'm/s',
        conversions: {
          'custom-speed': {
            formula: 'value * 10',
            inverseFormula: 'value / 10',
            symbol: 'cs'
          }
        }
      }

      mockGetConversionsForBaseUnit.mockReturnValue(builtInDef)
      mockUnitDefinitions['m/s'] = customDef

      const result = engine.findUnitDefinition(
        'm/s',
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit
      )

      expect(result?.conversions).toHaveProperty('knots')
      expect(result?.conversions).toHaveProperty('custom-speed')
      expect(result?.category).toBe('speed')
    })

    test('should return null for unknown base unit', () => {
      mockGetConversionsForBaseUnit.mockReturnValue(null)

      const result = engine.findUnitDefinition(
        'unknown-unit',
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit
      )

      expect(result).toBeNull()
    })

    test('should return null for empty base unit', () => {
      const result = engine.findUnitDefinition(
        '',
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit
      )

      expect(result).toBeNull()
    })
  })

  describe('convertWithFormula', () => {
    test('should convert value with simple formula', () => {
      const result = engine.convertWithFormula(
        5.14,
        'value * 1.94384',
        'kn',
        '0.0'
      )

      expect(result.convertedValue).toBeCloseTo(9.987, 2)
      expect(result.originalValue).toBe(5.14)
      expect(result.symbol).toBe('kn')
      expect(result.formatted).toMatch(/10\.0 kn/)
    })

    test('should format number according to displayFormat', () => {
      const result = engine.convertWithFormula(
        100,
        'value / 3.6',
        'm/s',
        '0.00'
      )

      expect(result.formatted).toMatch(/27\.78 m\/s/)
    })

    test('should return pass-through on formula error', () => {
      const result = engine.convertWithFormula(
        5.14,
        'invalid formula',
        'kn',
        '0.0'
      )

      expect(result.convertedValue).toBe(5.14)
      expect(result.originalValue).toBe(5.14)
      expect(mockApp.error).toHaveBeenCalled()
    })
  })

  describe('convertUnitValue', () => {
    beforeEach(() => {
      mockGetConversionsForBaseUnit.mockReturnValue({
        baseUnit: 'm/s',
        category: 'speed',
        conversions: {
          knots: {
            formula: 'value * 1.94384',
            inverseFormula: 'value * 0.514444',
            symbol: 'kn'
          },
          'km/h': {
            formula: 'value * 3.6',
            inverseFormula: 'value / 3.6',
            symbol: 'km/h'
          }
        }
      })
    })

    test('should convert numeric value', () => {
      const result = engine.convertUnitValue(
        'm/s',
        'knots',
        5.14,
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit
      )

      expect(result.convertedValue).toBeCloseTo(9.987, 2)
      expect(result.symbol).toBe('kn')
      expect(result.valueType).toBe('number')
    })

    test('should convert string numeric value', () => {
      const result = engine.convertUnitValue(
        'm/s',
        'knots',
        '5.14',
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit
      )

      expect(result.convertedValue).toBeCloseTo(9.987, 2)
    })

    test('should throw error for unknown base unit', () => {
      mockGetConversionsForBaseUnit.mockReturnValue(null)

      expect(() => {
        engine.convertUnitValue(
          'unknown-unit',
          'knots',
          5.14,
          mockUnitDefinitions,
          mockGetConversionsForBaseUnit,
          mockGetCategoryFromBaseUnit
        )
      }).toThrow('Unknown base unit')
    })

    test('should throw error for unknown target unit', () => {
      expect(() => {
        engine.convertUnitValue(
          'm/s',
          'unknown-target',
          5.14,
          mockUnitDefinitions,
          mockGetConversionsForBaseUnit,
          mockGetCategoryFromBaseUnit
        )
      }).toThrow('No conversion defined')
    })

    test('should throw error for invalid numeric string', () => {
      expect(() => {
        engine.convertUnitValue(
          'm/s',
          'knots',
          'not-a-number',
          mockUnitDefinitions,
          mockGetConversionsForBaseUnit,
          mockGetCategoryFromBaseUnit
        )
      }).toThrow('Cannot parse')
    })

    test('should apply custom displayFormat', () => {
      const result = engine.convertUnitValue(
        'm/s',
        'knots',
        5.14,
        mockUnitDefinitions,
        mockGetConversionsForBaseUnit,
        mockGetCategoryFromBaseUnit,
        { displayFormat: '0.00' }
      )

      expect(result.displayFormat).toBe('0.00')
      expect(result.formatted).toMatch(/9\.99 kn/)
    })
  })

  describe('formatDateValue', () => {
    test('should format date to epoch seconds', () => {
      const isoDate = '2025-10-08T14:30:45.000Z'
      const result = engine.formatDateValue(isoDate, 'epoch-seconds')

      expect(result.convertedValue).toBeGreaterThan(1700000000)
      expect(result.displayFormat).toBe('epoch-seconds')
      expect(result.useLocalTime).toBe(false)
    })

    test('should handle -local suffix for timezone', () => {
      const isoDate = '2025-10-08T14:30:45.000Z'
      const result = engine.formatDateValue(isoDate, 'time-24hrs-local')

      expect(result.useLocalTime).toBe(true)
    })

    test('should fallback to ISO-8601 for unknown format', () => {
      const isoDate = '2025-10-08T14:30:45.000Z'
      const result = engine.formatDateValue(isoDate, 'unknown-format')

      expect(result.formatted).toBe(isoDate)
      expect(result.displayFormat).toBe('unknown-format')
    })

    test('should throw error for invalid date', () => {
      expect(() => {
        engine.formatDateValue('invalid-date', 'epoch-seconds')
      }).toThrow()
    })
  })
})
