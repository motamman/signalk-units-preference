import { UnitsMetadataStore } from './types'

/**
 * Default unit metadata based on SignalK specification
 * Extracted from https://signalk.org/specification/1.7.0/doc/vesselsBranch.html
 */
export const defaultUnitsMetadata: UnitsMetadataStore = {
  // SPEED
  'navigation.speedOverGround': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' }
    }
  },
  'navigation.speedThroughWater': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' }
    }
  },

  // TEMPERATURE
  'environment.outside.temperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: { formula: '(value - 273.15) * 9/5 + 32', inverseFormula: '(value - 32) * 5/9 + 273.15', symbol: '°F' }
    }
  },
  'environment.water.temperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: { formula: '(value - 273.15) * 9/5 + 32', inverseFormula: '(value - 32) * 5/9 + 273.15', symbol: '°F' }
    }
  },

  // PRESSURE
  'environment.outside.pressure': {
    baseUnit: 'Pa',
    category: 'pressure',
    conversions: {
      hPa: { formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'hPa' },
      mbar: { formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'mbar' },
      inHg: { formula: 'value * 0.0002953', inverseFormula: 'value * 3386.39', symbol: 'inHg' },
      mmHg: { formula: 'value * 0.00750062', inverseFormula: 'value * 133.322', symbol: 'mmHg' },
      psi: { formula: 'value * 0.000145038', inverseFormula: 'value * 6894.76', symbol: 'psi' }
    }
  },

  // DISTANCE
  'navigation.courseGreatCircle.nextPoint.distance': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      km: { formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'km' },
      nm: { formula: 'value * 0.000539957', inverseFormula: 'value * 1852', symbol: 'nm' },
      mi: { formula: 'value * 0.000621371', inverseFormula: 'value * 1609.34', symbol: 'mi' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
      yd: { formula: 'value * 1.09361', inverseFormula: 'value * 0.9144', symbol: 'yd' }
    }
  },

  // DEPTH
  'environment.depth.belowKeel': {
    baseUnit: 'm',
    category: 'depth',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
      fathom: { formula: 'value * 0.546807', inverseFormula: 'value * 1.8288', symbol: 'fathom' }
    }
  },
  'environment.depth.belowTransducer': {
    baseUnit: 'm',
    category: 'depth',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
      fathom: { formula: 'value * 0.546807', inverseFormula: 'value * 1.8288', symbol: 'fathom' }
    }
  },

  // ANGLE (navigation)
  'navigation.headingTrue': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.headingMagnetic': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },

  // VOLUME
  'tanks.fuel.0.currentVolume': {
    baseUnit: 'm3',
    category: 'volume',
    conversions: {
      L: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'L' },
      gal: { formula: 'value * 264.172', inverseFormula: 'value * 0.00378541', symbol: 'gal' },
      'gal(UK)': { formula: 'value * 219.969', inverseFormula: 'value * 0.00454609', symbol: 'gal(UK)' }
    }
  },

  // ELECTRICAL - VOLTAGE
  'electrical.batteries.0.voltage': {
    baseUnit: 'V',
    category: 'voltage',
    conversions: {
      V: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'V' },
      mV: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mV' }
    }
  },

  // ELECTRICAL - CURRENT
  'electrical.batteries.0.current': {
    baseUnit: 'A',
    category: 'current',
    conversions: {
      A: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'A' },
      mA: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mA' }
    }
  },

  // ELECTRICAL - POWER
  'electrical.solar.0.panelPower': {
    baseUnit: 'W',
    category: 'power',
    conversions: {
      W: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'W' },
      kW: { formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'kW' },
      hp: { formula: 'value * 0.00134102', inverseFormula: 'value * 745.7', symbol: 'hp' }
    }
  },

  // DATE/TIME
  'navigation.datetime': {
    baseUnit: 'RFC 3339 (UTC)',
    category: 'dateTime',
    conversions: {
      'short-date': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'short-date' },
      'short-date-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'short-date', useLocalTime: true },
      'long-date': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'long-date' },
      'long-date-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'long-date', useLocalTime: true },
      'dd/mm/yyyy': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'dd/mm/yyyy' },
      'dd/mm/yyyy-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'dd/mm/yyyy', useLocalTime: true },
      'mm/dd/yyyy': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'mm/dd/yyyy' },
      'mm/dd/yyyy-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'mm/dd/yyyy', useLocalTime: true },
      'mm/yyyy': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'mm/yyyy' },
      'mm/yyyy-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'mm/yyyy', useLocalTime: true },
      'time-24hrs': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'time-24hrs' },
      'time-24hrs-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'time-24hrs', useLocalTime: true },
      'time-am/pm': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'time-am/pm' },
      'time-am/pm-local': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'time-am/pm', useLocalTime: true },
      'epoch-seconds': { formula: 'value', inverseFormula: 'value', symbol: '', dateFormat: 'epoch-seconds' }
    }
  },

  // WIND SPEED
  'environment.wind.speedApparent': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' },
      'Beaufort': { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'Bf' }
    }
  },

  // RATIO (percentage)
  'electrical.batteries.0.capacity.stateOfCharge': {
    baseUnit: 'ratio',
    category: 'percentage',
    conversions: {
      percent: { formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' },
      ratio: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '' }
    }
  }
}

/**
 * Category to base unit mapping
 */
export const categoryToBaseUnit: Record<string, string> = {
  speed: 'm/s',
  temperature: 'K',
  pressure: 'Pa',
  distance: 'm',
  depth: 'm',
  angle: 'rad',
  angularVelocity: 'rad/s',
  volume: 'm3',
  voltage: 'V',
  current: 'A',
  power: 'W',
  percentage: 'ratio',
  frequency: 'Hz',
  time: 's',
  charge: 'C',
  volumeRate: 'm3/s',
  length: 'm',
  dateTime: 'RFC 3339 (UTC)'
}
