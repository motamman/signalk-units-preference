import { Plugin, ServerAPI } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { UnitsManager } from './UnitsManager'
import { ConversionDeltaValue, DeltaResponse, DeltaValueEntry } from './types'
import { ValidationError, NotFoundError, formatErrorResponse } from './errors'
import { registerDeltaStreamHandler } from './DeltaStreamHandler'
import { ConversionStreamServer } from './ConversionStreamServer'
import * as path from 'path'
import * as fs from 'fs'
import archiver from 'archiver'
import AdmZip from 'adm-zip'

const PLUGIN_ID = 'signalk-units-preference'
const PLUGIN_NAME = 'Units Preference Manager'

module.exports = (app: ServerAPI): Plugin => {
  const PLUGIN_SCHEMA = {
    type: 'object',
    properties: {
      enableDeltaInjection: {
        type: 'boolean',
        title: 'Enable Delta Stream Injection (Legacy)',
        description:
          "DEPRECATED: Inject converted values into SignalK delta stream as .unitsConverted paths. Use the plugin's dedicated WebSocket endpoint instead.",
        default: false
      },
      sendMeta: {
        type: 'boolean',
        title: 'Send Metadata with Every Delta',
        description:
          'Include metadata (units, displayFormat, description) in every delta message. Disable for optimization if metadata rarely changes.',
        default: true
      }
    }
  }

  let unitsManager: UnitsManager
  let openApiSpec: object = PLUGIN_SCHEMA
  let unsubscribeDeltaHandler: (() => void) | undefined
  let conversionStreamServer: ConversionStreamServer | undefined

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: 'Manages unit conversions and display preferences for SignalK data paths',

    schema: () => PLUGIN_SCHEMA,

    start: async (config: { enableDeltaInjection?: boolean; sendMeta?: boolean } = {}) => {
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
          openApiSpec = PLUGIN_SCHEMA
        }

        // Register delta stream handler to inject converted values into data stream
        // DEPRECATED: This approach pollutes SignalK's data tree with .unitsConverted paths
        // Use the plugin's dedicated WebSocket endpoint instead
        const enableDeltaInjection = config.enableDeltaInjection === true // Default to false
        const sendMeta = config.sendMeta !== false // Default to true
        unsubscribeDeltaHandler = registerDeltaStreamHandler(
          app,
          unitsManager,
          enableDeltaInjection,
          sendMeta
        )

        if (enableDeltaInjection) {
          app.debug(
            'LEGACY: Delta stream injection enabled - converted values will be available at .unitsConverted paths'
          )
          app.debug(
            'RECOMMENDED: Disable this and use the plugin WebSocket endpoint at /plugins/signalk-units-preference/stream'
          )
        } else {
          app.debug(
            'Delta stream injection disabled (recommended) - use plugin WebSocket endpoint for conversions'
          )
        }

        // Start dedicated conversion stream server
        conversionStreamServer = new ConversionStreamServer(app, unitsManager, sendMeta)
        const httpServer = (app as any).server
        if (httpServer) {
          conversionStreamServer.start(httpServer)
          app.debug(
            'Conversion stream server started - clients can connect to ws://host/plugins/signalk-units-preference/stream'
          )
        } else {
          app.error('Cannot start conversion stream server - app.server is not available')
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
      // Stop conversion stream server
      if (conversionStreamServer) {
        conversionStreamServer.stop()
        conversionStreamServer = undefined
        app.debug('Conversion stream server stopped')
      }

      // Unsubscribe delta handler
      if (unsubscribeDeltaHandler) {
        unsubscribeDeltaHandler()
        app.debug('Delta stream handler unregistered')
      }

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

      /**
       * @deprecated Use ValidationError directly instead
       */
      const createBadRequestError = (message: string, details?: unknown) => {
        const error = new ValidationError(message) as ValidationError & {
          details?: unknown
        }
        if (details !== undefined) {
          error.details = details
        }
        return error
      }

      /**
       * Validate filename to prevent path traversal attacks
       * Throws ValidationError if filename is invalid
       */
      const validateFilename = (filename: string, fieldName: string = 'filename'): void => {
        if (!filename || typeof filename !== 'string') {
          throw new ValidationError(
            `Invalid ${fieldName}`,
            `The ${fieldName} must be a non-empty string`,
            'Please provide a valid filename'
          )
        }

        // Prevent path traversal - no directory separators or parent directory references
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
          throw new ValidationError(
            `Invalid ${fieldName}`,
            `The ${fieldName} contains invalid characters`,
            'Only alphanumeric characters, hyphens, and underscores are allowed. Path traversal attempts are not permitted.'
          )
        }

        // Prevent very long names (filesystem limits)
        if (filename.length > 255) {
          throw new ValidationError(
            `Invalid ${fieldName}`,
            `The ${fieldName} is too long`,
            'Maximum length is 255 characters'
          )
        }

        // Minimum length check
        if (filename.length < 1) {
          throw new ValidationError(
            `Invalid ${fieldName}`,
            `The ${fieldName} is too short`,
            'Filename must be at least 1 character'
          )
        }
      }

      /**
       * Validate that a resolved path doesn't escape the allowed base directory
       * Throws ValidationError if path attempts to escape
       */
      const validatePathInDirectory = (
        resolvedPath: string,
        allowedBaseDir: string,
        description: string = 'file path'
      ): void => {
        const normalizedPath = path.normalize(resolvedPath)
        const normalizedBase = path.normalize(allowedBaseDir)

        if (!normalizedPath.startsWith(normalizedBase)) {
          throw new ValidationError(
            `Invalid ${description}`,
            `The ${description} attempts to access files outside the allowed directory`,
            'Path traversal is not permitted for security reasons'
          )
        }
      }

      const normalizeValueForConversion = (
        rawValue: unknown,
        expectedType: string,
        typeHint?: SupportedValueType
      ): { value: unknown; usedType: SupportedValueType } => {
        const targetType =
          typeHint !== undefined && typeHint !== 'unknown'
            ? typeHint
            : toSupportedValueType(expectedType)

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
        options?: { typeHint?: SupportedValueType; timestamp?: string; context?: string }
      ): DeltaResponse => {
        const conversionInfo = unitsManager.getConversion(pathStr)
        const normalized = normalizeValueForConversion(
          rawValue,
          conversionInfo.valueType,
          options?.typeHint
        )

        const baseUpdate: DeltaResponse['updates'][number] = {
          $source: conversionInfo.signalkSource || undefined,
          timestamp: options?.timestamp || new Date().toISOString(),
          values: [] as DeltaValueEntry[]
        }

        const envelope: DeltaResponse = {
          context: options?.context || 'vessels.self',
          updates: [baseUpdate]
        }

        const resolvedType =
          normalized.usedType !== 'unknown'
            ? normalized.usedType
            : toSupportedValueType(conversionInfo.valueType)

        const normalizedValue = normalized.value

        let convertedValue: any = normalizedValue
        let formatted = ''
        let displayFormat = conversionInfo.displayFormat
        let symbol = conversionInfo.symbol || ''

        const isDateCategory =
          conversionInfo.category === 'dateTime' || conversionInfo.category === 'epoch'
        let typeToUse = resolvedType
        if (conversionInfo.dateFormat || isDateCategory) {
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
            let isoValue: string
            if (typeof normalizedValue === 'string') {
              isoValue = normalizedValue
            } else if (typeof normalizedValue === 'number') {
              const normalizedBase = (conversionInfo.baseUnit || '').toLowerCase()
              const isEpochBase = normalizedBase.includes('epoch')
              const date = new Date(normalizedValue * (isEpochBase ? 1000 : 1))
              if (Number.isNaN(date.getTime())) {
                throw createBadRequestError('Expected epoch seconds number for conversion', {
                  received: normalizedValue,
                  path: pathStr
                })
              }
              isoValue = date.toISOString()
            } else {
              throw createBadRequestError('Expected date value for conversion', {
                received: normalizedValue,
                path: pathStr
              })
            }
            try {
              const formattedDate = unitsManager.formatDateValue(
                isoValue,
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
          converted: convertedValue,
          formatted,
          original: normalizedValue
        }

        baseUpdate.values.push({
          path: pathStr,
          value: payload
        })

        // Add metadata for API responses (always send for API calls)
        baseUpdate.meta = [
          {
            path: pathStr,
            value: {
              units: symbol,
              displayFormat,
              description: `${pathStr} (${conversionInfo.category || 'converted'})`,
              originalUnits: conversionInfo.baseUnit || '',
              displayName: conversionInfo.symbol
                ? `${pathStr.split('.').pop()} (${conversionInfo.symbol})`
                : undefined
            }
          }
        ]

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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/conversions/:path
      // Get conversion info for a specific path, optionally convert a value with ?value query param
      router.get('/conversions/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const valueParam = Array.isArray(req.query.value) ? req.query.value[0] : req.query.value
          const typeParam = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type
          const timestampParam = Array.isArray(req.query.timestamp)
            ? req.query.timestamp[0]
            : req.query.timestamp
          const contextParam = Array.isArray(req.query.context)
            ? req.query.context[0]
            : req.query.context

          // If value query param provided, return conversion result
          if (valueParam !== undefined) {
            app.debug(
              `Converting value ${valueParam} for path: ${pathStr} (context: ${contextParam || 'vessels.self'})`
            )
            const result = buildDeltaResponse(pathStr, valueParam, {
              typeHint: typeof typeParam === 'string' ? toSupportedValueType(typeParam) : undefined,
              timestamp: typeof timestampParam === 'string' ? timestampParam : undefined,
              context: typeof contextParam === 'string' ? contextParam : undefined
            })
            return res.json(result)
          }

          // Otherwise return conversion metadata
          app.debug(`Getting conversion metadata for path: ${pathStr}`)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/units/conversions
      // Convert a value using base unit and target unit directly
      router.post('/units/conversions', (req: Request, res: Response) => {
        try {
          const { baseUnit, targetUnit, value, displayFormat, useLocalTime } = req.body || {}

          if (!baseUnit || typeof baseUnit !== 'string') {
            throw new ValidationError(
              'baseUnit is required',
              'Missing required parameter: baseUnit',
              'Please provide a valid base unit (e.g., "m/s", "K", "Pa")'
            )
          }
          if (!targetUnit || typeof targetUnit !== 'string') {
            throw new ValidationError(
              'targetUnit is required',
              'Missing required parameter: targetUnit',
              'Please provide a valid target unit for conversion'
            )
          }
          if (value === undefined || value === null) {
            throw new ValidationError(
              'value is required',
              'Missing required parameter: value',
              'Please provide a value to convert'
            )
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
          app.error(`Error in POST /units/conversions: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/units/conversions
      router.get('/units/conversions', (req: Request, res: Response) => {
        try {
          const baseUnitParam = Array.isArray(req.query.baseUnit)
            ? req.query.baseUnit[0]
            : req.query.baseUnit
          const targetUnitParam = Array.isArray(req.query.targetUnit)
            ? req.query.targetUnit[0]
            : req.query.targetUnit
          const valueParam = Array.isArray(req.query.value) ? req.query.value[0] : req.query.value
          const displayFormatParam = Array.isArray(req.query.displayFormat)
            ? req.query.displayFormat[0]
            : req.query.displayFormat
          const useLocalParam = Array.isArray(req.query.useLocalTime)
            ? req.query.useLocalTime[0]
            : req.query.useLocalTime

          if (!baseUnitParam || typeof baseUnitParam !== 'string') {
            throw new ValidationError(
              'baseUnit query parameter is required',
              'Missing query parameter: baseUnit',
              'Add ?baseUnit=<unit> to the URL (e.g., ?baseUnit=m/s)'
            )
          }
          if (!targetUnitParam || typeof targetUnitParam !== 'string') {
            throw new ValidationError(
              'targetUnit query parameter is required',
              'Missing query parameter: targetUnit',
              'Add &targetUnit=<unit> to the URL (e.g., &targetUnit=knots)'
            )
          }
          if (valueParam === undefined || valueParam === null || valueParam === '') {
            throw new ValidationError(
              'value query parameter is required',
              'Missing query parameter: value',
              'Add &value=<number> to the URL (e.g., &value=5.2)'
            )
          }

          const useLocalTime =
            typeof useLocalParam === 'string'
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
          app.error(`Error in GET /units/conversions: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/conversions
      // Convert any value type (number, boolean, string, date)
      router.post('/conversions', (req: Request, res: Response) => {
        try {
          // Support both JSON and form data
          const path = req.body.path
          let value = req.body.value
          const typeHintBody =
            typeof req.body.type === 'string' ? toSupportedValueType(req.body.type) : undefined
          const timestampBody =
            typeof req.body.timestamp === 'string' ? req.body.timestamp : undefined
          const contextBody = typeof req.body.context === 'string' ? req.body.context : undefined

          // If value is a string from form data, try to parse it as JSON
          if (typeof value === 'string' && value !== '') {
            try {
              value = JSON.parse(value)
            } catch (e) {
              // If parsing fails, keep it as string
            }
          }

          if (!path || value === undefined || value === null) {
            throw new ValidationError(
              'Missing path or value',
              'Missing required fields: path and value',
              'Please provide both a path (e.g., "navigation.speedOverGround") and a value to convert'
            )
          }

          app.debug(
            `Converting value for path: ${path}, value: ${value} (context: ${contextBody || 'vessels.self'})`
          )

          const result = buildDeltaResponse(path, value, {
            typeHint: typeHintBody,
            timestamp: timestampBody,
            context: contextBody
          })
          return res.json(result)
        } catch (error) {
          app.error(`Error converting value: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/self
      // Return the self vessel ID
      router.get('/self', (req: Request, res: Response) => {
        try {
          res.json({
            selfId: app.selfId,
            selfContext: app.selfContext,
            selfType: app.selfType
          })
        } catch (error) {
          app.error(`Error getting self vessel ID: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/unit-definitions
      // Add a new base unit
      router.post('/unit-definitions', async (req: Request, res: Response) => {
        try {
          const { baseUnit, description, conversions } = req.body
          if (!baseUnit) {
            throw new ValidationError(
              'baseUnit is required',
              'Missing required field: baseUnit',
              'Please provide a base unit identifier (e.g., "m/s", "custom-unit")'
            )
          }
          await unitsManager.addUnitDefinition(baseUnit, {
            baseUnit,
            description: description || undefined,
            conversions: conversions || {}
          })
          res.json({ success: true, baseUnit })
        } catch (error) {
          app.error(`Error adding unit definition: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/unit-definitions/:baseUnit/conversions
      // Add a conversion to a base unit
      router.post(
        '/unit-definitions/:baseUnit/conversions',
        async (req: Request, res: Response) => {
          try {
            const baseUnit = req.params.baseUnit
            const { targetUnit, formula, inverseFormula, symbol, longName, key } = req.body
            if (!targetUnit || !formula || !inverseFormula || !symbol) {
              throw new ValidationError(
                'targetUnit, formula, inverseFormula, and symbol are required',
                'Missing required fields for conversion',
                'Please provide: targetUnit (e.g., "knots"), formula (e.g., "value * 1.94384"), inverseFormula (e.g., "value * 0.514444"), and symbol (e.g., "kn")'
              )
            }
            await unitsManager.addConversionToUnit(baseUnit, targetUnit, {
              formula,
              inverseFormula,
              symbol,
              longName: longName || undefined,
              key: key || undefined
            })
            res.json({ success: true, baseUnit, targetUnit })
          } catch (error) {
            app.error(`Error adding conversion: ${error}`)
            const response = formatErrorResponse(error)
            res.status(response.status).json(response.body)
          }
        }
      )

      // DELETE /plugins/signalk-units-preference/unit-definitions/:baseUnit/conversions/:targetUnit
      // Delete a conversion
      router.delete(
        '/unit-definitions/:baseUnit/conversions/:targetUnit',
        async (req: Request, res: Response) => {
          try {
            const { baseUnit, targetUnit } = req.params
            await unitsManager.deleteConversionFromUnit(baseUnit, targetUnit)
            res.json({ success: true, baseUnit, targetUnit })
          } catch (error) {
            app.error(`Error deleting conversion: ${error}`)
            const response = formatErrorResponse(error)
            res.status(response.status).json(response.body)
          }
        }
      )

      // GET /plugins/signalk-units-preference/presets/current
      // Get current preset information
      router.get('/presets/current', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.currentPreset || null)
        } catch (error) {
          app.error(`Error getting current preset: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/categories
      // Get all category preferences
      router.get('/categories', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          const schema = unitsManager.getUnitSchema()
          const categories = preferences.categories || {}

          // Enhance each category with category name and base unit
          const enhancedCategories: Record<string, any> = {}
          for (const [categoryName, categoryPref] of Object.entries(categories)) {
            const baseUnit =
              categoryPref.baseUnit || schema.categoryToBaseUnit[categoryName] || null
            enhancedCategories[categoryName] = {
              category: categoryName,
              baseUnit,
              ...categoryPref
            }
          }

          res.json(enhancedCategories)
        } catch (error) {
          app.error(`Error getting categories: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
            throw new NotFoundError('Category', category)
          }

          // Get base unit for this category
          const schema = unitsManager.getUnitSchema()
          const baseUnit = categoryPref.baseUnit || schema.categoryToBaseUnit[category] || null

          res.json({
            category,
            baseUnit,
            ...categoryPref
          })
        } catch (error) {
          app.error(`Error getting category: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // PUT /plugins/signalk-units-preference/categories/:category
      // Update category preference
      router.put('/categories/:category', async (req: Request, res: Response) => {
        try {
          const category = req.params.category
          const preference = req.body

          if (preference.targetUnit === undefined || preference.displayFormat === undefined) {
            throw new ValidationError(
              'Invalid preference format',
              'Missing required fields: targetUnit and displayFormat',
              'Please provide both targetUnit and displayFormat in the request body'
            )
          }

          await unitsManager.updateCategoryPreference(category, preference)
          res.json({ success: true, category })
        } catch (error) {
          app.error(`Error updating category preference: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/categories-for-base-unit
      // Get all categories that map to a given base unit (for smart category dropdowns)
      router.get('/categories-for-base-unit', (req: Request, res: Response) => {
        try {
          const baseUnit = req.query.baseUnit as string

          if (!baseUnit) {
            throw new ValidationError(
              'Missing required query parameter: baseUnit',
              'The baseUnit query parameter is required',
              'Add ?baseUnit=<unit> to the URL (e.g., ?baseUnit=m/s)'
            )
          }

          const categories = unitsManager.getCategoriesForBaseUnit(baseUnit)

          res.json({
            baseUnit,
            categories,
            count: categories.length
          })
        } catch (error) {
          app.error(`Error getting categories for base unit: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // DELETE /plugins/signalk-units-preference/categories/:category
      // Delete custom category preference
      router.delete('/categories/:category', async (req: Request, res: Response) => {
        try {
          const category = req.params.category
          await unitsManager.deleteCategoryPreference(category)
          res.json({ success: true, category })
        } catch (error) {
          app.error(`Error deleting category preference: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/overrides
      // Get all path overrides
      router.get('/overrides', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.pathOverrides || {})
        } catch (error) {
          app.error(`Error getting overrides: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
            throw new NotFoundError('Path override', pathStr)
          }

          res.json(pathOverride)
        } catch (error) {
          app.error(`Error getting path override: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // PUT /plugins/signalk-units-preference/overrides/:path
      // Update path-specific override
      router.put('/overrides/:path(*)', async (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const preference = req.body

          if (!preference.targetUnit || !preference.displayFormat) {
            throw new ValidationError(
              'Invalid preference format',
              'Missing required fields: targetUnit and displayFormat',
              'Please provide both targetUnit and displayFormat in the request body'
            )
          }

          await unitsManager.updatePathOverride(pathStr, preference)
          res.json({ success: true, path: pathStr })
        } catch (error) {
          app.error(`Error updating path override: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // DELETE /plugins/signalk-units-preference/overrides/:path
      // Delete path-specific override
      router.delete('/overrides/:path(*)', async (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          await unitsManager.deletePathOverride(pathStr)
          res.json({ success: true, path: pathStr })
        } catch (error) {
          app.error(`Error deleting path override: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/patterns
      // Get all path patterns
      router.get('/patterns', (req: Request, res: Response) => {
        try {
          const preferences = unitsManager.getPreferences()
          res.json(preferences.pathPatterns || [])
        } catch (error) {
          app.error(`Error getting patterns: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
            throw new NotFoundError('Pattern', `index ${index}`)
          }

          res.json(patterns[index])
        } catch (error) {
          app.error(`Error getting pattern: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/patterns
      // Add path pattern rule
      router.post('/patterns', async (req: Request, res: Response) => {
        try {
          const pattern = req.body
          if (!pattern.pattern || !pattern.category) {
            throw new ValidationError(
              'Invalid pattern format',
              'Missing required fields: pattern and category',
              'Please provide both pattern (e.g., "navigation.*") and category (e.g., "speed") in the request body'
            )
          }
          await unitsManager.addPathPattern(pattern)
          res.json({ success: true })
        } catch (error) {
          app.error(`Error adding pattern: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // PUT /plugins/signalk-units-preference/presets/current
      // Apply a preset (built-in or custom)
      router.put('/presets/current', async (req: Request, res: Response) => {
        try {
          const { presetType } = req.body

          if (!presetType || typeof presetType !== 'string') {
            throw new ValidationError(
              'presetType is required',
              'Missing required field: presetType',
              'Please provide a presetType (e.g., "metric", "imperial-us", "imperial-uk", or a custom preset name)'
            )
          }

          // Check if it's a custom preset first
          const customPresetPath = path.join(
            __dirname,
            '..',
            'presets',
            'custom',
            `${presetType}.json`
          )
          let presetPath: string
          let isCustom = false

          if (fs.existsSync(customPresetPath)) {
            presetPath = customPresetPath
            isCustom = true
          } else {
            // Try built-in preset
            presetPath = path.join(__dirname, '..', 'presets', `${presetType}.json`)
            if (!fs.existsSync(presetPath)) {
              throw new ValidationError(
                'Invalid preset type',
                'The preset type is not recognized',
                'Use one of: metric, imperial-us, imperial-uk, or a custom preset'
              )
            }
          }

          const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
          const preset = presetData.categories
          let updatedCount = 0

          // Update all categories from the preset (create if missing, update if exists)
          for (const [category, settings] of Object.entries(preset)) {
            const preference: any = {
              targetUnit: (settings as any).targetUnit,
              displayFormat: (settings as any).displayFormat
            }

            // Include baseUnit and category if they exist in the preset
            if ((settings as any).baseUnit) {
              preference.baseUnit = (settings as any).baseUnit
            }
            if ((settings as any).category) {
              preference.category = (settings as any).category
            }

            await unitsManager.updateCategoryPreference(category, preference)
            updatedCount++
          }

          // Update current preset information
          await unitsManager.updateCurrentPreset(presetType, presetData.name, presetData.version)

          res.json({
            success: true,
            presetType,
            presetName: presetData.name,
            version: presetData.version,
            isCustom,
            categoriesUpdated: updatedCount
          })
        } catch (error) {
          app.error(`Error applying preset: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/presets/custom/:name
      // Save current categories as a custom preset
      router.post('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name

          // Security: Validate filename to prevent path traversal
          validateFilename(presetName, 'preset name')

          // Validate name format
          if (!/^[a-zA-Z0-9_-]+$/.test(presetName)) {
            throw new ValidationError(
              'Invalid preset name',
              'Preset name contains invalid characters',
              'Only letters, numbers, dashes, and underscores are allowed'
            )
          }

          // Prevent overwriting built-in presets
          const builtInPresets = ['metric', 'imperial-us', 'imperial-uk']
          if (builtInPresets.includes(presetName.toLowerCase())) {
            throw new ValidationError(
              'Cannot overwrite built-in presets',
              'The preset name conflicts with a built-in preset',
              'Choose a different name for your custom preset'
            )
          }

          const { name, categories } = req.body

          if (!categories) {
            throw new ValidationError(
              'Missing categories data',
              'The request body must include categories',
              'Please provide the categories object in the request body'
            )
          }

          // Create custom presets directory if it doesn't exist
          const customPresetsDir = path.join(__dirname, '..', 'presets', 'custom')
          if (!fs.existsSync(customPresetsDir)) {
            fs.mkdirSync(customPresetsDir, { recursive: true })
          }

          const presetPath = path.join(customPresetsDir, `${presetName}.json`)

          // Security: Validate that resolved path doesn't escape custom directory
          validatePathInDirectory(presetPath, customPresetsDir, 'preset path')

          const computeNextVersion = (current?: unknown): string => {
            const numeric = Number(current)
            if (!Number.isNaN(numeric)) {
              return (numeric + 0.01).toFixed(2)
            }
            return '1.00'
          }

          let version = '1.00'
          let existingDescription = 'Custom user preset'
          let existingDisplayName = name || presetName

          if (fs.existsSync(presetPath)) {
            try {
              const existingPreset = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
              version = computeNextVersion(existingPreset.version)
              if (!name && typeof existingPreset.name === 'string') {
                existingDisplayName = existingPreset.name
              }
              if (existingPreset.description) {
                existingDescription = existingPreset.description
              }
            } catch (error) {
              app.error(`Failed to read existing preset for version bump: ${error}`)
              version = '1.00'
            }
          }

          const presetData = {
            version,
            date: new Date().toISOString().split('T')[0],
            name: name || existingDisplayName,
            description: existingDescription,
            categories
          }

          fs.writeFileSync(presetPath, JSON.stringify(presetData, null, 2), 'utf-8')

          const currentPreferences = unitsManager.getPreferences()
          if (currentPreferences.currentPreset?.type === presetName) {
            await unitsManager.updateCurrentPreset(presetName, presetData.name, presetData.version)
          }

          res.json({
            success: true,
            presetName,
            path: presetPath,
            version: presetData.version,
            date: presetData.date
          })
        } catch (error) {
          app.error(`Error saving custom preset: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
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
          const files = fs.readdirSync(customPresetsDir).filter(file => file.endsWith('.json'))

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
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/presets/custom/:name
      // Download a specific custom preset file
      router.get('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name

          // Security: Validate filename to prevent path traversal
          validateFilename(presetName, 'preset name')

          const customPresetsDir = path.join(__dirname, '..', 'presets', 'custom')
          const presetPath = path.join(customPresetsDir, `${presetName}.json`)

          // Security: Validate that resolved path doesn't escape custom directory
          validatePathInDirectory(presetPath, customPresetsDir, 'preset path')

          if (!fs.existsSync(presetPath)) {
            throw new NotFoundError('Custom preset', presetName)
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename=${presetName}.json`)
          res.sendFile(presetPath)
        } catch (error) {
          app.error(`Error downloading custom preset: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // PUT /plugins/signalk-units-preference/presets/custom/:name
      // Upload/update a specific custom preset file
      router.put('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name

          // Security: Validate filename to prevent path traversal
          validateFilename(presetName, 'preset name')

          const customPresetsDir = path.join(__dirname, '..', 'presets', 'custom')
          const presetPath = path.join(customPresetsDir, `${presetName}.json`)

          // Security: Validate that resolved path doesn't escape custom directory
          validatePathInDirectory(presetPath, customPresetsDir, 'preset path')

          if (!req.body) {
            throw new ValidationError(
              'No preset data provided',
              'The request body is empty',
              'Please provide the preset data in the request body'
            )
          }

          // Validate JSON structure
          const data = req.body
          if (typeof data !== 'object') {
            throw new ValidationError(
              'Invalid JSON data',
              'The request body must be a valid JSON object',
              'Ensure the request body contains valid JSON'
            )
          }

          // Ensure custom directory exists
          const customDir = path.join(__dirname, '..', 'presets', 'custom')
          if (!fs.existsSync(customDir)) {
            fs.mkdirSync(customDir, { recursive: true })
          }

          // Write preset file
          fs.writeFileSync(presetPath, JSON.stringify(data, null, 2), 'utf-8')

          res.json({ success: true, message: `${presetName}.json uploaded successfully` })

          app.debug(`Custom preset uploaded: ${presetName}.json`)
        } catch (error) {
          app.error(`Error uploading custom preset: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      router.delete('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name

          // Security: Validate filename to prevent path traversal
          validateFilename(presetName, 'preset name')

          const customPresetsDir = path.join(__dirname, '..', 'presets', 'custom')
          const presetPath = path.join(customPresetsDir, `${presetName}.json`)

          // Security: Validate that resolved path doesn't escape custom directory
          validatePathInDirectory(presetPath, customPresetsDir, 'preset path')

          if (!fs.existsSync(presetPath)) {
            throw new NotFoundError('Custom preset', presetName)
          }

          fs.unlinkSync(presetPath)

          res.json({
            success: true,
            presetName
          })
        } catch (error) {
          app.error(`Error deleting custom preset: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/backups
      // Download a complete backup of all configuration files
      router.get('/backups', async (req: Request, res: Response) => {
        try {
          const dataDir = app.getDataDirPath()
          const archive = archiver('zip', { zlib: { level: 9 } })

          res.setHeader('Content-Type', 'application/zip')
          res.setHeader(
            'Content-Disposition',
            `attachment; filename=signalk-units-backup-${Date.now()}.zip`
          )

          archive.pipe(res)

          // Add preset files
          const presetsDir = path.join(__dirname, '..', 'presets')
          if (fs.existsSync(presetsDir)) {
            archive.file(path.join(presetsDir, 'imperial-us.json'), {
              name: 'presets/imperial-us.json'
            })
            archive.file(path.join(presetsDir, 'imperial-uk.json'), {
              name: 'presets/imperial-uk.json'
            })
            archive.file(path.join(presetsDir, 'metric.json'), { name: 'presets/metric.json' })

            // Add custom presets
            const customPresetsDir = path.join(presetsDir, 'custom')
            if (fs.existsSync(customPresetsDir)) {
              const customFiles = fs.readdirSync(customPresetsDir)
              for (const file of customFiles) {
                if (file.endsWith('.json')) {
                  archive.file(path.join(customPresetsDir, file), {
                    name: `presets/custom/${file}`
                  })
                }
              }
            }
          }

          // Add definition files
          const definitionsDir = path.join(__dirname, '..', 'presets', 'definitions')
          if (fs.existsSync(definitionsDir)) {
            archive.file(path.join(definitionsDir, 'standard-units-definitions.json'), {
              name: 'presets/definitions/standard-units-definitions.json'
            })
            archive.file(path.join(definitionsDir, 'categories.json'), {
              name: 'presets/definitions/categories.json'
            })
            archive.file(path.join(definitionsDir, 'date-formats.json'), {
              name: 'presets/definitions/date-formats.json'
            })
          }

          // Add runtime data files
          const preferencesPath = path.join(dataDir, 'units-preferences.json')
          if (fs.existsSync(preferencesPath)) {
            archive.file(preferencesPath, { name: 'units-preferences.json' })
          }

          const customDefinitionsPath = path.join(dataDir, 'custom-units-definitions.json')
          if (fs.existsSync(customDefinitionsPath)) {
            archive.file(customDefinitionsPath, { name: 'custom-units-definitions.json' })
          }

          await archive.finalize()
          app.debug('Backup created successfully')
        } catch (error) {
          app.error(`Error creating backup: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // POST /plugins/signalk-units-preference/backups
      // Restore configuration from a backup zip file
      router.post('/backups', async (req: Request, res: Response) => {
        try {
          if (!req.body || !req.body.zipData) {
            throw new ValidationError(
              'No zip data provided',
              'The request body is missing zipData',
              'Please provide the backup zip file as base64-encoded data in the zipData field'
            )
          }

          const dataDir = app.getDataDirPath()
          const zipBuffer = Buffer.from(req.body.zipData, 'base64')
          const zip = new AdmZip(zipBuffer)

          const restoredFiles: string[] = []

          // Define allowed base directories for security validation
          const pluginBaseDir = path.normalize(path.join(__dirname, '..'))
          const dataBaseDir = path.normalize(dataDir)

          // Extract and restore each file
          for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue

            const entryName = entry.entryName
            let targetPath: string
            let allowedBaseDir: string

            // Security: Validate entry name doesn't contain path traversal
            if (entryName.includes('..') || entryName.includes('\\')) {
              app.error(`Security: Rejecting zip entry with path traversal: ${entryName}`)
              throw new ValidationError(
                'Invalid zip entry name',
                `Entry "${entryName}" contains path traversal sequences`,
                'The backup file may be corrupted or malicious. Path traversal is not permitted.'
              )
            }

            if (entryName.startsWith('presets/')) {
              // Restore preset files
              targetPath = path.join(__dirname, '..', entryName)
              allowedBaseDir = pluginBaseDir
            } else if (
              entryName === 'units-preferences.json' ||
              entryName === 'custom-units-definitions.json'
            ) {
              // Restore runtime data files
              targetPath = path.join(dataDir, entryName)
              allowedBaseDir = dataBaseDir
            } else {
              // Skip unknown files
              app.debug(`Skipping unknown zip entry: ${entryName}`)
              continue
            }

            // Security: CRITICAL - Validate the resolved path doesn't escape allowed directory
            const normalizedTarget = path.normalize(targetPath)
            if (!normalizedTarget.startsWith(allowedBaseDir)) {
              app.error(
                `Security: Zip entry attempts to escape directory: ${entryName} -> ${normalizedTarget}`
              )
              throw new ValidationError(
                'Invalid zip entry path',
                `Entry "${entryName}" attempts to write outside allowed directory`,
                'The backup file may be corrupted or malicious. Path traversal is not permitted.'
              )
            }

            // Create directory if it doesn't exist
            const targetDir = path.dirname(targetPath)
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true })
            }

            // Write the file
            fs.writeFileSync(targetPath, entry.getData())
            restoredFiles.push(entryName)
            app.debug(`Restored: ${entryName}`)
          }

          // Reload the units manager
          await unitsManager.initialize()

          res.json({
            success: true,
            message: 'Backup restored successfully',
            restoredFiles
          })

          app.debug(`Backup restored successfully: ${restoredFiles.length} files`)
        } catch (error) {
          app.error(`Error restoring backup: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/files/definitions/:fileType
      // Download individual definition file (standard-units, categories, date-formats)
      router.get('/files/definitions/:fileType', (req: Request, res: Response) => {
        try {
          const fileType = req.params.fileType

          // Validate file type
          const validTypes = ['standard-units', 'categories', 'date-formats']
          if (!validTypes.includes(fileType)) {
            throw new ValidationError(
              'Invalid file type',
              'The file type is not recognized',
              'Use one of: standard-units, categories, date-formats'
            )
          }

          // Map to actual file names
          const fileNameMap: Record<string, string> = {
            'standard-units': 'standard-units-definitions.json',
            categories: 'categories.json',
            'date-formats': 'date-formats.json'
          }
          const fileName = fileNameMap[fileType]
          const filePath = path.join(__dirname, '..', 'presets', 'definitions', fileName)

          if (!fs.existsSync(filePath)) {
            throw new NotFoundError('Definition file', fileName)
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
          res.sendFile(filePath)
        } catch (error) {
          app.error(`Error downloading definition file: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // PUT /plugins/signalk-units-preference/files/definitions/:fileType
      // Upload individual definition file (standard-units, categories, date-formats)
      router.put('/files/definitions/:fileType', async (req: Request, res: Response) => {
        try {
          const fileType = req.params.fileType

          // Validate file type
          const validTypes = ['standard-units', 'categories', 'date-formats']
          if (!validTypes.includes(fileType)) {
            throw new ValidationError(
              'Invalid file type',
              'The file type is not recognized',
              'Use one of: standard-units, categories, date-formats'
            )
          }

          if (!req.body) {
            throw new ValidationError(
              'No file data provided',
              'The request body is empty',
              'Please provide the file data in the request body'
            )
          }

          // Map to actual file names
          const fileNameMap: Record<string, string> = {
            'standard-units': 'standard-units-definitions.json',
            categories: 'categories.json',
            'date-formats': 'date-formats.json'
          }
          const fileName = fileNameMap[fileType]
          const filePath = path.join(__dirname, '..', 'presets', 'definitions', fileName)

          // Validate JSON structure
          const data = req.body
          if (typeof data !== 'object') {
            throw new ValidationError(
              'Invalid JSON data',
              'The request body must be a valid JSON object',
              'Ensure the request body contains valid JSON'
            )
          }

          // Write file
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')

          // Reload units manager to apply changes
          await unitsManager.initialize()

          res.json({ success: true, message: `${fileName} uploaded successfully` })

          app.debug(`Definition file uploaded: ${fileName}`)
        } catch (error) {
          app.error(`Error uploading definition file: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // GET /plugins/signalk-units-preference/files/configs/:fileType
      // Download built-in preset or runtime data file
      router.get('/files/configs/:fileType', (req: Request, res: Response) => {
        try {
          const fileType = req.params.fileType
          const dataDir = app.getDataDirPath()

          let filePath: string
          let fileName: string

          // Map file types to paths
          switch (fileType) {
            case 'imperial-us':
            case 'imperial-uk':
            case 'metric':
              filePath = path.join(__dirname, '..', 'presets', `${fileType}.json`)
              fileName = `${fileType}.json`
              break
            case 'units-preferences':
              filePath = path.join(dataDir, 'units-preferences.json')
              fileName = 'units-preferences.json'
              break
            case 'custom-units-definitions':
              filePath = path.join(dataDir, 'custom-units-definitions.json')
              fileName = 'custom-units-definitions.json'
              break
            default:
              throw new ValidationError(
                'Invalid file type',
                'The file type is not recognized',
                'Use one of: imperial-us, imperial-uk, metric, units-preferences, custom-units-definitions'
              )
          }

          if (!fs.existsSync(filePath)) {
            throw new NotFoundError('Config file', fileName)
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
          res.sendFile(filePath)
        } catch (error) {
          app.error(`Error downloading config file: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      // PUT /plugins/signalk-units-preference/files/configs/:fileType
      // Upload built-in preset or runtime data file
      router.put('/files/configs/:fileType', async (req: Request, res: Response) => {
        try {
          const fileType = req.params.fileType
          const dataDir = app.getDataDirPath()

          if (!req.body) {
            throw new ValidationError(
              'No file data provided',
              'The request body is empty',
              'Please provide the file data in the request body'
            )
          }

          let filePath: string

          // Map file types to paths
          switch (fileType) {
            case 'imperial-us':
            case 'imperial-uk':
            case 'metric':
              filePath = path.join(__dirname, '..', 'presets', `${fileType}.json`)
              break
            case 'units-preferences':
              filePath = path.join(dataDir, 'units-preferences.json')
              break
            case 'custom-units-definitions':
              filePath = path.join(dataDir, 'custom-units-definitions.json')
              break
            default:
              throw new ValidationError(
                'Invalid file type',
                'The file type is not recognized',
                'Use one of: imperial-us, imperial-uk, metric, units-preferences, custom-units-definitions'
              )
          }

          // Validate JSON structure
          const data = req.body
          if (typeof data !== 'object') {
            throw new ValidationError(
              'Invalid JSON data',
              'The request body must be a valid JSON object',
              'Ensure the request body contains valid JSON'
            )
          }

          // Validate structure based on file type
          if (fileType === 'custom-units-definitions') {
            // custom-units-definitions.json should contain unit definitions, NOT preferences
            const invalidKeys = ['categories', 'pathOverrides', 'pathPatterns', 'currentPreset']
            for (const key of invalidKeys) {
              if (key in data) {
                throw new ValidationError(
                  'Invalid structure',
                  `"${key}" belongs in units-preferences.json, not custom-units-definitions.json`,
                  'Please upload the correct file'
                )
              }
            }

            // Validate that it contains valid unit definitions structure
            for (const [baseUnit, def] of Object.entries(data)) {
              if (typeof def !== 'object' || def === null) {
                throw new ValidationError(
                  'Invalid unit definition',
                  `Unit definition for "${baseUnit}" must be an object`,
                  'Check the structure of your unit definitions'
                )
              }
              const unitDef = def as any
              if (!unitDef.category && !unitDef.conversions) {
                throw new ValidationError(
                  'Invalid unit definition',
                  `Unit definition for "${baseUnit}" must have "category" or "conversions" property`,
                  'Ensure each unit definition has the required properties'
                )
              }
            }
          } else if (fileType === 'units-preferences') {
            // units-preferences.json should contain preferences structure
            if (!data.categories && !data.pathOverrides && !data.pathPatterns) {
              throw new ValidationError(
                'Invalid structure',
                'units-preferences.json must contain at least one of: categories, pathOverrides, or pathPatterns',
                'Ensure your preferences file has the correct structure'
              )
            }

            // Check for mistakenly uploaded units-definitions
            let hasUnitDefStructure = false
            for (const [key, value] of Object.entries(data)) {
              if (
                typeof value === 'object' &&
                value !== null &&
                'conversions' in value &&
                !['categories', 'pathOverrides', 'pathPatterns', 'currentPreset'].includes(key)
              ) {
                hasUnitDefStructure = true
                break
              }
            }
            if (hasUnitDefStructure) {
              throw new ValidationError(
                'Invalid structure',
                'This looks like units-definitions.json',
                'Please upload the correct file'
              )
            }
          } else if (['imperial-us', 'imperial-uk', 'metric'].includes(fileType)) {
            // Preset files should have categories
            if (!data.categories) {
              throw new ValidationError(
                'Invalid preset structure',
                'Preset file must contain "categories" property',
                'Ensure the preset file has the correct structure'
              )
            }
          }

          // Write file
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')

          // Reload units manager to apply changes
          await unitsManager.initialize()

          res.json({ success: true, message: `${fileType}.json uploaded successfully` })

          app.debug(`Config file uploaded: ${fileType}.json`)
        } catch (error) {
          app.error(`Error uploading config file: ${error}`)
          const response = formatErrorResponse(error)
          res.status(response.status).json(response.body)
        }
      })

      app.debug('API routes registered')
    },

    getOpenApi: () => openApiSpec
  }

  return plugin
}
