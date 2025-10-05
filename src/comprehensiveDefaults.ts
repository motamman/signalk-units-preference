import { UnitsMetadataStore } from './types'

/**
 * Comprehensive default unit metadata based on actual SignalK vessel data
 * Covers all common measurement types found in marine vessels
 */
export const comprehensiveDefaultUnits: UnitsMetadataStore = {
  // DISTANCE & LENGTH
  'design.length.overall': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
      nm: { formula: 'value * 0.000539957', inverseFormula: 'value * 1852', symbol: 'nm' },
      km: { formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'km' }
    }
  },
  'design.beam': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' }
    }
  },
  'design.draft.maximum': {
    baseUnit: 'm',
    category: 'depth',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' },
      fathom: { formula: 'value * 0.546807', inverseFormula: 'value * 1.8288', symbol: 'fathom' }
    }
  },
  'design.airHeight': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' }
    }
  },

  // NAVIGATION - POSITION
  'navigation.position.latitude': {
    baseUnit: 'deg',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '°' },
      rad: { formula: 'value * 0.0174533', inverseFormula: 'value * 57.2958', symbol: 'rad' }
    }
  },
  'navigation.position.longitude': {
    baseUnit: 'deg',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '°' },
      rad: { formula: 'value * 0.0174533', inverseFormula: 'value * 57.2958', symbol: 'rad' }
    }
  },
  'navigation.position.altitude': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' }
    }
  },

  // NAVIGATION - HEADING & COURSE
  'navigation.headingMagnetic': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.headingTrue': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.courseOverGroundTrue': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.courseOverGroundMagnetic': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.magneticVariation': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },

  // NAVIGATION - ATTITUDE
  'navigation.attitude.roll': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.attitude.pitch': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'navigation.attitude.yaw': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },

  // NAVIGATION - SPEED
  'navigation.speedOverGround': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' },
      'm/s': { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm/s' }
    }
  },

  // NAVIGATION - GNSS
  'navigation.gnss.antennaAltitude': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' }
    }
  },
  'navigation.gnss.differentialAge': {
    baseUnit: 's',
    category: 'time',
    conversions: {
      s: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 's' },
      min: { formula: 'value / 60', inverseFormula: 'value * 60', symbol: 'min' },
      h: { formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'h' }
    }
  },

  // WIND
  'environment.wind.speedApparent': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' },
      'm/s': { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm/s' },
      Beaufort: {
        formula: 'Math.pow(value / 0.836, 2/3)',
        inverseFormula: '0.836 * Math.pow(value, 1.5)',
        symbol: 'Bf'
      }
    }
  },
  'environment.wind.speedTrue': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' },
      'm/s': { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm/s' }
    }
  },
  'environment.wind.speedOverGround': {
    baseUnit: 'm/s',
    category: 'speed',
    conversions: {
      knots: { formula: 'value * 1.94384', inverseFormula: 'value * 0.514444', symbol: 'kn' },
      'km/h': { formula: 'value * 3.6', inverseFormula: 'value * 0.277778', symbol: 'km/h' },
      mph: { formula: 'value * 2.23694', inverseFormula: 'value * 0.44704', symbol: 'mph' },
      'm/s': { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm/s' }
    }
  },
  'environment.wind.angleApparent': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'environment.wind.angleTrueWater': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'environment.wind.angleTrueGround': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'environment.wind.directionTrue': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },
  'environment.wind.directionMagnetic': {
    baseUnit: 'rad',
    category: 'angle',
    conversions: {
      deg: { formula: 'value * 57.2958', inverseFormula: 'value * 0.0174533', symbol: '°' },
      rad: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'rad' }
    }
  },

  // WEATHER - TEMPERATURE
  'environment.outside.tempest.observations.airTemperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },
  'environment.outside.tempest.observations.feelsLike': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },

  // WEATHER - PRESSURE
  'environment.outside.tempest.observations.stationPressure': {
    baseUnit: 'Pa',
    category: 'pressure',
    conversions: {
      hPa: { formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'hPa' },
      mbar: { formula: 'value * 0.01', inverseFormula: 'value * 100', symbol: 'mbar' },
      inHg: { formula: 'value * 0.0002953', inverseFormula: 'value * 3386.39', symbol: 'inHg' },
      mmHg: { formula: 'value * 0.00750062', inverseFormula: 'value * 133.322', symbol: 'mmHg' },
      psi: { formula: 'value * 0.000145038', inverseFormula: 'value * 6894.76', symbol: 'psi' },
      Pa: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'Pa' }
    }
  },

  // WEATHER - HUMIDITY
  'environment.outside.tempest.observations.relativeHumidity': {
    baseUnit: 'ratio',
    category: 'percentage',
    conversions: {
      percent: { formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' },
      ratio: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '' }
    }
  },

  // WAVES
  'environment.wave.height': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' }
    }
  },
  'environment.wave.period': {
    baseUnit: 's',
    category: 'time',
    conversions: {
      s: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 's' }
    }
  },
  'environment.heave': {
    baseUnit: 'm',
    category: 'distance',
    conversions: {
      m: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm' },
      ft: { formula: 'value * 3.28084', inverseFormula: 'value * 0.3048', symbol: 'ft' }
    }
  },

  // PROPULSION - ENGINE
  'propulsion.engine.*.revolutions': {
    baseUnit: 'Hz',
    category: 'frequency',
    conversions: {
      rpm: { formula: 'value * 60', inverseFormula: 'value / 60', symbol: 'rpm' },
      Hz: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'Hz' }
    }
  },
  'propulsion.engine.*.coolant.temperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },
  'propulsion.*.fuel.rate': {
    baseUnit: 'm3/s',
    category: 'volumeRate',
    conversions: {
      'L/h': { formula: 'value * 3600000', inverseFormula: 'value / 3600000', symbol: 'L/h' },
      'gal/h': { formula: 'value * 951019', inverseFormula: 'value / 951019', symbol: 'gal/h' },
      'gal(UK)/h': {
        formula: 'value * 791888.4',
        inverseFormula: 'value / 791888.4',
        symbol: 'gal(UK)/h'
      },
      'm3/s': { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm³/s' }
    }
  },

  // TANKS
  'tanks.*.*.apparent.currentVolume': {
    baseUnit: 'm3',
    category: 'volume',
    conversions: {
      L: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'L' },
      gal: { formula: 'value * 264.172', inverseFormula: 'value * 0.00378541', symbol: 'gal' },
      'gal(UK)': {
        formula: 'value * 219.969',
        inverseFormula: 'value * 0.00454609',
        symbol: 'gal(UK)'
      },
      m3: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm³' }
    }
  },
  'tanks.*.*.capacity': {
    baseUnit: 'm3',
    category: 'volume',
    conversions: {
      L: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'L' },
      gal: { formula: 'value * 264.172', inverseFormula: 'value * 0.00378541', symbol: 'gal' },
      'gal(UK)': {
        formula: 'value * 219.969',
        inverseFormula: 'value * 0.00454609',
        symbol: 'gal(UK)'
      },
      m3: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'm³' }
    }
  },
  'tanks.*.*.apparent.currentLevel': {
    baseUnit: 'ratio',
    category: 'percentage',
    conversions: {
      percent: { formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' },
      ratio: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '' }
    }
  },

  // ELECTRICAL - BATTERIES
  'electrical.batteries.*.voltage': {
    baseUnit: 'V',
    category: 'voltage',
    conversions: {
      V: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'V' },
      mV: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mV' }
    }
  },
  'electrical.batteries.*.current': {
    baseUnit: 'A',
    category: 'current',
    conversions: {
      A: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'A' },
      mA: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mA' }
    }
  },
  'electrical.batteries.*.power': {
    baseUnit: 'W',
    category: 'power',
    conversions: {
      W: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'W' },
      kW: { formula: 'value * 0.001', inverseFormula: 'value * 1000', symbol: 'kW' },
      hp: { formula: 'value * 0.00134102', inverseFormula: 'value * 745.7', symbol: 'hp' }
    }
  },
  'electrical.batteries.*.temperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },
  'electrical.batteries.*.capacity.stateOfCharge': {
    baseUnit: 'ratio',
    category: 'percentage',
    conversions: {
      percent: { formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' },
      ratio: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '' }
    }
  },
  'electrical.batteries.*.capacity.timeRemaining': {
    baseUnit: 's',
    category: 'time',
    conversions: {
      s: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 's' },
      min: { formula: 'value / 60', inverseFormula: 'value * 60', symbol: 'min' },
      h: { formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'h' },
      days: { formula: 'value / 86400', inverseFormula: 'value * 86400', symbol: 'd' }
    }
  },
  'electrical.batteries.*.capacity.consumedCharge': {
    baseUnit: 'C',
    category: 'charge',
    conversions: {
      C: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'C' },
      Ah: { formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'Ah' },
      mAh: { formula: 'value / 3.6', inverseFormula: 'value * 3.6', symbol: 'mAh' }
    }
  },
  'electrical.batteries.*.lifetimeDischarge': {
    baseUnit: 'C',
    category: 'charge',
    conversions: {
      C: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'C' },
      Ah: { formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'Ah' },
      kAh: { formula: 'value / 3600000', inverseFormula: 'value * 3600000', symbol: 'kAh' }
    }
  },

  // SOLAR
  'electrical.solar.*.panelVoltage': {
    baseUnit: 'V',
    category: 'voltage',
    conversions: {
      V: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'V' },
      mV: { formula: 'value * 1000', inverseFormula: 'value * 0.001', symbol: 'mV' }
    }
  },

  // ENVIRONMENT - TEMPERATURE (CPU/GPU)
  'environment.rpi.cpu.temperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },
  'environment.rpi.gpu.temperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },

  // SYSTEM METRICS
  'environment.rpi.uptime': {
    baseUnit: 's',
    category: 'time',
    conversions: {
      s: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 's' },
      min: { formula: 'value / 60', inverseFormula: 'value * 60', symbol: 'min' },
      h: { formula: 'value / 3600', inverseFormula: 'value * 3600', symbol: 'h' },
      days: { formula: 'value / 86400', inverseFormula: 'value * 86400', symbol: 'd' }
    }
  },
  'environment.rpi.cpu.utilisation': {
    baseUnit: 'ratio',
    category: 'percentage',
    conversions: {
      percent: { formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' },
      ratio: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '' }
    }
  },
  'environment.rpi.memory.utilisation': {
    baseUnit: 'ratio',
    category: 'percentage',
    conversions: {
      percent: { formula: 'value * 100', inverseFormula: 'value * 0.01', symbol: '%' },
      ratio: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: '' }
    }
  },

  // NETWORK TEMPERATURE
  'network.wlan.*.status.devTemperature': {
    baseUnit: 'K',
    category: 'temperature',
    conversions: {
      celsius: { formula: 'value - 273.15', inverseFormula: 'value + 273.15', symbol: '°C' },
      fahrenheit: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F'
      },
      kelvin: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'K' }
    }
  },

  // SPECIAL - TABULA RASA (blank slate for custom transformations)
  'tabula-rasa': {
    baseUnit: 'tr',
    category: 'unitless',
    conversions: {
      tr: { formula: 'value * 1', inverseFormula: 'value * 1', symbol: 'tr' }
    }
  }
}
