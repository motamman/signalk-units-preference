import { Plugin, ServerAPI } from '@signalk/server-api'
import { IRouter, Request, Response } from 'express'
import { UnitsManager } from './UnitsManager'
import { PluginConfig } from './types'
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

      // GET /plugins/signalk-units-preference/conversion/:path
      // Get conversion info for a specific path
      router.get('/conversion/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          app.debug(`Getting conversion for path: ${pathStr}`)

          const conversion = unitsManager.getConversion(pathStr)

          if (!conversion) {
            return res.status(404).json({
              error: 'No conversion found for path',
              path: pathStr
            })
          }

          res.json(conversion)
        } catch (error) {
          app.error(`Error getting conversion: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // GET /plugins/signalk-units-preference/convert/:path/:value
      // Convert a value and return display-ready result
      router.get('/convert/:path(*)/:value', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const value = parseFloat(req.params.value)

          if (isNaN(value)) {
            return res.status(400).json({
              error: 'Invalid value',
              value: req.params.value
            })
          }

          app.debug(`Converting value ${value} for path: ${pathStr}`)

          const result = unitsManager.convertValue(pathStr, value)

          if (!result) {
            return res.status(404).json({
              error: 'No conversion found for path',
              path: pathStr
            })
          }

          res.json(result)
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

      // GET /plugins/signalk-units-preference/metadata/:path
      // Get metadata for specific path
      router.get('/metadata/:path(*)', (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const metadata = unitsManager.getMetadata()
          const pathMetadata = metadata[pathStr]

          if (!pathMetadata) {
            return res.status(404).json({
              error: 'No metadata found for path',
              path: pathStr
            })
          }

          res.json(pathMetadata)
        } catch (error) {
          app.error(`Error getting metadata: ${error}`)
          res.status(500).json({ error: 'Internal server error' })
        }
      })

      // POST /plugins/signalk-units-preference/metadata/:path
      // Update or create metadata for a path
      router.post('/metadata/:path(*)', async (req: Request, res: Response) => {
        try {
          const pathStr = req.params.path
          const metadata = req.body

          if (!metadata.baseUnit || !metadata.category || !metadata.conversions) {
            return res.status(400).json({
              error: 'Invalid metadata format',
              required: ['baseUnit', 'category', 'conversions']
            })
          }

          await unitsManager.updateMetadata(pathStr, metadata)
          res.json({ success: true, path: pathStr })
        } catch (error) {
          app.error(`Error updating metadata: ${error}`)
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
          const { baseUnit, description, conversions } = req.body
          if (!baseUnit) {
            return res.status(400).json({ error: 'baseUnit is required' })
          }
          await unitsManager.addUnitDefinition(baseUnit, {
            baseUnit,
            category: description || baseUnit,
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

      // POST /plugins/signalk-units-preference/conversion/:path/:unit
      // Add custom conversion to a path
      router.post(
        '/conversion/:path(*)/:unit',
        async (req: Request, res: Response) => {
          try {
            const pathStr = req.params.path
            const unitName = req.params.unit
            const conversion = req.body

            if (!conversion.factor || !conversion.symbol) {
              return res.status(400).json({
                error: 'Invalid conversion format',
                required: ['factor', 'symbol']
              })
            }

            // Calculate inverse factor if not provided
            if (!conversion.inverseFactor) {
              conversion.inverseFactor = 1 / conversion.factor
            }

            await unitsManager.addConversion(pathStr, unitName, conversion)
            res.json({ success: true, path: pathStr, unit: unitName })
          } catch (error) {
            app.error(`Error adding conversion: ${error}`)
            res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' })
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
