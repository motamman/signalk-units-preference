/**
 * js-quantities Integration Helper
 *
 * Provides formula suggestions and available conversions using js-quantities
 * Used as a helper tool in the UI - formulas remain editable by users
 */

import Qty from 'js-quantities'

// Unit name mapping: SignalK/our names → js-quantities names
const unitMapping: Record<string, string> = {
  // Speed
  'm/s': 'm/s',
  knots: 'kt',
  kn: 'kt',
  'km/h': 'km/h',
  mph: 'mph',
  'ft/s': 'ft/s',

  // Temperature (special handling needed for offsets)
  K: 'tempK',
  kelvin: 'tempK',
  celsius: 'tempC',
  '°C': 'tempC',
  fahrenheit: 'tempF',
  '°F': 'tempF',

  // Pressure
  Pa: 'Pa',
  hPa: 'hPa',
  kPa: 'kPa',
  mbar: 'mbar',
  bar: 'bar',
  inHg: 'inHg',
  mmHg: 'mmHg',
  psi: 'psi',
  atm: 'atm',
  torr: 'torr',

  // Distance/Length
  m: 'm',
  km: 'km',
  nm: 'nmi', // nautical mile
  nmi: 'nmi',
  mi: 'mi',
  ft: 'ft',
  yd: 'yd',
  in: 'in',
  cm: 'cm',
  mm: 'mm',
  fathom: 'fathom',

  // Angle
  rad: 'rad',
  deg: 'deg',
  '°': 'deg',
  degree: 'deg',
  grad: 'grad',

  // Volume
  m3: 'm^3',
  'm³': 'm^3',
  L: 'liter',
  liter: 'liter',
  litre: 'liter',
  gal: 'gal',
  gallon: 'gal',
  'gal(UK)': 'gallon', // Imperial gallon
  qt: 'qt',
  quart: 'qt',
  pt: 'pt',
  pint: 'pt',
  cup: 'cup',

  // Electrical
  V: 'V',
  mV: 'mV',
  kV: 'kV',
  A: 'A',
  mA: 'mA',
  kA: 'kA',
  W: 'W',
  kW: 'kW',
  MW: 'MW',
  hp: 'hp',
  horsepower: 'hp',

  // Charge
  C: 'C',
  Ah: 'Ah',
  mAh: 'mAh',
  kAh: 'kAh',

  // Frequency
  Hz: 'Hz',
  kHz: 'kHz',
  MHz: 'MHz',
  GHz: 'GHz',

  // Angular velocity
  'rad/s': 'rad/s',
  'deg/s': 'deg/s',
  rpm: 'rpm',

  // Time
  s: 's',
  ms: 'ms',
  min: 'min',
  minute: 'min',
  h: 'hour',
  hour: 'hour',
  hours: 'hour',
  d: 'day',
  day: 'day',
  days: 'day',
  week: 'week',
  year: 'year',

  // Volume rate
  'm3/s': 'm^3/s',
  'm³/s': 'm^3/s',
  'L/s': 'liter/s',
  'L/min': 'liter/min',
  'L/h': 'liter/hour',
  'gal/s': 'gal/s',
  'gal/min': 'gal/min',
  'gal/h': 'gal/hour',
  'gal(UK)/h': 'gallon/hour'
}

// Reverse mapping for display names
const reverseMapping: Record<string, string> = {}
for (const [key, value] of Object.entries(unitMapping)) {
  if (!reverseMapping[value]) {
    reverseMapping[value] = key
  }
}

// Common target units for each quantity kind
const _commonTargetsByKind: Record<string, string[]> = {
  speed: ['kt', 'km/h', 'mph', 'ft/s', 'm/s'],
  temperature: ['tempC', 'tempF', 'tempK'],
  pressure: ['hPa', 'mbar', 'bar', 'psi', 'inHg', 'mmHg', 'atm'],
  length: ['m', 'km', 'nmi', 'mi', 'ft', 'yd', 'cm', 'mm', 'nm', 'micrometer', 'fathom', 'in'],
  angle: ['deg', 'rad'],
  volume: ['liter', 'gal', 'qt', 'pt', 'm^3'],
  time: ['s', 'min', 'hour', 'day', 'week'],
  current: ['A', 'mA', 'kA'],
  potential: ['V', 'mV', 'kV'],
  power: ['W', 'kW', 'MW', 'hp'],
  charge: ['C', 'Ah', 'mAh'],
  frequency: ['Hz', 'kHz', 'MHz', 'GHz', 'rpm'],
  angular_velocity: ['rad/s', 'deg/s', 'rpm'],
  volumetric_flow: ['m^3/s', 'liter/s', 'liter/min', 'liter/hour', 'gal/s', 'gal/min', 'gal/hour']
}

export interface TargetUnitOption {
  unit: string // Our display name (e.g., "knots", "°C")
  qtyUnit: string // js-quantities name (e.g., "kt", "tempC")
  symbol: string // Display symbol (e.g., "kn", "°C")
  factor: number // Conversion factor
  supported: boolean // Whether js-quantities supports this
}

export interface GeneratedFormula {
  formula: string
  inverseFormula: string
  symbol: string
  factor: number
  isOffset: boolean // True for temperature conversions
  source: 'js-quantities' | 'manual'
}

/**
 * Get js-quantities unit name for our unit
 */
function getQtyUnit(unit: string): string | null {
  return unitMapping[unit] || null
}

/**
 * Get our display name from js-quantities unit
 */
function getDisplayUnit(qtyUnit: string): string {
  return reverseMapping[qtyUnit] || qtyUnit
}

/**
 * Test if a conversion is supported by js-quantities
 */
function _isConversionSupported(fromUnit: string, toUnit: string): boolean {
  try {
    const from = getQtyUnit(fromUnit)
    const to = getQtyUnit(toUnit)

    if (!from || !to) {
      return false
    }

    Qty(`1 ${from}`).to(to)
    return true
  } catch {
    return false
  }
}

/**
 * Get quantity kind for a unit
 */
function getQuantityKind(unit: string): string | null {
  try {
    const qtyUnit = getQtyUnit(unit)
    if (!qtyUnit) return null

    const qty = Qty(`1 ${qtyUnit}`)
    return qty.kind()
  } catch {
    return null
  }
}

/**
 * Get available target units for a base unit
 */
export function getAvailableTargetUnits(baseUnit: string): TargetUnitOption[] {
  const results: TargetUnitOption[] = []
  const qtyBaseUnit = getQtyUnit(baseUnit)

  if (!qtyBaseUnit) {
    return results // Base unit not supported
  }

  // Get the quantity kind
  const kind = getQuantityKind(baseUnit)
  if (!kind) {
    return results
  }

  // Get ALL units for this kind from js-quantities
  let allUnits: string[] = []
  try {
    allUnits = Qty.getUnits(kind)
  } catch {
    return results
  }

  // Test each unit
  for (const qtyTarget of allUnits) {
    try {
      const qty = Qty(`1 ${qtyBaseUnit}`)
      const converted = qty.to(qtyTarget)
      const factor = converted.scalar

      // Get display name and symbol
      const displayUnit = getDisplayUnit(qtyTarget)
      const symbol = getSymbolForUnit(displayUnit)

      results.push({
        unit: displayUnit,
        qtyUnit: qtyTarget,
        symbol,
        factor,
        supported: true
      })
    } catch {
      // Target not supported for this base unit
      continue
    }
  }

  return results
}

/**
 * Generate formula for base → target conversion
 */
export function generateFormula(baseUnit: string, targetUnit: string): GeneratedFormula | null {
  const qtyBase = getQtyUnit(baseUnit)
  const qtyTarget = getQtyUnit(targetUnit)

  if (!qtyBase || !qtyTarget) {
    return null
  }

  try {
    // Test with multiple values to detect offset conversions
    const test0 = Qty(`0 ${qtyBase}`).to(qtyTarget).scalar
    const test1 = Qty(`1 ${qtyBase}`).to(qtyTarget).scalar
    const test2 = Qty(`2 ${qtyBase}`).to(qtyTarget).scalar

    // Calculate slope and offset
    const slope = test2 - test1 // Should be same as test1 - test0 for linear
    const offset = test0 // Offset at 0

    const isOffset = Math.abs(offset) > 0.0001 // Temperature conversions

    let formula: string
    let inverseFormula: string

    if (isOffset) {
      // Offset-based conversion (temperature)
      // f(x) = slope * x + offset
      // f⁻¹(x) = (x - offset) / slope
      formula = `value * ${slope} + ${offset}`
      inverseFormula = `(value - ${offset}) / ${slope}`
    } else {
      // Simple multiplication
      const factor = test1 // Factor is same as converting 1 unit
      formula = `value * ${factor}`
      inverseFormula = `value / ${factor}`
    }

    return {
      formula,
      inverseFormula,
      symbol: getSymbolForUnit(targetUnit),
      factor: slope || test1,
      isOffset,
      source: 'js-quantities'
    }
  } catch (error) {
    return null
  }
}

/**
 * Get display symbol for a unit
 */
function getSymbolForUnit(unit: string): string {
  const symbolMap: Record<string, string> = {
    // Speed
    knots: 'kn',
    kn: 'kn',
    'km/h': 'km/h',
    mph: 'mph',
    'ft/s': 'ft/s',
    'm/s': 'm/s',

    // Temperature
    celsius: '°C',
    '°C': '°C',
    fahrenheit: '°F',
    '°F': '°F',
    kelvin: 'K',
    K: 'K',

    // Pressure
    Pa: 'Pa',
    hPa: 'hPa',
    kPa: 'kPa',
    mbar: 'mbar',
    bar: 'bar',
    psi: 'psi',
    atm: 'atm',
    inHg: 'inHg',
    mmHg: 'mmHg',

    // Distance
    m: 'm',
    km: 'km',
    nm: 'nm',
    nmi: 'nm',
    mi: 'mi',
    ft: 'ft',
    yd: 'yd',
    fathom: 'fathom',

    // Angle
    rad: 'rad',
    deg: '°',
    '°': '°',

    // Volume
    L: 'L',
    liter: 'L',
    gal: 'gal',
    'gal(UK)': 'gal(UK)',
    qt: 'qt',
    pt: 'pt',
    m3: 'm³',
    'm³': 'm³',

    // Electrical
    V: 'V',
    mV: 'mV',
    kV: 'kV',
    A: 'A',
    mA: 'mA',
    W: 'W',
    kW: 'kW',
    hp: 'hp',

    // Charge
    C: 'C',
    Ah: 'Ah',
    mAh: 'mAh',

    // Frequency
    Hz: 'Hz',
    kHz: 'kHz',
    MHz: 'MHz',
    rpm: 'rpm',

    // Time
    s: 's',
    min: 'min',
    h: 'h',
    hour: 'h',
    d: 'd',
    day: 'd'
  }

  return symbolMap[unit] || unit
}

/**
 * Get all supported quantity kinds
 */
export function getSupportedKinds(): string[] {
  try {
    // Create a sample quantity to access kinds
    const qty = Qty('1 m')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kinds = (qty.constructor as any).getKinds?.() || []
    return Array.isArray(kinds) ? kinds : []
  } catch {
    return []
  }
}
