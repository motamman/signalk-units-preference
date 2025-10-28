/**
 * Test for boolean base unit conversions
 * Verifies that paths with baseUnit "bool" are properly handled
 */

import { UnitsManager } from '../src/UnitsManager'
import { ServerAPI } from '@signalk/server-api'
import * as fs from 'fs'
import * as path from 'path'

describe('Boolean Unit Conversions', () => {
  let unitsManager: UnitsManager
  let mockApp: any
  let tempDir: string

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(__dirname, '../temp-test-data-boolean')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Mock ServerAPI
    mockApp = {
      debug: jest.fn(),
      error: jest.fn(),
      getMetadata: jest.fn().mockReturnValue(null),
      getSelfPath: jest.fn().mockReturnValue(undefined),
      getPath: jest.fn().mockReturnValue(null),
      config: {
        settings: {
          hostname: 'localhost',
          port: 3000,
          ssl: false
        }
      }
    }

    unitsManager = new UnitsManager(mockApp as ServerAPI, tempDir)
    await unitsManager.initialize()
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should have bool base unit defined with self-conversion', () => {
    const unitDefinitions = unitsManager.getUnitDefinitions()

    expect(unitDefinitions['bool']).toBeDefined()
    expect(unitDefinitions['bool'].conversions).toBeDefined()
    expect(unitDefinitions['bool'].conversions['bool']).toBeDefined()
    expect(unitDefinitions['bool'].conversions['bool'].formula).toBe('value')
    expect(unitDefinitions['bool'].conversions['bool'].inverseFormula).toBe('value')
  })

  it('should properly resolve metadata for boolean paths', () => {
    // Set up SignalK metadata for a boolean path
    unitsManager.setSignalKMetadata({
      'navigation.lights.state': {
        units: 'bool',
        description: 'Navigation lights state',
        value: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
      }
    })

    const metadata = unitsManager.getMetadataForPath('navigation.lights.state')

    expect(metadata).not.toBeNull()
    expect(metadata?.baseUnit).toBe('bool')
    expect(metadata?.category).toBe('boolean')
    expect(metadata?.conversions).toBeDefined()
    expect(metadata?.conversions['bool']).toBeDefined()
  })

  it('should return proper conversion info for boolean paths', () => {
    // Set up SignalK metadata for a boolean path
    unitsManager.setSignalKMetadata({
      'navigation.lights.state': {
        units: 'bool',
        description: 'Navigation lights state',
        value: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
      }
    })

    const conversion = unitsManager.getConversion('navigation.lights.state')

    expect(conversion).toBeDefined()
    expect(conversion.baseUnit).toBe('bool')
    expect(conversion.targetUnit).toBe('bool')
    expect(conversion.formula).toBe('value')
    expect(conversion.category).toBe('boolean')
    expect(conversion.valueType).toBe('boolean')
  })

  it('should convert boolean values correctly', () => {
    // Set up SignalK metadata for a boolean path
    unitsManager.setSignalKMetadata({
      'navigation.lights.state': {
        units: 'bool',
        description: 'Navigation lights state',
        value: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
      }
    })

    const resultTrue = unitsManager.convertPathValue('navigation.lights.state', true)
    expect(resultTrue.converted).toBe(true)
    expect(resultTrue.formatted).toBe('true')
    expect(resultTrue.original).toBe(true)

    const resultFalse = unitsManager.convertPathValue('navigation.lights.state', false)
    expect(resultFalse.converted).toBe(false)
    expect(resultFalse.formatted).toBe('false')
    expect(resultFalse.original).toBe(false)
  })

  it('should include boolean category in schema', () => {
    const schema = unitsManager.getUnitSchema()

    expect(schema.categories).toContain('boolean')
    expect(schema.categoryToBaseUnit['boolean']).toBe('bool')
    expect(schema.baseUnits.find(bu => bu.value === 'bool')).toBeDefined()
    expect(schema.targetUnitsByBase['bool']).toContain('bool')
  })

  it('should auto-assign bool base unit to paths with boolean values but no units metadata', () => {
    // Set up a path with a boolean value but NO units field
    unitsManager.setSignalKMetadata({
      'steering.autopilot.enabled': {
        description: 'Autopilot enabled state',
        value: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
        // Note: NO units field
      }
    })

    const metadata = unitsManager.getMetadataForPath('steering.autopilot.enabled')

    // Should auto-detect and assign bool base unit
    expect(metadata).not.toBeNull()
    expect(metadata?.baseUnit).toBe('bool')
    expect(metadata?.category).toBe('boolean')
    expect(metadata?.conversions['bool']).toBeDefined()
  })

  it('should return proper conversion info for auto-detected boolean paths', () => {
    // Set up a path with a boolean value but NO units field
    unitsManager.setSignalKMetadata({
      'steering.autopilot.enabled': {
        description: 'Autopilot enabled state',
        value: false,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
        // Note: NO units field
      }
    })

    const conversion = unitsManager.getConversion('steering.autopilot.enabled')

    expect(conversion).toBeDefined()
    expect(conversion.baseUnit).toBe('bool')
    expect(conversion.targetUnit).toBe('bool')
    expect(conversion.category).toBe('boolean')
    expect(conversion.valueType).toBe('boolean')
    expect(conversion.displayFormat).toBe('boolean')
  })

  it('should convert auto-detected boolean paths correctly', () => {
    // Set up a path with a boolean value but NO units field
    unitsManager.setSignalKMetadata({
      'steering.autopilot.enabled': {
        description: 'Autopilot enabled state',
        value: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
        // Note: NO units field
      }
    })

    const resultTrue = unitsManager.convertPathValue('steering.autopilot.enabled', true)
    expect(resultTrue.converted).toBe(true)
    expect(resultTrue.formatted).toBe('true')

    const resultFalse = unitsManager.convertPathValue('steering.autopilot.enabled', false)
    expect(resultFalse.converted).toBe(false)
    expect(resultFalse.formatted).toBe('false')
  })

  it('should show boolean paths with proper base unit in getAllPathsInfo', async () => {
    // Set up paths with boolean values but NO units field
    unitsManager.setSignalKMetadata({
      'commands.captureAnchor': {
        description: 'Capture anchor position',
        value: true,
        supportsPut: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
        // Note: NO units field
      },
      'commands.captureMooring': {
        description: 'Capture mooring position',
        value: false,
        supportsPut: true,
        $source: 'test',
        timestamp: '2025-01-01T00:00:00.000Z'
        // Note: NO units field
      }
    })

    // Mock collectSignalKPaths to return our test paths
    const collectSignalKPathsSpy = jest
      .spyOn(unitsManager.getMetadataManager(), 'collectSignalKPaths')
      .mockResolvedValue(new Set(['commands.captureAnchor', 'commands.captureMooring']))

    const pathsInfo = await unitsManager.getAllPathsInfo()

    // Find our test paths
    const captureAnchorInfo = pathsInfo.find(p => p.path === 'commands.captureAnchor')
    const captureMooringInfo = pathsInfo.find(p => p.path === 'commands.captureMooring')

    // Both should have bool base unit auto-assigned
    expect(captureAnchorInfo).toBeDefined()
    expect(captureAnchorInfo.baseUnit).toBe('bool')
    expect(captureAnchorInfo.category).toBe('boolean')
    expect(captureAnchorInfo.status).toBe('auto')
    expect(captureAnchorInfo.valueType).toBe('boolean')

    expect(captureMooringInfo).toBeDefined()
    expect(captureMooringInfo.baseUnit).toBe('bool')
    expect(captureMooringInfo.category).toBe('boolean')
    expect(captureMooringInfo.status).toBe('auto')
    expect(captureMooringInfo.valueType).toBe('boolean')

    collectSignalKPathsSpy.mockRestore()
  })
})
