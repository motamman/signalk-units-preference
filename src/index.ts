import { Plugin, ServerAPI } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { UnitsManager } from './UnitsManager'
import { ConversionDeltaValue, DeltaResponse, DeltaValueEntry, PluginConfig } from './types'
import openApiSpec from './openapi.json'

const PLUGIN_ID = 'signalk-units-preference'
const PLUGIN_NAME = 'Units Preference Manager'

module.exports = (app: ServerAPI): Plugin => {
  let unitsManager: UnitsManager
  let pluginConfig: PluginConfig = {}

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description:
      'Manages unit conversions and display preferences for SignalK data paths',

    schema: () => ({
      type: 'object',
      properties: {
        debug: {
          type: 'boolean',
          title: 'Enable debug logging',
          default: false
        }
      }
    }),

    start: async (config: PluginConfig) => {
      pluginConfig = config

      try {
        const dataDir = app.getDataDirPath()
        unitsManager = new UnitsManager(app, dataDir)
        await unitsManager.initialize()

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
        const { value } = normalizeValueForConversion(rawValue, conversionInfo.valueType, options?.typeHint)

        const baseUpdate = {
          $source: conversionInfo.signalkSource,
          timestamp: conversionInfo.signalkTimestamp,
          values: [] as DeltaValueEntry[]
        }

        const envelope: DeltaResponse = {
          context: 'vessels.self',
          updates: [baseUpdate]
        }

        const resolvedType = normalized.usedType !== 'unknown'
          ? normalized.usedType
          : toSupportedValueType(conversionInfo.valueType)

        let convertedValue = normalized.value
        let formatted = ''
        let displayFormat = conversionInfo.displayFormat
        let symbol = conversionInfo.symbol || ''

        if (resolvedType === 'number') {
          if (typeof normalized.value !== 'number') {
            throw createBadRequestError('Expected numeric value for conversion', {
              received: normalized.value,
              path: pathStr
            })
          }
          const numericResult = unitsManager.convertValue(pathStr, normalized.value)
          convertedValue = numericResult.convertedValue
          formatted = numericResult.formatted
          displayFormat = numericResult.displayFormat
          symbol = numericResult.symbol || conversionInfo.symbol || ''
          baseUpdate.$source = numericResult.signalkSource || conversionInfo.signalkSource
          baseUpdate.timestamp = numericResult.signalkTimestamp || conversionInfo.signalkTimestamp
        } else if (resolvedType === 'boolean') {
          if (typeof normalized.value !== 'boolean') {
            throw createBadRequestError('Expected boolean value for conversion', {
              received: normalized.value,
              path: pathStr
            })
          }
          convertedValue = normalized.value
          formatted = normalized.value ? 'true' : 'false'
          displayFormat = 'boolean'
          symbol = ''
        } else if (resolvedType === 'date') {
          if (typeof normalized.value !== 'string') {
            throw createBadRequestError('Expected date string for conversion', {
              received: normalized.value,
              path: pathStr
            })
          }
          convertedValue = normalized.value
          formatted = normalized.value
          displayFormat = 'ISO-8601'
          symbol = ''
        } else if (resolvedType === 'string') {
          convertedValue = String(normalized.value)
          formatted = convertedValue
          displayFormat = 'string'
          symbol = symbol || ''
        } else if (resolvedType === 'object') {
          if (normalized.value === null || typeof normalized.value !== 'object') {
            throw createBadRequestError('Expected JSON object or array', {
              received: normalized.value,
              path: pathStr
            })
          }
          convertedValue = normalized.value
          formatted = JSON.stringify(normalized.value)
          displayFormat = 'json'
          symbol = ''
        } else {
          formatted = String(normalized.value)
          symbol = symbol || ''
        }

        if (!baseUpdate.$source && conversionInfo.signalkSource) {
          baseUpdate.$source = conversionInfo.signalkSource
        }
        if (!baseUpdate.timestamp && conversionInfo.signalkTimestamp) {
          baseUpdate.timestamp = conversionInfo.signalkTimestamp
        }

        const payload: ConversionDeltaValue = {
          path: pathStr,
          baseUnit: conversionInfo.baseUnit,
          targetUnit: conversionInfo.targetUnit || conversionInfo.baseUnit || 'none',
          formula: conversionInfo.formula,
          inverseFormula: conversionInfo.inverseFormula,
          displayFormat,
          symbol,
          category: conversionInfo.category,
          valueType: resolvedType,
          originalValue: normalized.value,
          convertedValue,
          formatted
        }

        if (baseUpdate.timestamp) {
          payload.signalk_timestamp = baseUpdate.timestamp
        }
        if (baseUpdate.$source) {
          payload.$source = baseUpdate.$source
        }

        baseUpdate.values.push({
          path: pathStr,
          value: payload
        })

        return envelope
      }
      // GET /plugins/signalk-units-preference/paths
      // Get all available SignalK paths from the data model
      router.get('/paths', (req: Request, res: Response) => {
        try {
          const fullModel = app.getPath('/')
          const paths: string[] = []

          function extractPaths(obj: any, prefix = ''): void {
            if (!obj || typeof obj !== 'object') return

            for (const key in obj) {
              if (key === 'meta' || key === '$source' || key === 'timestamp' || key === '_attr') {
                continue
              }

              const currentPath = prefix ? `${prefix}.${key}` : key

              if (obj[key] && typeof obj[key] === 'object') {
                if (obj[key].value !== undefined) {
                  paths.push(currentPath)
                }
                extractPaths(obj[key], currentPath)
              }
            }
          }

          extractPaths(fullModel)
          res.json({ paths: paths.sort() })
        } catch (error) {
          app.error(`Error getting paths: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

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
          res.json(conversion)
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

      app.debug('API routes registered')
    },

    getOpenApi: () => openApiSpec
  }

  return plugin
}
