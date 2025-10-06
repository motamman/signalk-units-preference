import { Plugin, ServerAPI } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { UnitsManager } from './UnitsManager'
import { ConversionDeltaValue, DeltaResponse, DeltaValueEntry } from './types'
import * as path from 'path'
import * as fs from 'fs'
import archiver from 'archiver'
import AdmZip from 'adm-zip'

const PLUGIN_ID = 'signalk-units-preference'
const PLUGIN_NAME = 'Units Preference Manager'

module.exports = (app: ServerAPI): Plugin => {
  const DEFAULT_PLUGIN_SCHEMA = {
    type: 'object',
    properties: {}
  }

  let unitsManager: UnitsManager
  let openApiSpec: object = DEFAULT_PLUGIN_SCHEMA

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: 'Manages unit conversions and display preferences for SignalK data paths',

    schema: () => DEFAULT_PLUGIN_SCHEMA,

    start: async () => {
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

      // GET /plugins/signalk-units-preference/conversions/:path
      // Get conversion info for a specific path, optionally convert a value with ?value query param
      router.get('/conversions/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const valueParam = Array.isArray(req.query.value) ? req.query.value[0] : req.query.value
          const typeParam = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type

          // If value query param provided, return conversion result
          if (valueParam !== undefined) {
            app.debug(`Converting value ${valueParam} for path: ${pathStr}`)
            const result = buildDeltaResponse(pathStr, valueParam, {
              typeHint: typeof typeParam === 'string' ? toSupportedValueType(typeParam) : undefined
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
          if ((error as any).status === 400) {
            return res.status(400).json({
              error: (error as Error).message,
              details: (error as any).details
            })
          }
          app.error(`Error getting conversion: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/units/conversions
      // Convert a value using base unit and target unit directly
      router.post('/units/conversions', (req: Request, res: Response) => {
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
            throw createBadRequestError('baseUnit query parameter is required')
          }
          if (!targetUnitParam || typeof targetUnitParam !== 'string') {
            throw createBadRequestError('targetUnit query parameter is required')
          }
          if (valueParam === undefined || valueParam === null || valueParam === '') {
            throw createBadRequestError('value query parameter is required')
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
          const err = error as Error & { status?: number; details?: unknown }
          if (err.status === 400) {
            res.status(400).json({ error: err.message, details: err.details })
            return
          }
          res.status(400).json({ error: err.message })
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
      router.post(
        '/unit-definitions/:baseUnit/conversions',
        async (req: Request, res: Response) => {
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
            res.status(400).json({
              error: error instanceof Error ? error.message : 'Failed to add conversion'
            })
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
            res.status(500).json({ error: 'Internal server error' })
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
          res.status(500).json({ error: 'Internal server error' })
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
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/categories/:category
      // Update category preference
      router.put('/categories/:category', async (req: Request, res: Response) => {
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
          res.status(500).json({ error: 'Internal server error' })
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
      router.put('/overrides/:path(*)', async (req: Request, res: Response) => {
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
          res.status(500).json({ error: 'Internal server error' })
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/presets/current
      // Apply a preset (built-in or custom)
      router.put('/presets/current', async (req: Request, res: Response) => {
        try {
          const { presetType } = req.body

          if (!presetType || typeof presetType !== 'string') {
            return res.status(400).json({ error: 'presetType is required' })
          }

          // Check if it's a custom preset first
          const customPresetPath = path.join(__dirname, '..', 'presets', 'custom', `${presetType}.json`)
          let presetPath: string
          let isCustom = false

          if (fs.existsSync(customPresetPath)) {
            presetPath = customPresetPath
            isCustom = true
          } else {
            // Try built-in preset
            presetPath = path.join(__dirname, '..', 'presets', `${presetType}.json`)
            if (!fs.existsSync(presetPath)) {
              return res.status(400).json({
                error: 'Invalid preset type',
                validPresets: ['metric', 'imperial-us', 'imperial-uk', 'or any custom preset']
              })
            }
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
              error:
                'Invalid preset name. Only letters, numbers, dashes, and underscores are allowed.'
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

          const presetPath = path.join(customPresetsDir, `${presetName}.json`)

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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/presets/custom/:name
      // Download a specific custom preset file
      router.get('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name
          const presetPath = path.join(__dirname, '..', 'presets', 'custom', `${presetName}.json`)

          if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Custom preset not found' })
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename=${presetName}.json`)
          res.sendFile(presetPath)
        } catch (error) {
          app.error(`Error downloading custom preset: ${error}`)
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/presets/custom/:name
      // Upload/update a specific custom preset file
      router.put('/presets/custom/:name', async (req: Request, res: Response) => {
        try {
          const presetName = req.params.name
          const presetPath = path.join(__dirname, '..', 'presets', 'custom', `${presetName}.json`)

          if (!req.body) {
            return res.status(400).json({ error: 'No preset data provided' })
          }

          // Validate JSON structure
          const data = req.body
          if (typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid JSON data' })
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/backups
      // Restore configuration from a backup zip file
      router.post('/backups', async (req: Request, res: Response) => {
        try {
          if (!req.body || !req.body.zipData) {
            return res.status(400).json({ error: 'No zip data provided' })
          }

          const dataDir = app.getDataDirPath()
          const zipBuffer = Buffer.from(req.body.zipData, 'base64')
          const zip = new AdmZip(zipBuffer)

          const restoredFiles: string[] = []

          // Extract and restore each file
          for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue

            const entryName = entry.entryName
            let targetPath: string

            if (entryName.startsWith('presets/')) {
              // Restore preset files
              targetPath = path.join(__dirname, '..', entryName)
            } else if (
              entryName === 'units-preferences.json' ||
              entryName === 'custom-units-definitions.json'
            ) {
              // Restore runtime data files
              targetPath = path.join(dataDir, entryName)
            } else {
              continue // Skip unknown files
            }

            // Create directory if it doesn't exist
            const targetDir = path.dirname(targetPath)
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true })
            }

            // Write the file
            fs.writeFileSync(targetPath, entry.getData())
            restoredFiles.push(entryName)
          }

          // Reload the units manager
          await unitsManager.initialize()

          res.json({
            success: true,
            message: 'Backup restored successfully',
            restoredFiles
          })

          app.debug(`Backup restored: ${restoredFiles.join(', ')}`)
        } catch (error) {
          app.error(`Error restoring backup: ${error}`)
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
            return res.status(400).json({ error: 'Invalid file type' })
          }

          // Map to actual file names
          const fileNameMap: Record<string, string> = {
            'standard-units': 'standard-units-definitions.json',
            'categories': 'categories.json',
            'date-formats': 'date-formats.json'
          }
          const fileName = fileNameMap[fileType]
          const filePath = path.join(__dirname, '..', 'presets', 'definitions', fileName)

          if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' })
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
          res.sendFile(filePath)
        } catch (error) {
          app.error(`Error downloading definition file: ${error}`)
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/files/definitions/:fileType
      // Upload individual definition file (standard-units, categories, date-formats)
      router.put('/files/definitions/:fileType', (req: Request, res: Response) => {
        try {
          const fileType = req.params.fileType

          // Validate file type
          const validTypes = ['standard-units', 'categories', 'date-formats']
          if (!validTypes.includes(fileType)) {
            return res.status(400).json({ error: 'Invalid file type' })
          }

          if (!req.body) {
            return res.status(400).json({ error: 'No file data provided' })
          }

          // Map to actual file names
          const fileNameMap: Record<string, string> = {
            'standard-units': 'standard-units-definitions.json',
            'categories': 'categories.json',
            'date-formats': 'date-formats.json'
          }
          const fileName = fileNameMap[fileType]
          const filePath = path.join(__dirname, '..', 'presets', 'definitions', fileName)

          // Validate JSON structure
          const data = req.body
          if (typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid JSON data' })
          }

          // Write file
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')

          res.json({ success: true, message: `${fileName} uploaded successfully` })

          app.debug(`Definition file uploaded: ${fileName}`)
        } catch (error) {
          app.error(`Error uploading definition file: ${error}`)
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
              return res.status(400).json({ error: 'Invalid file type' })
          }

          if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' })
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Disposition', `attachment; filename=${fileName}`)
          res.sendFile(filePath)
        } catch (error) {
          app.error(`Error downloading config file: ${error}`)
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      // PUT /plugins/signalk-units-preference/files/configs/:fileType
      // Upload built-in preset or runtime data file
      router.put('/files/configs/:fileType', async (req: Request, res: Response) => {
        try {
          const fileType = req.params.fileType
          const dataDir = app.getDataDirPath()

          if (!req.body) {
            return res.status(400).json({ error: 'No file data provided' })
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
              return res.status(400).json({ error: 'Invalid file type' })
          }

          // Validate JSON structure
          const data = req.body
          if (typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid JSON data' })
          }

          // Validate structure based on file type
          if (fileType === 'custom-units-definitions') {
            // custom-units-definitions.json should contain unit definitions, NOT preferences
            const invalidKeys = ['categories', 'pathOverrides', 'pathPatterns', 'currentPreset']
            for (const key of invalidKeys) {
              if (key in data) {
                return res.status(400).json({
                  error: `Invalid structure: "${key}" belongs in units-preferences.json, not custom-units-definitions.json. Please upload the correct file.`
                })
              }
            }

            // Validate that it contains valid unit definitions structure
            for (const [baseUnit, def] of Object.entries(data)) {
              if (typeof def !== 'object' || def === null) {
                return res.status(400).json({
                  error: `Invalid unit definition for "${baseUnit}": must be an object`
                })
              }
              const unitDef = def as any
              if (!unitDef.category && !unitDef.conversions) {
                return res.status(400).json({
                  error: `Invalid unit definition for "${baseUnit}": must have "category" or "conversions" property`
                })
              }
            }
          } else if (fileType === 'units-preferences') {
            // units-preferences.json should contain preferences structure
            if (!data.categories && !data.pathOverrides && !data.pathPatterns) {
              return res.status(400).json({
                error: 'Invalid structure: units-preferences.json must contain at least one of: categories, pathOverrides, or pathPatterns'
              })
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
              return res.status(400).json({
                error: 'Invalid structure: This looks like units-definitions.json. Please upload the correct file.'
              })
            }
          } else if (['imperial-us', 'imperial-uk', 'metric'].includes(fileType)) {
            // Preset files should have categories
            if (!data.categories) {
              return res.status(400).json({
                error: 'Invalid preset structure: must contain "categories" property'
              })
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
          res
            .status(500)
            .json({ error: error instanceof Error ? error.message : 'Internal server error' })
        }
      })

      app.debug('API routes registered')
    },

    getOpenApi: () => openApiSpec
  }

  return plugin
}
