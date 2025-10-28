import { ServerAPI } from '@signalk/server-api'
import * as fs from 'fs'
import * as path from 'path'
import { UnitsPreferences, CategoryPreference, PathPatternRule, BaseUnitDefinition } from './types'

const DEFAULT_CATEGORY_PREFERENCES: Record<string, CategoryPreference & { baseUnit?: string }> = {
  speed: { targetUnit: 'kn', displayFormat: '0.0' },
  temperature: { targetUnit: '°C', displayFormat: '0' },
  pressure: { targetUnit: 'hPa', displayFormat: '0' },
  distance: { targetUnit: 'nm', displayFormat: '0.0' },
  depth: { targetUnit: 'm', displayFormat: '0.0' },
  angle: { targetUnit: '°', displayFormat: '0' },
  percentage: { targetUnit: '%', displayFormat: '0' },
  dateTime: { targetUnit: 'time-am/pm-local', displayFormat: 'time-am/pm' },
  epoch: { targetUnit: 'time-am/pm-local', displayFormat: 'time-am/pm' },
  volume: { targetUnit: 'gal', displayFormat: '0.0' },
  length: { targetUnit: 'ft', displayFormat: '0.0' },
  angularVelocity: { targetUnit: '°/s', displayFormat: '0.0' },
  voltage: { targetUnit: 'V', displayFormat: '0.00' },
  current: { targetUnit: 'A', displayFormat: '0.00' },
  power: { targetUnit: 'W', displayFormat: '0.00' },
  frequency: { targetUnit: 'rpm', displayFormat: '0.0' },
  time: { targetUnit: 's', displayFormat: '0.0' },
  charge: { targetUnit: 'Ah', displayFormat: '0.0' },
  volumeRate: { targetUnit: 'gal/h', displayFormat: '0.0' },
  unitless: { targetUnit: 'tr', displayFormat: '0.0' },
  energy: { targetUnit: 'J', displayFormat: '0.0' },
  mass: { targetUnit: 'kg', displayFormat: '0.0' },
  area: { targetUnit: 'm2', displayFormat: '0.0' },
  angleDegrees: { targetUnit: 'deg', displayFormat: '0.0' },
  boolean: { targetUnit: 'bool', displayFormat: 'boolean' }
}

const DEFAULT_PATH_PATTERNS: PathPatternRule[] = [
  {
    pattern: '*.temperature',
    category: 'temperature',
    targetUnit: '°C',
    displayFormat: '0',
    priority: 100
  },
  {
    pattern: '*.pressure',
    category: 'pressure',
    targetUnit: 'hPa',
    displayFormat: '0',
    priority: 100
  },
  {
    pattern: '*.speed*',
    category: 'speed',
    targetUnit: 'kn',
    displayFormat: '0.0',
    priority: 90
  },
  {
    pattern: '**.timeEpoch',
    category: 'epoch',
    targetUnit: 'time-am/pm-local',
    priority: 100,
    baseUnit: 'Epoch Seconds'
  }
]

/**
 * PreferencesStore handles persistence and CRUD operations for preferences.
 * Responsibilities:
 * - File I/O for preferences and unit definitions
 * - CRUD operations for categories, paths, and patterns
 * - Preference loading/saving
 * - File migration
 */
export class PreferencesStore {
  private preferences: UnitsPreferences
  private unitDefinitions: Record<string, BaseUnitDefinition>
  private preferencesPath: string
  private customDefinitionsPath: string
  private preferencesChangedCallbacks: Array<() => void> = []

  constructor(
    private app: ServerAPI,
    private dataDir: string
  ) {
    this.preferencesPath = path.join(dataDir, 'units-preferences.json')
    this.customDefinitionsPath = path.join(dataDir, 'custom-units-definitions.json')
    this.preferences = {
      categories: {},
      pathOverrides: {}
    }
    this.unitDefinitions = {}
  }

  /**
   * Add callback to be invoked when preferences change
   * Supports multiple callbacks
   */
  setOnPreferencesChanged(callback: () => void): void {
    this.preferencesChangedCallbacks.push(callback)
  }

  /**
   * Get current preferences
   */
  getPreferences(): UnitsPreferences {
    return this.preferences
  }

  /**
   * Get unit definitions
   */
  getUnitDefinitions(): Record<string, BaseUnitDefinition> {
    return this.unitDefinitions
  }

  /**
   * Migrate old file names to new naming convention
   */
  private migrateFileNames(): void {
    // Migrate units-definitions.json to custom-units-definitions.json
    const oldCustomPath = path.join(this.dataDir, 'units-definitions.json')
    if (fs.existsSync(oldCustomPath) && !fs.existsSync(this.customDefinitionsPath)) {
      try {
        fs.renameSync(oldCustomPath, this.customDefinitionsPath)
        this.app.debug('Migrated units-definitions.json to custom-units-definitions.json')
      } catch (error) {
        this.app.error(`Failed to migrate units-definitions.json: ${error}`)
      }
    }

    // Note: Migration of standard-units-definitions.json is handled by UnitsManager
    // since it needs access to definitionsDir
  }

  /**
   * Ensure category defaults exist
   */
  private ensureCategoryDefaults(categoryToBaseUnitMap: Record<string, string>): boolean {
    let updated = false

    if (!this.preferences.categories) {
      this.preferences.categories = {}
      updated = true
    }

    for (const [category, defaults] of Object.entries(DEFAULT_CATEGORY_PREFERENCES)) {
      const existing = this.preferences.categories[category]
      const { targetUnit, displayFormat, baseUnit } = defaults

      if (!existing) {
        this.preferences.categories[category] = {
          targetUnit,
          displayFormat,
          ...(baseUnit ? { baseUnit } : {})
        }
        updated = true
        continue
      }

      // Only add baseUnit if this is a custom category (not in the static schema)
      // Core categories get their baseUnit from the categoryToBaseUnit map
      const isCoreCategory = !!categoryToBaseUnitMap[category]
      if (baseUnit && !existing.baseUnit && !isCoreCategory) {
        existing.baseUnit = baseUnit
        updated = true
      }

      if (!existing.targetUnit && targetUnit) {
        existing.targetUnit = targetUnit
        updated = true
      }

      if (!existing.displayFormat && displayFormat) {
        existing.displayFormat = displayFormat
        updated = true
      }
    }

    return updated
  }

  /**
   * Ensure default path patterns exist
   */
  private ensureDefaultPathPatterns(): boolean {
    let updated = false

    if (!this.preferences.pathPatterns) {
      this.preferences.pathPatterns = []
      updated = true
    }

    for (const defaultRule of DEFAULT_PATH_PATTERNS) {
      const existing = this.preferences.pathPatterns.find(
        rule => rule.pattern === defaultRule.pattern
      )

      if (!existing) {
        this.preferences.pathPatterns.push({ ...defaultRule })
        updated = true
        continue
      }

      if (defaultRule.category && !existing.category) {
        existing.category = defaultRule.category
        updated = true
      }

      if (defaultRule.baseUnit && !existing.baseUnit) {
        existing.baseUnit = defaultRule.baseUnit
        updated = true
      }

      if (defaultRule.targetUnit && !existing.targetUnit) {
        existing.targetUnit = defaultRule.targetUnit
        updated = true
      }

      if (defaultRule.displayFormat && !existing.displayFormat) {
        existing.displayFormat = defaultRule.displayFormat
        updated = true
      }

      if (defaultRule.priority !== undefined && existing.priority === undefined) {
        existing.priority = defaultRule.priority
        updated = true
      }
    }

    return updated
  }

  /**
   * Load preferences from file or create default
   */
  async loadPreferences(
    categoryToBaseUnitMap: Record<string, string>,
    definitionsDir: string
  ): Promise<void> {
    try {
      if (fs.existsSync(this.preferencesPath)) {
        const data = fs.readFileSync(this.preferencesPath, 'utf-8')
        this.preferences = JSON.parse(data)
        this.app.debug('Loaded units preferences from file')

        let preferencesChanged = false

        if (!this.preferences.categories) {
          this.preferences.categories = {}
          preferencesChanged = true
        }

        if (!this.preferences.pathOverrides) {
          this.preferences.pathOverrides = {}
          preferencesChanged = true
        }

        if (!this.preferences.pathPatterns) {
          this.preferences.pathPatterns = []
          preferencesChanged = true
        }

        preferencesChanged =
          this.ensureCategoryDefaults(categoryToBaseUnitMap) || preferencesChanged
        preferencesChanged = this.ensureDefaultPathPatterns() || preferencesChanged

        if (preferencesChanged) {
          await this.savePreferences()
        }
      } else {
        this.preferences = {
          categories: {},
          pathOverrides: {},
          pathPatterns: DEFAULT_PATH_PATTERNS.map(rule => ({ ...rule }))
        }

        this.ensureCategoryDefaults(categoryToBaseUnitMap)
        this.ensureDefaultPathPatterns()

        // Apply Imperial US preset by default on virgin install
        try {
          const presetPath = path.join(definitionsDir, '..', 'imperial-us.json')
          if (fs.existsSync(presetPath)) {
            const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
            const preset = presetData.categories

            // Apply preset categories (create missing categories automatically)
            for (const [category, settings] of Object.entries(preset)) {
              const castSettings = settings as {
                targetUnit?: string
                displayFormat?: string
                baseUnit?: string
              }

              const existing = this.preferences.categories[category]
              if (existing) {
                this.preferences.categories[category] = {
                  targetUnit: castSettings.targetUnit || existing.targetUnit || '',
                  displayFormat: castSettings.displayFormat || existing.displayFormat || '0.0'
                }
              } else {
                const schemaBaseUnit = categoryToBaseUnitMap[category]
                const presetBaseUnit = castSettings.baseUnit

                const newCategoryPref: CategoryPreference = {
                  targetUnit: castSettings.targetUnit || '',
                  displayFormat: castSettings.displayFormat || '0.0'
                }

                if (presetBaseUnit && (!schemaBaseUnit || schemaBaseUnit !== presetBaseUnit)) {
                  newCategoryPref.baseUnit = presetBaseUnit
                }

                this.preferences.categories[category] = newCategoryPref
              }
            }

            // Set current preset info
            this.preferences.currentPreset = {
              type: 'imperial-us',
              name: presetData.name,
              version: presetData.version,
              appliedDate: new Date().toISOString()
            }

            this.app.debug('Applied Imperial (US) preset as default for virgin install')
          }
        } catch (error) {
          this.app.error(`Failed to apply default preset: ${error}`)
        }

        this.ensureCategoryDefaults(categoryToBaseUnitMap)
        this.ensureDefaultPathPatterns()
        await this.savePreferences()
        this.app.debug('Created default units preferences file')
      }
    } catch (error) {
      this.app.error(`Failed to load preferences: ${error}`)
      throw error
    }
  }

  /**
   * Save preferences to file
   */
  async savePreferences(): Promise<void> {
    try {
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2), 'utf-8')
      this.app.debug('Saved units preferences')

      // Notify all listeners that preferences have changed (e.g., to clear conversion cache)
      for (const callback of this.preferencesChangedCallbacks) {
        callback()
      }
    } catch (error) {
      this.app.error(`Failed to save preferences: ${error}`)
      throw error
    }
  }

  /**
   * Load unit definitions from file
   */
  async loadUnitDefinitions(): Promise<void> {
    try {
      if (fs.existsSync(this.customDefinitionsPath)) {
        const data = fs.readFileSync(this.customDefinitionsPath, 'utf-8')
        this.unitDefinitions = JSON.parse(data)
        this.app.debug('Loaded custom unit definitions from file')
      } else {
        this.unitDefinitions = {}
        await this.saveUnitDefinitions()
        this.app.debug('Created default custom unit definitions file')
      }
    } catch (error) {
      this.app.error(`Failed to load custom unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Save unit definitions to file
   */
  async saveUnitDefinitions(): Promise<void> {
    try {
      fs.writeFileSync(
        this.customDefinitionsPath,
        JSON.stringify(this.unitDefinitions, null, 2),
        'utf-8'
      )
      this.app.debug('Saved custom unit definitions')
    } catch (error) {
      this.app.error(`Failed to save custom unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Initialize preferences and unit definitions
   */
  async initialize(
    categoryToBaseUnitMap: Record<string, string>,
    definitionsDir: string
  ): Promise<void> {
    this.migrateFileNames()
    await this.loadPreferences(categoryToBaseUnitMap, definitionsDir)
    await this.loadUnitDefinitions()
  }

  // ===== Category Preferences CRUD =====

  /**
   * Update category preference
   */
  async updateCategoryPreference(category: string, preference: CategoryPreference): Promise<void> {
    this.preferences.categories[category] = preference
    await this.savePreferences()
  }

  /**
   * Delete category preference
   */
  async deleteCategoryPreference(category: string): Promise<void> {
    if (this.preferences.categories[category]) {
      delete this.preferences.categories[category]
      await this.savePreferences()
    }
  }

  /**
   * Update current preset information
   */
  async updateCurrentPreset(type: string, name: string, version: string): Promise<void> {
    this.preferences.currentPreset = {
      type,
      name,
      version,
      appliedDate: new Date().toISOString()
    }
    await this.savePreferences()
  }

  // ===== Path Overrides CRUD =====

  /**
   * Update path override
   */
  async updatePathOverride(pathStr: string, preference: CategoryPreference): Promise<void> {
    this.preferences.pathOverrides[pathStr] = {
      path: pathStr,
      ...preference
    }
    await this.savePreferences()
  }

  /**
   * Delete path override
   */
  async deletePathOverride(pathStr: string): Promise<void> {
    delete this.preferences.pathOverrides[pathStr]
    await this.savePreferences()
  }

  // ===== Path Patterns CRUD =====

  /**
   * Add path pattern rule
   */
  async addPathPattern(pattern: PathPatternRule): Promise<void> {
    if (!this.preferences.pathPatterns) {
      this.preferences.pathPatterns = []
    }
    this.preferences.pathPatterns.push(pattern)
    await this.savePreferences()
  }

  /**
   * Update path pattern rule
   */
  async updatePathPattern(index: number, pattern: PathPatternRule): Promise<void> {
    if (!this.preferences.pathPatterns || index >= this.preferences.pathPatterns.length) {
      throw new Error(`Pattern at index ${index} not found`)
    }
    this.preferences.pathPatterns[index] = pattern
    await this.savePreferences()
  }

  /**
   * Delete path pattern rule
   */
  async deletePathPattern(index: number): Promise<void> {
    if (!this.preferences.pathPatterns || index >= this.preferences.pathPatterns.length) {
      throw new Error(`Pattern at index ${index} not found`)
    }
    this.preferences.pathPatterns.splice(index, 1)
    await this.savePreferences()
  }

  // ===== Unit Definitions CRUD =====

  /**
   * Add or update a unit definition
   */
  async addUnitDefinition(baseUnit: string, definition: BaseUnitDefinition): Promise<void> {
    this.unitDefinitions[baseUnit] = definition
    await this.saveUnitDefinitions()
  }

  /**
   * Delete a unit definition
   */
  async deleteUnitDefinition(baseUnit: string): Promise<void> {
    delete this.unitDefinitions[baseUnit]
    await this.saveUnitDefinitions()
  }

  /**
   * Add a conversion to a unit definition
   */
  async addConversionToUnit(baseUnit: string, targetUnit: string, conversion: any): Promise<void> {
    // If this base unit doesn't exist in custom definitions, create it
    if (!this.unitDefinitions[baseUnit]) {
      this.unitDefinitions[baseUnit] = {
        baseUnit: baseUnit,
        conversions: {}
      }
    }

    if (!this.unitDefinitions[baseUnit].conversions) {
      this.unitDefinitions[baseUnit].conversions = {}
    }

    this.unitDefinitions[baseUnit].conversions[targetUnit] = conversion
    await this.saveUnitDefinitions()
  }

  /**
   * Delete a conversion from a unit definition
   */
  async deleteConversionFromUnit(baseUnit: string, targetUnit: string): Promise<void> {
    if (this.unitDefinitions[baseUnit]?.conversions[targetUnit]) {
      delete this.unitDefinitions[baseUnit].conversions[targetUnit]
      await this.saveUnitDefinitions()
    }
  }

  // ===== Standard Unit Definitions CRUD =====

  /**
   * Get path to standard units definitions file
   */
  private getStandardDefinitionsPath(): string {
    // From dist/PreferencesStore.js, go to project root, then to presets/definitions
    return path.join(__dirname, '..', 'presets', 'definitions', 'standard-units-definitions.json')
  }

  /**
   * Load standard unit definitions from file
   */
  loadStandardUnitDefinitions(): Record<string, BaseUnitDefinition> {
    const standardPath = this.getStandardDefinitionsPath()
    if (fs.existsSync(standardPath)) {
      try {
        const data = fs.readFileSync(standardPath, 'utf8')
        return JSON.parse(data)
      } catch (error) {
        this.app.error(`Failed to load standard unit definitions: ${error}`)
        return {}
      }
    }
    return {}
  }

  /**
   * Save standard unit definitions to file
   */
  private async saveStandardUnitDefinitions(
    definitions: Record<string, BaseUnitDefinition>
  ): Promise<void> {
    const standardPath = this.getStandardDefinitionsPath()
    try {
      await fs.promises.writeFile(standardPath, JSON.stringify(definitions, null, 2), 'utf8')
      this.app.debug('Saved standard unit definitions')
    } catch (error) {
      this.app.error(`Failed to save standard unit definitions: ${error}`)
      throw error
    }
  }

  /**
   * Add or update a standard unit definition
   */
  async addStandardUnitDefinition(baseUnit: string, definition: BaseUnitDefinition): Promise<void> {
    const definitions = this.loadStandardUnitDefinitions()
    definitions[baseUnit] = definition
    await this.saveStandardUnitDefinitions(definitions)
  }

  /**
   * Delete a standard unit definition
   */
  async deleteStandardUnitDefinition(baseUnit: string): Promise<void> {
    const definitions = this.loadStandardUnitDefinitions()
    delete definitions[baseUnit]
    await this.saveStandardUnitDefinitions(definitions)
  }

  /**
   * Add or update a conversion in a standard unit definition
   */
  async addConversionToStandardUnit(
    baseUnit: string,
    targetUnit: string,
    conversion: any
  ): Promise<void> {
    const definitions = this.loadStandardUnitDefinitions()

    // If this base unit doesn't exist, create it
    if (!definitions[baseUnit]) {
      definitions[baseUnit] = {
        baseUnit: baseUnit,
        conversions: {}
      }
    }

    if (!definitions[baseUnit].conversions) {
      definitions[baseUnit].conversions = {}
    }

    definitions[baseUnit].conversions[targetUnit] = conversion
    await this.saveStandardUnitDefinitions(definitions)
  }

  /**
   * Delete a conversion from a standard unit definition
   */
  async deleteConversionFromStandardUnit(baseUnit: string, targetUnit: string): Promise<void> {
    const definitions = this.loadStandardUnitDefinitions()
    if (definitions[baseUnit]?.conversions[targetUnit]) {
      delete definitions[baseUnit].conversions[targetUnit]
      await this.saveStandardUnitDefinitions(definitions)
    }
  }
}
