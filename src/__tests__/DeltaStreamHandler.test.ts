/**
 * Tests for DeltaStreamHandler
 */

import { registerDeltaStreamHandler } from '../DeltaStreamHandler'

describe('DeltaStreamHandler', () => {
  let mockApp: any
  let mockUnitsManager: any
  let capturedHandler: any
  let capturedMessages: any[]

  beforeEach(() => {
    capturedMessages = []

    // Mock ServerAPI
    mockApp = {
      debug: jest.fn(),
      error: jest.fn(),
      registerDeltaInputHandler: jest.fn(handler => {
        capturedHandler = handler
      }),
      handleMessage: jest.fn((pluginId, delta) => {
        capturedMessages.push({ pluginId, delta })
      })
    }

    // Mock UnitsManager
    mockUnitsManager = {
      getConversion: jest.fn(path => {
        if (path === 'navigation.speedOverGround') {
          return {
            path: 'navigation.speedOverGround',
            baseUnit: 'm/s',
            targetUnit: 'kn',
            formula: 'value * 1.94384',
            inverseFormula: 'value / 1.94384',
            displayFormat: '0.0',
            symbol: 'kn',
            category: 'speed',
            valueType: 'number'
          }
        }
        // Pass-through conversion
        return {
          path,
          baseUnit: 'unknown',
          targetUnit: 'unknown',
          formula: 'value',
          inverseFormula: 'value',
          displayFormat: '0.0',
          symbol: '',
          category: 'none',
          valueType: 'unknown'
        }
      }),
      convertValue: jest.fn((path, value) => {
        if (path === 'navigation.speedOverGround') {
          return {
            convertedValue: value * 1.94384,
            formatted: (value * 1.94384).toFixed(1) + ' kn',
            symbol: 'kn',
            displayFormat: '0.0'
          }
        }
        return {
          convertedValue: value,
          formatted: String(value),
          symbol: '',
          displayFormat: '0.0'
        }
      }),
      setPreferencesChangeCallback: jest.fn()
    }
  })

  test('should register delta handler when enabled', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, true)

    expect(mockApp.registerDeltaInputHandler).toHaveBeenCalledTimes(1)
    expect(mockApp.debug).toHaveBeenCalledWith(
      'Delta stream handler registered for unit conversions'
    )
  })

  test('should not register delta handler when disabled', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, false)

    expect(mockApp.registerDeltaInputHandler).not.toHaveBeenCalled()
    expect(mockApp.debug).toHaveBeenCalledWith('Delta stream handler disabled by configuration')
  })

  test('should convert numeric values and emit converted delta', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, true)

    const inputDelta = {
      context: 'vessels.self',
      updates: [
        {
          $source: 'test-source',
          timestamp: '2023-01-01T00:00:00.000Z',
          values: [
            {
              path: 'navigation.speedOverGround',
              value: 5.0
            }
          ]
        }
      ]
    }

    const nextFn = jest.fn()
    capturedHandler(inputDelta, nextFn)

    // Should call next to continue chain
    expect(nextFn).toHaveBeenCalledWith(inputDelta)

    // Should have emitted converted delta
    expect(mockApp.handleMessage).toHaveBeenCalledTimes(1)
    const emittedMessage = capturedMessages[0]

    expect(emittedMessage.pluginId).toBe('signalk-units-preference')
    expect(emittedMessage.delta.context).toBe('vessels.self')
    expect(emittedMessage.delta.updates[0].$source).toBe('units-preference.conversion')
    expect(emittedMessage.delta.updates[0].values).toHaveLength(1)

    // Check converted value structure (new SignalK-compliant format)
    const convertedValue = emittedMessage.delta.updates[0].values[0]
    expect(convertedValue.path).toBe('navigation.speedOverGround.unitsConverted')
    expect(convertedValue.value.converted).toBeCloseTo(9.7192, 3)
    expect(convertedValue.value.formatted).toBe('9.7 kn')
    expect(convertedValue.value.original).toBe(5.0)

    // Check metadata array (SignalK spec)
    expect(emittedMessage.delta.updates[0].meta).toHaveLength(1)
    const metadata = emittedMessage.delta.updates[0].meta[0]
    expect(metadata.path).toBe('navigation.speedOverGround.unitsConverted')
    expect(metadata.value.units).toBe('kn')
    expect(metadata.value.displayFormat).toBeDefined()
    expect(metadata.value.originalUnits).toBe('m/s')
  })

  test('should skip pass-through conversions', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, true)

    const inputDelta = {
      context: 'vessels.self',
      updates: [
        {
          values: [
            {
              path: 'some.unknown.path',
              value: 42
            }
          ]
        }
      ]
    }

    const nextFn = jest.fn()
    capturedHandler(inputDelta, nextFn)

    // Should call next
    expect(nextFn).toHaveBeenCalled()

    // Should NOT emit any converted delta (pass-through)
    expect(mockApp.handleMessage).not.toHaveBeenCalled()
  })

  test('should skip already converted paths to avoid recursion', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, true)

    const inputDelta = {
      context: 'vessels.self',
      updates: [
        {
          values: [
            {
              path: 'navigation.speedOverGround.unitsConverted',
              value: { formatted: '10.0 kn' }
            }
          ]
        }
      ]
    }

    const nextFn = jest.fn()
    capturedHandler(inputDelta, nextFn)

    expect(nextFn).toHaveBeenCalled()
    expect(mockApp.handleMessage).not.toHaveBeenCalled()
  })

  test('should cache conversion metadata', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, true)

    const inputDelta = {
      context: 'vessels.self',
      updates: [
        {
          values: [{ path: 'navigation.speedOverGround', value: 5.0 }]
        }
      ]
    }

    const nextFn = jest.fn()

    // First call
    capturedHandler(inputDelta, nextFn)
    expect(mockUnitsManager.getConversion).toHaveBeenCalledTimes(1)

    // Second call - should use cache
    capturedHandler(inputDelta, nextFn)
    expect(mockUnitsManager.getConversion).toHaveBeenCalledTimes(1) // Still 1, not 2
  })

  test('should register cache clear callback', () => {
    registerDeltaStreamHandler(mockApp, mockUnitsManager, true)

    expect(mockUnitsManager.setPreferencesChangeCallback).toHaveBeenCalledTimes(1)
    expect(mockUnitsManager.setPreferencesChangeCallback).toHaveBeenCalledWith(expect.any(Function))
  })
})
