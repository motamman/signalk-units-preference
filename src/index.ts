import { Plugin, ServerAPI } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { UnitsManager } from './UnitsManager'
import {
  ConversionDeltaValue,
  ConversionResponse,
  DeltaResponse,
  DeltaValueEntry,
  PluginConfig
} from './types'
import * as path from 'path'
import * as fs from 'fs'

const PLUGIN_ID = 'signalk-units-preference'
const PLUGIN_NAME = 'Units Preference Manager'

module.exports = (app: ServerAPI): Plugin => {
  const DEFAULT_PLUGIN_SCHEMA = {
    type: 'object',
    properties: {
      debug: {
        type: 'boolean',
        title: 'Enable debug logging',
        default: false
      }
    }
  }

  let unitsManager: UnitsManager
  let openApiSpec: object = DEFAULT_PLUGIN_SCHEMA
  let pluginConfig: PluginConfig = {}

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description:
      'Manages unit conversions and display preferences for SignalK data paths',

    schema: () => openApiSpec,

    start: async (config: PluginConfig) => {
      pluginConfig = config

      try {
        const dataDir = app.getDataDirPath()
        unitsManager = new UnitsManager(app, dataDir)
        await unitsManager.initialize()

        const openApiPath = path.join(__dirname, 'openapi.json')
        if (fs.existsSync(openApiPath)) {
          const jsonData = fs.readFileSync(openApiPath, 'utf-8')
          openApiSpec = JSON.parse(jsonData)
        } else {
          app.debug(`OpenAPI spec not found at ${openApiPath}`)
          openApiSpec = DEFAULT_PLUGIN_SCHEMA
        }

        app.setPluginStatus('Running')
        app.debug('Plugin started successfully')
      } catch (error) {
        const errorMsg = `Failed to start: ${error}`
        app.setPluginError(errorMsg)
        app.error(errorMsg)
      }
    },

    stop: async () => {
      app.setPluginStatus('Stopped')
      app.debug('Plugin stopped')
    },

    registerWithRouter: (router: IRouter) => {
      type SupportedValueType = 'number' | 'boolean' | 'string' | 'date' | 'object' | 'unknown'

      const toSupportedValueType = (value?: string): SupportedValueType => {
        switch (value) {
          case 'number':
          case 'boolean':
          case 'string':
          case 'date':
          case 'object':
            return value
          default:
            return 'unknown'
        }
      }

      const createBadRequestError = (message: string, details?: unknown) => {
        const error = new Error(message) as Error & {
          status?: number
          details?: unknown
        }
        error.status = 400
        if (details !== undefined) {
          error.details = details
        }
        return error
      }

      const normalizeValueForConversion = (
        rawValue: unknown,
        expectedType: string,
        typeHint?: SupportedValueType
      ): { value: unknown; usedType: SupportedValueType } => {
        const targetType = typeHint !== undefined && typeHint !== 'unknown' ? typeHint : toSupportedValueType(expectedType)

        if (targetType === 'number') {
          if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            return { value: rawValue, usedType: 'number' }
          }
          if (typeof rawValue === 'string' && rawValue.trim() !== '') {
            const parsed = Number(rawValue)
            if (!Number.isNaN(parsed)) {
              return { value: parsed, usedType: 'number' }
            }
          }
          throw createBadRequestError('Expected numeric value', { received: rawValue })
        }

        if (targetType === 'boolean') {
          if (typeof rawValue === 'boolean') {
            return { value: rawValue, usedType: 'boolean' }
          }
          if (typeof rawValue === 'number') {
            if (rawValue === 0 || rawValue === 1) {
              return { value: rawValue === 1, usedType: 'boolean' }
            }
          }
          if (typeof rawValue === 'string' && rawValue.trim() !== '') {
            const normalized = rawValue.trim().toLowerCase()
            if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
              return { value: true, usedType: 'boolean' }
            }
            if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
              return { value: false, usedType: 'boolean' }
            }
          }
          throw createBadRequestError('Expected boolean value', { received: rawValue })
        }

        if (targetType === 'date') {
          if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
            return { value: rawValue.toISOString(), usedType: 'date' }
          }
          if (typeof rawValue === 'string' && rawValue.trim() !== '') {
            const parsed = new Date(rawValue)
            if (!Number.isNaN(parsed.getTime())) {
              return { value: parsed.toISOString(), usedType: 'date' }
            }
          }
          throw createBadRequestError('Expected ISO-8601 date value', { received: rawValue })
        }

        if (targetType === 'string') {
          if (typeof rawValue === 'string') {
            return { value: rawValue, usedType: 'string' }
          }
          if (rawValue === null || rawValue === undefined) {
            return { value: '', usedType: 'string' }
          }
          return { value: String(rawValue), usedType: 'string' }
        }

        if (targetType === 'object') {
          if (rawValue !== null && typeof rawValue === 'object') {
            return { value: rawValue, usedType: 'object' }
          }
          if (typeof rawValue === 'string' && rawValue.trim() !== '') {
            try {
              const parsed = JSON.parse(rawValue)
              if (parsed !== null && typeof parsed === 'object') {
                return { value: parsed, usedType: 'object' }
              }
              throw createBadRequestError('Expected JSON object or array', { received: rawValue })
            } catch (err) {
              if ((err as any).status === 400) {
                throw err
              }
              throw createBadRequestError('Invalid JSON payload', { received: rawValue })
            }
          }
          throw createBadRequestError('Expected JSON object or array', { received: rawValue })
        }

        return { value: rawValue, usedType: 'unknown' }
      }

      const buildDeltaResponse = (
        pathStr: string,
        rawValue: unknown,
        options?: { typeHint?: SupportedValueType }
      ): DeltaResponse => {
        const conversionInfo = unitsManager.getConversion(pathStr)
        const normalized = normalizeValueForConversion(
          rawValue,
          conversionInfo.valueType,
          options?.typeHint
        )

        const baseUpdate: DeltaResponse['updates'][number] = {
          $source: conversionInfo.signalkSource || undefined,
          timestamp: new Date().toISOString(),
          values: [] as DeltaValueEntry[]
        }

        const envelope: DeltaResponse = {
          context: 'vessels.self',
          updates: [baseUpdate]
        }

        const resolvedType = normalized.usedType !== 'unknown'
          ? normalized.usedType
          : toSupportedValueType(conversionInfo.valueType)

        const normalizedValue = normalized.value

        let convertedValue: any = normalizedValue
        let formatted = ''
        let displayFormat = conversionInfo.displayFormat
        let symbol = conversionInfo.symbol || ''

        let typeToUse = resolvedType
        if (conversionInfo.dateFormat && typeof normalizedValue === 'string') {
          typeToUse = 'date'
        }

        switch (typeToUse) {
          case 'number': {
            if (typeof normalizedValue !== 'number') {
              throw createBadRequestError('Expected numeric value for conversion', {
                received: normalizedValue,
                path: pathStr
              })
            }
            const numericResult = unitsManager.convertValue(pathStr, normalizedValue)
            convertedValue = numericResult.convertedValue
            formatted = numericResult.formatted
            displayFormat = numericResult.displayFormat
            symbol = numericResult.symbol || conversionInfo.symbol || ''
            baseUpdate.$source =
              numericResult.signalkSource || conversionInfo.signalkSource || baseUpdate.$source
            baseUpdate.timestamp = numericResult.signalkTimestamp || baseUpdate.timestamp
            break
          }
          case 'boolean': {
            if (typeof normalizedValue !== 'boolean') {
              throw createBadRequestError('Expected boolean value for conversion', {
                received: normalizedValue,
                path: pathStr
              })
            }
            convertedValue = normalizedValue
            formatted = normalizedValue ? 'true' : 'false'
            displayFormat = 'boolean'
            symbol = ''
            break
          }
          case 'date': {
            if (typeof normalizedValue !== 'string') {
              throw createBadRequestError('Expected date value for conversion', {
                received: normalizedValue,
                path: pathStr
              })
            }
            try {
              const formattedDate = unitsManager.formatDateValue(
                normalizedValue,
                conversionInfo.targetUnit || '',
                conversionInfo.dateFormat,
                conversionInfo.useLocalTime
              )
              convertedValue = formattedDate.convertedValue
              formatted = formattedDate.formatted
              displayFormat = formattedDate.displayFormat
              symbol = conversionInfo.symbol || ''
            } catch (err) {
              if ((err as any).name === 'UnitConversionError') {
                throw createBadRequestError((err as Error).message, {
                  received: normalizedValue,
                  path: pathStr
                })
              }
              throw err
            }
            break
          }
          case 'string': {
            convertedValue = String(normalizedValue)
            formatted = convertedValue
            displayFormat = 'string'
            symbol = symbol || ''
            break
          }
          case 'object': {
            if (normalizedValue === null || typeof normalizedValue !== 'object') {
              throw createBadRequestError('Expected JSON object or array', {
                received: normalizedValue,
                path: pathStr
              })
            }
            convertedValue = normalizedValue
            formatted = JSON.stringify(normalizedValue)
            displayFormat = 'json'
            symbol = ''
            break
          }
          default: {
            formatted = String(normalizedValue)
            symbol = symbol || ''
            break
          }
        }

        if (!baseUpdate.$source) {
          baseUpdate.$source = conversionInfo.signalkSource
        }

        const payload: ConversionDeltaValue = {
          value: convertedValue,
          formatted,
          symbol,
          displayFormat,
          original: normalizedValue
        }

        baseUpdate.values.push({
          path: pathStr,
          value: payload
        })

        return envelope
      }
      // POST /plugins/signalk-units-preference/signalk-metadata
      // Receive SignalK metadata from frontend
      router.post('/signalk-metadata', async (req: Request, res: Response) => {
        try {
          const metadata = req.body
          unitsManager.setSignalKMetadata(metadata)
          res.json({ success: true })
        } catch (error) {
          app.error(`Error setting SignalK metadata: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/conversion/:path
      // Get conversion info for a specific path
      router.get('/conversion/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          app.debug(`Getting conversion for path: ${pathStr}`)

          const conversion = unitsManager.getConversion(pathStr)

          const targetUnit = conversion.targetUnit || conversion.baseUnit || 'none'

          const response = {
            [pathStr]: {
              baseUnit: conversion.baseUnit,
              category: conversion.category,
              conversions: {
                [targetUnit]: {
                  formula: conversion.formula,
                  inverseFormula: conversion.inverseFormula,
                  symbol: conversion.symbol || '',
                  dateFormat: conversion.dateFormat,
                  useLocalTime: conversion.useLocalTime
                }
              }
            }
          }

          res.json(response)
        } catch (error) {
          app.error(`Error getting conversion: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/convert/:path/:value
      // Convert a value supplied via path segment
      router.get('/convert/:path(*)/:value', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const rawValue = req.params.value
          const typeParam = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type

          app.debug(`Converting value ${rawValue} for path: ${pathStr}`)

          const result = buildDeltaResponse(pathStr, rawValue, {
            typeHint: typeof typeParam === 'string' ? toSupportedValueType(typeParam) : undefined
          })
          res.json(result)
        } catch (error) {
          if ((error as any).status === 400) {
            return res.status(400).json({
              error: (error as Error).message,
              details: (error as any).details
            })
          }
          app.error(`Error converting value: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/unit-convert
      // Convert a value using base unit and target unit directly
      router.post('/unit-convert', (req: Request, res: Response) => {
        try {
          const { baseUnit, targetUnit, value, displayFormat, useLocalTime } = req.body || {}

          if (!baseUnit || typeof baseUnit !== 'string') {
            throw createBadRequestError('baseUnit is required')
          }
          if (!targetUnit || typeof targetUnit !== 'string') {
            throw createBadRequestError('targetUnit is required')
          }
          if (value === undefined || value === null) {
            throw createBadRequestError('value is required')
          }

          const result = unitsManager.convertUnitValue(baseUnit, targetUnit, value, {
            displayFormat: typeof displayFormat === 'string' ? displayFormat : undefined,
            useLocalTime: typeof useLocalTime === 'boolean' ? useLocalTime : undefined
          })

          res.json({
            baseUnit,
            targetUnit,
            original: value,
            result
          })
        } catch (error) {
          const err = error as Error & { status?: number; details?: unknown }
          if (err.status === 400) {
            res.status(400).json({ error: err.message, details: err.details })
            return
          }
          res.status(400).json({ error: err.message })
        }
      })

      // GET /plugins/signalk-units-preference/unit-convert
      router.get('/unit-convert', (req: Request, res: Response) => {
        try {
          const baseUnitParam = Array.isArray(req.query.baseUnit) ? req.query.baseUnit[0] : req.query.baseUnit
          const targetUnitParam = Array.isArray(req.query.targetUnit) ? req.query.targetUnit[0] : req.query.targetUnit
          const valueParam = Array.isArray(req.query.value) ? req.query.value[0] : req.query.value
          const displayFormatParam = Array.isArray(req.query.displayFormat) ? req.query.displayFormat[0] : req.query.displayFormat
          const useLocalParam = Array.isArray(req.query.useLocalTime) ? req.query.useLocalTime[0] : req.query.useLocalTime

          if (!baseUnitParam || typeof baseUnitParam !== 'string') {
            throw createBadRequestError('baseUnit query parameter is required')
          }
          if (!targetUnitParam || typeof targetUnitParam !== 'string') {
            throw createBadRequestError('targetUnit query parameter is required')
          }
          if (valueParam === undefined || valueParam === null || valueParam === '') {
            throw createBadRequestError('value query parameter is required')
          }

          const useLocalTime = typeof useLocalParam === 'string'
            ? ['true', '1', 'yes', 'y', 'on'].includes(useLocalParam.toLowerCase())
            : undefined

          const result = unitsManager.convertUnitValue(baseUnitParam, targetUnitParam, valueParam, {
            displayFormat: typeof displayFormatParam === 'string' ? displayFormatParam : undefined,
            useLocalTime
          })

          res.json({
            baseUnit: baseUnitParam,
            targetUnit: targetUnitParam,
            original: valueParam,
            result
          })
        } catch (error) {
          const err = error as Error & { status?: number; details?: unknown }
          if (err.status === 400) {
            res.status(400).json({ error: err.message, details: err.details })
            return
          }
          res.status(400).json({ error: err.message })
        }
      })

      router.get('/convert/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const valueParam = Array.isArray(req.query.value) ? req.query.value[0] : req.query.value
          const typeParam = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type

          if (valueParam === undefined) {
            throw createBadRequestError('Missing value query parameter')
          }

          const result = buildDeltaResponse(pathStr, valueParam, {
            typeHint: typeof typeParam === 'string' ? toSupportedValueType(typeParam) : undefined
          })
          res.json(result)
        } catch (error) {
          if ((error as any).status === 400) {
            return res.status(400).json({
              error: (error as Error).message,
              details: (error as any).details
            })
          }
          app.error(`Error converting value via GET: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/convert
      // Convert any value type (number, boolean, string, date)
      router.post('/convert', (req: Request, res: Response) => {
        try {
          // Support both JSON and form data
          let path = req.body.path
          let value = req.body.value
          const typeHintBody = typeof req.body.type === 'string' ? toSupportedValueType(req.body.type) : undefined

          // If value is a string from form data, try to parse it as JSON
          if (typeof value === 'string' && value !== '') {
            try {
              value = JSON.parse(value)
            } catch (e) {
              // If parsing fails, keep it as string
            }
          }

          if (!path || value === undefined || value === null) {
            return res.status(400).json({
              error: 'Missing path or value',
              received: req.body
            })
          }

          app.debug(`Converting value for path: ${path}, value: ${value}`)

          const result = buildDeltaResponse(path, value, {
            typeHint: typeHintBody
          })
          return res.json(result)
        } catch (error) {
          app.error(`Error converting value: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/metadata
      // Get all metadata
      router.get('/metadata', (req: Request, res: Response) => {
        try {
          const metadata = unitsManager.getMetadata()
          res.json(metadata)
        } catch (error) {
          app.error(`Error getting metadata: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/paths
      // Return metadata definitions for all discovered SignalK paths
      router.get('/paths', async (req: Request, res: Response) => {
        try {
          const pathsMetadata = await unitsManager.getPathsMetadata()
          res.json(pathsMetadata)
        } catch (error) {
          app.error(`Error getting paths metadata: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/schema
      // Get unit schema information (base units, categories, target units)
      router.get('/schema', (req: Request, res: Response) => {
        try {
          const schema = unitsManager.getUnitSchema()
          res.json(schema)
        } catch (error) {
          app.error(`Error getting schema: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/unit-definitions
      // Get all unit definitions
      router.get('/unit-definitions', (req: Request, res: Response) => {
        try {
          const definitions = unitsManager.getUnitDefinitions()
          res.json(definitions)
        } catch (error) {
          app.error(`Error getting unit definitions: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/unit-definitions
      // Add a new base unit
      router.post('/unit-definitions', async (req: Request, res: Response) => {
        try {
          const { baseUnit, category, description, conversions } = req.body
          if (!baseUnit) {
            return res.status(400).json({ error: 'baseUnit is required' })
          }
          await unitsManager.addUnitDefinition(baseUnit, {
            baseUnit,
            category: category || description || baseUnit,
            conversions: conversions || {}
          })
          res.json({ success: true, baseUnit })
        } catch (error) {
          app.error(`Error adding unit definition: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // DELETE /plugins/signalk-units-preference/unit-definitions/:baseUnit
      // Delete a base unit
      router.delete('/unit-definitions/:baseUnit', async (req: Request, res: Response) => {
        try {
          const baseUnit = req.params.baseUnit
          await unitsManager.deleteUnitDefinition(baseUnit)
          res.json({ success: true, baseUnit })
        } catch (error) {
          app.error(`Error deleting unit definition: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/unit-definitions/:baseUnit/conversions
      // Add a conversion to a base unit
      router.post('/unit-definitions/:baseUnit/conversions', async (req: Request, res: Response) => {
        try {
          const baseUnit = req.params.baseUnit
          const { targetUnit, formula, inverseFormula, symbol } = req.body
          if (!targetUnit || !formula || !inverseFormula || !symbol) {
            return res.status(400).json({
              error: 'targetUnit, formula, inverseFormula, and symbol are required'
            })
          }
          await unitsManager.addConversionToUnit(baseUnit, targetUnit, {
            formula,
            inverseFormula,
            symbol
          })
          res.json({ success: true, baseUnit, targetUnit })
        } catch (error) {
          app.error(`Error adding conversion: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // DELETE /plugins/signalk-units-preference/unit-definitions/:baseUnit/conversions/:targetUnit
      // Delete a conversion
      router.delete('/unit-definitions/:baseUnit/conversions/:targetUnit', async (req: Request, res: Response) => {
        try {
          const { baseUnit, targetUnit } = req.params
          await unitsManager.deleteConversionFromUnit(baseUnit, targetUnit)
          res.json({ success: true, baseUnit, targetUnit })
        } catch (error) {
          app.error(`Error deleting conversion: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/current-preset
      // Get current preset information
      router.get('/current-preset', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.currentPreset || null)
        } catch (error) {
          app.error(`Error getting current preset: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/categories
      // Get all category preferences
      router.get('/categories', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.categories || {})
        } catch (error) {
          app.error(`Error getting categories: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/categories/:category
      // Get single category preference
      router.get('/categories/:category', (req: Request, res: Response) => {
        try {
          const category = req.params.category
          const preferences = unitsManager.getPreferences()
          const categoryPref = preferences.categories[category]

          if (!categoryPref) {
            return res.status(404).json({
              error: 'Category not found',
              category
            })
          }

          res.json(categoryPref)
        } catch (error) {
          app.error(`Error getting category: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/categories/:category
      // Update category preference
      router.put(
        '/categories/:category',
        async (req: Request, res: Response) => {
          try {
            const category = req.params.category
            const preference = req.body

            if (preference.targetUnit === undefined || preference.displayFormat === undefined) {
              return res.status(400).json({
                error: 'Invalid preference format',
                required: ['targetUnit', 'displayFormat']
              })
            }

            await unitsManager.updateCategoryPreference(category, preference)
            res.json({ success: true, category })
          } catch (error) {
            app.error(`Error updating category preference: ${error}`)
            res.status(500).json({ error: 'Internal server error' })
          }
        }
      )

      // DELETE /plugins/signalk-units-preference/categories/:category
      // Delete custom category preference
      router.delete(
        '/categories/:category',
        async (req: Request, res: Response) => {
          try {
            const category = req.params.category
            await unitsManager.deleteCategoryPreference(category)
            res.json({ success: true, category })
          } catch (error) {
            app.error(`Error deleting category preference: ${error}`)
            res.status(500).json({ error: 'Internal server error' })
          }
        }
      )

      // GET /plugins/signalk-units-preference/overrides
      // Get all path overrides
      router.get('/overrides', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.pathOverrides || {})
        } catch (error) {
          app.error(`Error getting overrides: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/overrides/:path
      // Get single path override
      router.get('/overrides/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const preferences = unitsManager.getPreferences()
          const pathOverride = preferences.pathOverrides[pathStr]

          if (!pathOverride) {
            return res.status(404).json({
              error: 'Path override not found',
              path: pathStr
            })
          }

          res.json(pathOverride)
        } catch (error) {
          app.error(`Error getting path override: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/overrides/:path
      // Update path-specific override
      router.put(
        '/overrides/:path(*)',
        async (req: Request, res: Response) => {
          try {
            const pathStr = req.params.path
            const preference = req.body

            if (!preference.targetUnit || !preference.displayFormat) {
              return res.status(400).json({
                error: 'Invalid preference format',
                required: ['targetUnit', 'displayFormat']
              })
            }

            await unitsManager.updatePathOverride(pathStr, preference)
            res.json({ success: true, path: pathStr })
          } catch (error) {
            app.error(`Error updating path override: ${error}`)
            res.status(500).json({ error: 'Internal server error' })
          }
        }
      )

      // DELETE /plugins/signalk-units-preference/overrides/:path
      // Delete path-specific override
      router.delete(
        '/overrides/:path(*)',
        async (req: Request, res: Response) => {
          try {
            const pathStr = req.params.path
            await unitsManager.deletePathOverride(pathStr)
            res.json({ success: true, path: pathStr })
          } catch (error) {
            app.error(`Error deleting path override: ${error}`)
            res.status(500).json({ error: 'Internal server error' })
          }
        }
      )

      // GET /plugins/signalk-units-preference/patterns
      // Get all path patterns
      router.get('/patterns', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.pathPatterns || [])
        } catch (error) {
          app.error(`Error getting patterns: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/patterns/:index
      // Get single path pattern
      router.get('/patterns/:index', (req: Request, res: Response) => {
        try {
          const index = parseInt(req.params.index)
          const preferences = unitsManager.getPreferences()
          const patterns = preferences.pathPatterns || []

          if (index < 0 || index >= patterns.length) {
            return res.status(404).json({
              error: 'Pattern not found',
              index
            })
          }

          res.json(patterns[index])
        } catch (error) {
          app.error(`Error getting pattern: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/patterns
      // Add path pattern rule
      router.post('/patterns', async (req: Request, res: Response) => {
        try {
          const pattern = req.body
          if (!pattern.pattern || !pattern.category) {
            return res.status(400).json({
              error: 'Invalid pattern format',
              required: ['pattern', 'category']
            })
          }
          await unitsManager.addPathPattern(pattern)
          res.json({ success: true })
        } catch (error) {
          app.error(`Error adding pattern: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/patterns/:index
      // Update path pattern rule
      router.put('/patterns/:index', async (req: Request, res: Response) => {
        try {
          const index = parseInt(req.params.index)
          const pattern = req.body
          await unitsManager.updatePathPattern(index, pattern)
          res.json({ success: true, index })
        } catch (error) {
          app.error(`Error updating pattern: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // DELETE /plugins/signalk-units-preference/patterns/:index
      // Delete path pattern rule
      router.delete('/patterns/:index', async (req: Request, res: Response) => {
        try {
          const index = parseInt(req.params.index)
          await unitsManager.deletePathPattern(index)
          res.json({ success: true, index })
        } catch (error) {
          app.error(`Error deleting pattern: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/presets/:presetType
      // Apply a unit system preset (metric, imperial-us, imperial-uk)
      router.post('/presets/:presetType', async (req: Request, res: Response) => {
        try {
          const presetType = req.params.presetType

          // Read preset from JSON file
          const presetPath = path.join(__dirname, '..', 'presets', `${presetType}.json`)

          if (!fs.existsSync(presetPath)) {
            return res.status(400).json({
              error: 'Invalid preset type',
              validPresets: ['metric', 'imperial-us', 'imperial-uk']
            })
          }

          const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
          const preset = presetData.categories
          const preferences = unitsManager.getPreferences()
          let updatedCount = 0

          // Update each category that exists in both the preset and current preferences
          for (const [category, settings] of Object.entries(preset)) {
            if (preferences.categories[category]) {
              // Only update targetUnit and displayFormat, keep existing baseUnit
              await unitsManager.updateCategoryPreference(category, {
                targetUnit: (settings as any).targetUnit,
                displayFormat: (settings as any).displayFormat
              })
              updatedCount++
            }
          }

          // Update current preset information
          await unitsManager.updateCurrentPreset(presetType, presetData.name, presetData.version)

          res.json({
            success: true,
            presetType,
            presetName: presetData.name,
            version: presetData.version,
            categoriesUpdated: updatedCount
          })
        } catch (error) {
          app.error(`Error applying preset: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/presets/custom/:name
      // Save current categories as a custom preset
      router.post('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name

          // Validate name format
          if (!/^[a-zA-Z0-9_-]+$/.test(presetName)) {
            return res.status(400).json({
              error: 'Invalid preset name. Only letters, numbers, dashes, and underscores are allowed.'
            })
          }

          // Prevent overwriting built-in presets
          const builtInPresets = ['metric', 'imperial-us', 'imperial-uk']
          if (builtInPresets.includes(presetName.toLowerCase())) {
            return res.status(400).json({
              error: 'Cannot overwrite built-in presets'
            })
          }

          const { name, categories } = req.body

          if (!categories) {
            return res.status(400).json({ error: 'Missing categories data' })
          }

          // Create custom presets directory if it doesn't exist
          const customPresetsDir = path.join(__dirname, '..', 'presets', 'custom')
          if (!fs.existsSync(customPresetsDir)) {
            fs.mkdirSync(customPresetsDir, { recursive: true })
          }

          // Create preset data
          const presetData = {
            version: '1.0.0',
            date: new Date().toISOString().split('T')[0],
            name: name || presetName,
            description: 'Custom user preset',
            categories
          }

          // Save to file
          const presetPath = path.join(customPresetsDir, `${presetName}.json`)
          fs.writeFileSync(presetPath, JSON.stringify(presetData, null, 2), 'utf-8')

          res.json({
            success: true,
            presetName,
            path: presetPath
          })
        } catch (error) {
          app.error(`Error saving custom preset: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/presets/custom
      // List all custom presets
      router.get('/presets/custom', async (req: Request, res: Response) => {
        try {
          const customPresetsDir = path.join(__dirname, '..', 'presets', 'custom')

          // Create directory if it doesn't exist
          if (!fs.existsSync(customPresetsDir)) {
            fs.mkdirSync(customPresetsDir, { recursive: true })
            return res.json([])
          }

          // Read all JSON files in custom directory
          const files = fs.readdirSync(customPresetsDir)
            .filter(file => file.endsWith('.json'))

          const presets = files.map(file => {
            const presetPath = path.join(customPresetsDir, file)
            const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
            return {
              id: path.basename(file, '.json'),
              name: presetData.name,
              version: presetData.version,
              date: presetData.date,
              description: presetData.description,
              categoriesCount: Object.keys(presetData.categories || {}).length
            }
          })

          res.json(presets)
        } catch (error) {
          app.error(`Error listing custom presets: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/presets/custom/:name/apply
      // Apply a custom preset
      router.post('/presets/custom/:name/apply', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name
          const presetPath = path.join(__dirname, '..', 'presets', 'custom', `${presetName}.json`)

          if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Custom preset not found' })
          }

          const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
          const preset = presetData.categories
          const preferences = unitsManager.getPreferences()
          let updatedCount = 0

          // Update each category that exists in both the preset and current preferences
          for (const [category, settings] of Object.entries(preset)) {
            if (preferences.categories[category]) {
              await unitsManager.updateCategoryPreference(category, {
                targetUnit: (settings as any).targetUnit,
                displayFormat: (settings as any).displayFormat
              })
              updatedCount++
            }
          }

          // Update current preset information
          await unitsManager.updateCurrentPreset(presetName, presetData.name, presetData.version)

          res.json({
            success: true,
            presetName,
            displayName: presetData.name,
            version: presetData.version,
            categoriesUpdated: updatedCount
          })
        } catch (error) {
          app.error(`Error applying custom preset: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // DELETE /plugins/signalk-units-preference/presets/custom/:name
      // Delete a custom preset
      router.delete('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name
          const presetPath = path.join(__dirname, '..', 'presets', 'custom', `${presetName}.json`)

          if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Custom preset not found' })
          }

          fs.unlinkSync(presetPath)

          res.json({
            success: true,
            presetName
          })
        } catch (error) {
          app.error(`Error deleting custom preset: ${error}`)
          res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      app.debug('API routes registered')
    },

    getOpenApi: () => openApiSpec
  }

  return plugin
}
