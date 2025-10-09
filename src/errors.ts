/**
 * Standardized error classes for SignalK Units Preference Plugin
 *
 * Error Hierarchy:
 * - PluginError (base class with HTTP status code)
 *   - ValidationError (400 Bad Request)
 *   - ConversionError (422 Unprocessable Entity)
 *   - NotFoundError (404 Not Found)
 *
 * All errors include:
 * - message: Human-readable error description
 * - status: HTTP status code for API responses
 * - userMessage: User-friendly message for frontend display
 * - resolution: Optional steps to fix the error
 */

/**
 * Base error class for all plugin errors
 */
export class PluginError extends Error {
  status: number
  userMessage: string
  resolution?: string

  constructor(
    message: string,
    status: number,
    userMessage?: string,
    resolution?: string
  ) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.userMessage = userMessage || message
    this.resolution = resolution
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      userMessage: this.userMessage,
      resolution: this.resolution,
      status: this.status
    }
  }
}

/**
 * ValidationError - 400 Bad Request
 * Used for invalid input, missing required fields, type mismatches
 */
export class ValidationError extends PluginError {
  constructor(message: string, userMessage?: string, resolution?: string) {
    super(
      message,
      400,
      userMessage || 'Invalid input provided',
      resolution || 'Please check your input and try again'
    )
  }
}

/**
 * ConversionError - 422 Unprocessable Entity
 * Used for unit conversion failures, formula evaluation errors
 */
export class ConversionError extends PluginError {
  constructor(message: string, userMessage?: string, resolution?: string) {
    super(
      message,
      422,
      userMessage || 'Unable to convert units',
      resolution || 'Check that the conversion formula is valid and the value is within acceptable range'
    )
  }
}

/**
 * NotFoundError - 404 Not Found
 * Used when requested resource doesn't exist
 */
export class NotFoundError extends PluginError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`

    const userMessage = identifier
      ? `Could not find ${resource.toLowerCase()}: "${identifier}"`
      : `The requested ${resource.toLowerCase()} was not found`

    const resolution = `Verify the ${resource.toLowerCase()} exists and try again`

    super(message, 404, userMessage, resolution)
  }
}

/**
 * Helper function to create a bad request error (for backward compatibility)
 * @deprecated Use ValidationError instead
 */
export function createBadRequestError(message: string): PluginError {
  return new ValidationError(message)
}

/**
 * Type guard to check if error is a PluginError
 */
export function isPluginError(error: unknown): error is PluginError {
  return error instanceof PluginError
}

/**
 * Format error for HTTP response
 */
export function formatErrorResponse(error: unknown): {
  status: number
  body: {
    error: string
    message: string
    userMessage: string
    resolution?: string
  }
} {
  if (isPluginError(error)) {
    return {
      status: error.status,
      body: error.toJSON()
    }
  }

  // Handle unknown errors
  const message = error instanceof Error ? error.message : 'An unknown error occurred'
  return {
    status: 500,
    body: {
      error: 'InternalError',
      message,
      userMessage: 'An unexpected error occurred. Please try again.',
      resolution: 'If the problem persists, check the server logs for more details'
    }
  }
}
