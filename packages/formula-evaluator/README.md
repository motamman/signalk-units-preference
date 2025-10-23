# @signalk/formula-evaluator

A safe formula evaluator for unit conversions using mathjs. This library provides secure mathematical expression evaluation without code injection risks, along with duration formatting utilities.

## Installation

```bash
npm install @signalk/formula-evaluator
```

## Usage

### Basic Formula Evaluation

```typescript
import { evaluateFormula } from '@signalk/formula-evaluator'

// Simple mathematical operations
const result1 = evaluateFormula('value * 2 + 10', 5) // Returns: 20
const result2 = evaluateFormula('value / 1000', 2500) // Returns: 2.5
const result3 = evaluateFormula('sqrt(value)', 16) // Returns: 4

// More complex formulas
const celsius = evaluateFormula('(value - 32) * 5/9', 100) // Convert Fahrenheit to Celsius
```

### Duration Formatting

The library includes several duration formatting functions that can be called through formulas:

```typescript
import { evaluateFormula } from '@signalk/formula-evaluator'

// Format 3725 seconds (1h 2m 5s) in different ways
const dhms = evaluateFormula('formatDurationDHMS(value)', 3725) // "00:01:02:05"
const hms = evaluateFormula('formatDurationHMS(value)', 3725) // "01:02:05"
const ms = evaluateFormula('formatDurationMS(value)', 125) // "02:05"
const verbose = evaluateFormula('formatDurationVerbose(value)', 3725) // "1 hour 2 minutes 5 seconds"
const compact = evaluateFormula('formatDurationCompact(value)', 3725) // "1h 2m"
```

### Direct Duration Formatting Functions

You can also use the duration formatting functions directly:

```typescript
import { 
  formatDurationDHMS,
  formatDurationHMS,
  formatDurationVerbose,
  formatDurationCompact
} from '@signalk/formula-evaluator'

const seconds = 3725
console.log(formatDurationDHMS(seconds)) // "00:01:02:05"
console.log(formatDurationHMS(seconds)) // "01:02:05" 
console.log(formatDurationVerbose(seconds)) // "1 hour 2 minutes 5 seconds"
console.log(formatDurationCompact(seconds)) // "1h 2m"
```

## API Reference

### `evaluateFormula(formula: string, value: number): number | string`

Safely evaluates a mathematical formula with the given value.

**Parameters:**
- `formula` - The mathematical expression to evaluate. Use `value` as the variable name.
- `value` - The numeric value to substitute in the formula.

**Returns:**
- `number` for mathematical operations
- `string` for duration formatting functions

**Throws:**
- `Error` if the input value is invalid
- `Error` if the formula is malformed or unsafe
- `Error` if the result is not a finite number (for mathematical operations)

### Duration Formatting Functions

All duration functions accept a `totalSeconds` parameter and return a formatted string:

- `formatDurationDHMS(totalSeconds)` - Format as "DD:HH:MM:SS"
- `formatDurationHMS(totalSeconds)` - Format as "HH:MM:SS"
- `formatDurationHMSMillis(totalSeconds)` - Format as "HH:MM:SS.mmm"
- `formatDurationMS(totalSeconds)` - Format as "MM:SS"
- `formatDurationMSMillis(totalSeconds)` - Format as "MM:SS.mmm"
- `formatDurationVerbose(totalSeconds)` - Format as "X days Y hours Z minutes"
- `formatDurationCompact(totalSeconds)` - Format as "Xd Yh" or "Xh Ym" etc.

## Safety

This library uses [mathjs](https://mathjs.org/) in a sandboxed mode to safely evaluate mathematical expressions. The evaluation environment:

- Has no access to JavaScript's global scope
- Cannot execute arbitrary code
- Only supports mathematical operations and functions
- Validates all inputs and outputs

## License

MIT

## Contributing

This package is part of the [signalk-units-preference](https://github.com/motamman/signalk-units-preference) project.