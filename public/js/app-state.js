/* global loadPaths */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * Global application state and constants
 * This module contains all shared state accessed by other modules
 */

// API base URL
const API_BASE = '/plugins/signalk-units-preference'

// Application state
let preferences = null
let availablePaths = []
let signalKValues = {}
let signalKValueDetails = {}

// Preset tracking
const BUILT_IN_PRESETS = ['metric', 'imperial-us', 'imperial-uk']
let lastAppliedPresetId = ''
let originalPresetState = null

// Unit schema data (loaded from server)
let unitSchema = {
  baseUnits: [],
  categories: [],
  targetUnitsByBase: {},
  categoryToBaseUnit: {},
  coreCategories: []
}
