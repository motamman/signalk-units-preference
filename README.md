# SignalK Units Preference Manager

A SignalK server plugin for managing unit conversions and display preferences across all data paths.

## Features

- **Dual metadata layer**: Supports native SignalK units and custom units for non-standard paths
- **Category-level preferences**: Set default units for categories (speed, temperature, etc.)
- **Path-specific overrides**: Override category defaults for specific paths (e.g., mm for rainfall vs km for distance)
- **Bidirectional conversion**: Provides both forward and inverse conversion factors
- **Custom conversions**: Add your own conversion factors for any path
- **REST API**: Full REST API for integration with other apps
- **Web UI**: Easy-to-use web interface for managing preferences

## Installation

```bash
npm install
npm run build
```

## Usage

### API Endpoints

#### Get conversion for a path
```
GET /plugins/signalk-units-preference/conversion/:path
```

Example response:
```json
{
  "path": "navigation.speedOverGround",
  "baseUnit": "m/s",
  "targetUnit": "knots",
  "factor": 1.94384,
  "inverseFactor": 0.514444,
  "displayFormat": "0.0",
  "symbol": "kn",
  "category": "speed"
}
```

#### Get all preferences
```
GET /plugins/signalk-units-preference/preferences
```

#### Update category preference
```
PUT /plugins/signalk-units-preference/preferences/category/:category
```

Body:
```json
{
  "targetUnit": "knots",
  "displayFormat": "0.0"
}
```

#### Add path override
```
PUT /plugins/signalk-units-preference/preferences/path/:path
```

Body:
```json
{
  "targetUnit": "mm",
  "displayFormat": "0"
}
```

#### Get all metadata
```
GET /plugins/signalk-units-preference/metadata
```

#### Add custom conversion
```
POST /plugins/signalk-units-preference/conversion/:path/:unit
```

Body:
```json
{
  "factor": 1.94384,
  "symbol": "kn",
  "inverseFactor": 0.514444
}
```

## Supported Units

The plugin includes conversions for all standard SignalK units:

- **Speed**: m/s, knots, km/h, mph
- **Temperature**: K, °C, °F
- **Pressure**: Pa, hPa, mbar, inHg, mmHg, psi
- **Distance**: m, km, nm, mi, ft, yd
- **Depth**: m, ft, fathom
- **Angle**: rad, deg
- **Volume**: m³, L, gal, gal(UK)
- **Electrical**: V, A, W, kW, hp
- **And more...**

## Web UI

Access the web interface at: `http://your-signalk-server:3000/signalk-units-preference`

The UI allows you to:
- Set category-level preferences
- Add and manage path-specific overrides
- View all metadata and available conversions

## License

Apache-2.0
