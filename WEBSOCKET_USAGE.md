# WebSocket Subscription Usage Guide

## Endpoint
```
ws://host:port/plugins/signalk-units-preference/stream
```

## Features Implemented

### 1. Wildcard Path Subscriptions ✅
Subscribe to multiple paths using wildcards:

```javascript
// Subscribe to all navigation data
ws.send(JSON.stringify({
  "context": "vessels.self",
  "subscribe": [
    { "path": "navigation.*" }
  ]
}));

// Subscribe to everything
ws.send(JSON.stringify({
  "context": "vessels.self",
  "subscribe": [
    { "path": "**" }
  ]
}));

// Subscribe to specific path
ws.send(JSON.stringify({
  "context": "vessels.self",
  "subscribe": [
    { "path": "navigation.speedOverGround" }
  ]
}));
```

### 2. Wildcard Context Subscriptions ✅
Subscribe to data from multiple vessels:

```javascript
// Subscribe to ALL vessels (including AIS targets)
ws.send(JSON.stringify({
  "context": "vessels.*",
  "subscribe": [
    { "path": "navigation.position" }
  ]
}));

// This will receive deltas from:
// - vessels.self
// - vessels.urn:mrn:imo:mmsi:230029970
// - vessels.urn:mrn:imo:mmsi:367441950
// - etc.
```

### 3. Subscription Parameters ✅
Control update frequency and behavior:

```javascript
ws.send(JSON.stringify({
  "context": "vessels.self",
  "subscribe": [
    {
      "path": "navigation.speedOverGround",
      "period": 1000,        // Update every 1 second
      "minPeriod": 200,      // But no faster than 5 Hz
      "policy": "instant",   // Send immediately when value changes
      "format": "delta"      // Delta format (default)
    }
  ]
}));
```

**Policy options:**
- `instant` - Send changes immediately (respects minPeriod)
- `ideal` - Send changes immediately, resend last value if no change (default)
- `fixed` - Send at regular intervals regardless of changes

### 4. Initial Subscription via Query Parameter ✅
Auto-subscribe on connection:

```javascript
// Subscribe to all paths for self vessel
const ws = new WebSocket(
  'ws://localhost:3000/plugins/signalk-units-preference/stream?subscribe=self'
);

// Subscribe to all paths for all vessels
const ws = new WebSocket(
  'ws://localhost:3000/plugins/signalk-units-preference/stream?subscribe=all'
);

// No initial subscription (default)
const ws = new WebSocket(
  'ws://localhost:3000/plugins/signalk-units-preference/stream?subscribe=none'
);
```

### 5. Unsubscribe Operations ✅

```javascript
// Unsubscribe from specific pattern
ws.send(JSON.stringify({
  "unsubscribe": [
    { "path": "environment.*" }
  ]
}));

// Unsubscribe from everything
ws.send(JSON.stringify({
  "unsubscribe": [
    { "path": "*" }
  ]
}));
```

## Complete Examples

### Example 1: Monitor All AIS Vessels
```javascript
const ws = new WebSocket('ws://localhost:3000/plugins/signalk-units-preference/stream');

ws.onopen = () => {
  console.log('Connected!');

  // Subscribe to position data from ALL vessels
  ws.send(JSON.stringify({
    "context": "vessels.*",  // Wildcard context
    "subscribe": [
      {
        "path": "navigation.position",
        "period": 5000  // Update every 5 seconds
      },
      {
        "path": "navigation.courseOverGroundTrue",
        "period": 5000
      }
    ]
  }));
};

ws.onmessage = (event) => {
  const delta = JSON.parse(event.data);
  console.log('Received from:', delta.context);
  console.log('Values:', delta.updates[0].values);
};
```

### Example 2: High-Frequency Own Ship Data
```javascript
const ws = new WebSocket('ws://localhost:3000/plugins/signalk-units-preference/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    "context": "vessels.self",
    "subscribe": [
      {
        "path": "navigation.speedOverGround",
        "period": 100,      // 10 Hz
        "policy": "instant"
      },
      {
        "path": "navigation.headingTrue",
        "period": 100,
        "policy": "instant"
      }
    ]
  }));
};
```

### Example 3: Mixed Subscriptions
```javascript
// Different update rates for different data types
ws.send(JSON.stringify({
  "context": "vessels.self",
  "subscribe": [
    {
      "path": "navigation.*",
      "period": 100,          // Fast navigation updates
      "policy": "instant"
    },
    {
      "path": "environment.*",
      "period": 10000,        // Slow environmental updates
      "policy": "ideal"
    },
    {
      "path": "propulsion.*.temperature",
      "period": 5000,         // Medium engine temps
      "minPeriod": 1000       // But throttle to max 1 Hz
    }
  ]
}));
```

## Response Format

All responses are in SignalK delta format with converted values:

```json
{
  "context": "vessels.self",
  "updates": [
    {
      "$source": "units-preference",
      "timestamp": "2025-01-21T10:30:00.000Z",
      "values": [
        {
          "path": "navigation.speedOverGround",
          "value": {
            "converted": 5.2,
            "formatted": "5.2 kn",
            "original": 2.67
          }
        }
      ],
      "meta": [
        {
          "path": "navigation.speedOverGround",
          "value": {
            "units": "kn",
            "displayFormat": "0.0",
            "originalUnits": "m/s"
          }
        }
      ]
    }
  ]
}
```
