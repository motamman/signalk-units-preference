import { ValidationError, NotFoundError, ConversionError, formatErrorResponse } from '../src/errors'

describe('Error Classes', () => {
  describe('ValidationError', () => {
    test('should create error with message', () => {
      const error = new ValidationError('Invalid input')
      expect(error.name).toBe('ValidationError')
      expect(error.message).toBe('Invalid input')
      expect(error.status).toBe(400)
    })

    test('should create error with all fields', () => {
      const error = new ValidationError(
        'Invalid input',
        'User message',
        'Resolution text'
      )
      expect(error.message).toBe('Invalid input')
      expect(error.userMessage).toBe('User message')
      expect(error.resolution).toBe('Resolution text')
    })
  })

  describe('NotFoundError', () => {
    test('should create not found error', () => {
      const error = new NotFoundError('Category', 'speed')
      expect(error.name).toBe('NotFoundError')
      expect(error.message).toBe('Category not found: speed')
      expect(error.status).toBe(404)
    })
  })

  describe('ConversionError', () => {
    test('should create conversion error', () => {
      const error = new ConversionError('Invalid conversion')
      expect(error.name).toBe('ConversionError')
      expect(error.message).toBe('Invalid conversion')
      expect(error.status).toBe(422)
    })

    test('should create conversion error with all fields', () => {
      const error = new ConversionError(
        'Cannot convert',
        'User-friendly message',
        'Try this instead'
      )
      expect(error.userMessage).toBe('User-friendly message')
      expect(error.resolution).toBe('Try this instead')
    })
  })

  describe('formatErrorResponse', () => {
    test('should format ValidationError', () => {
      const error = new ValidationError(
        'Invalid input',
        'Please check your input',
        'Use valid values'
      )
      const response = formatErrorResponse(error)

      expect(response.status).toBe(400)
      expect(response.body.error).toBe('ValidationError')
      expect(response.body.userMessage).toBe('Please check your input')
      expect(response.body.resolution).toBe('Use valid values')
    })

    test('should format NotFoundError', () => {
      const error = new NotFoundError('Pattern', 'index 5')
      const response = formatErrorResponse(error)

      expect(response.status).toBe(404)
      expect(response.body.error).toBe('NotFoundError')
      expect(response.body.message).toBe('Pattern not found: index 5')
    })

    test('should format ConversionError', () => {
      const error = new ConversionError('Bad formula')
      const response = formatErrorResponse(error)

      expect(response.status).toBe(422)
      expect(response.body.error).toBe('ConversionError')
    })

    test('should format generic Error', () => {
      const error = new Error('Something went wrong')
      const response = formatErrorResponse(error)

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('InternalError')
      expect(response.body.userMessage).toBe('An unexpected error occurred. Please try again.')
    })

    test('should format unknown error type', () => {
      const response = formatErrorResponse('String error')

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('InternalError')
      expect(response.body.userMessage).toBe('An unexpected error occurred. Please try again.')
    })

    test('should handle error without message', () => {
      const response = formatErrorResponse({})

      expect(response.status).toBe(500)
      expect(response.body.error).toBe('InternalError')
      expect(response.body.userMessage).toBe('An unexpected error occurred. Please try again.')
    })
  })
})
