/**
 * Conversion Stream Server
 *
 * Provides a dedicated WebSocket endpoint for streaming converted values.
 * This keeps SignalK's data tree pure (SI units only) while providing
 * real-time conversions to clients.
 */

import { ServerAPI } from '@signalk/server-api'
import { UnitsManager } from './UnitsManager'
import WebSocket from 'ws'

interface StreamClient {
  ws: WebSocket
  context: string
  subscriptions: Set<string>
}

interface SubscriptionMessage {
  context?: string
  subscribe?: Array<{
    path: string
    period?: number
    format?: string
    policy?: string
  }>
  unsubscribe?: Array<{
    path: string
  }>
}

export class ConversionStreamServer {
  private app: ServerAPI
  private unitsManager: UnitsManager
  private wss: WebSocket.Server | null = null
  private clients: Set<StreamClient> = new Set()
  private signalkWs: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(app: ServerAPI, unitsManager: UnitsManager) {
    this.app = app
    this.unitsManager = unitsManager
  }

  /**
   * Start the WebSocket server
   */
  start(httpServer: any): void {
    // Create WebSocket server on a path
    this.wss = new WebSocket.Server({
      noServer: true,
      path: '/plugins/signalk-units-preference/stream'
    })

    // Handle WebSocket upgrade requests
    httpServer.on('upgrade', (request: any, socket: any, head: any) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname

      if (pathname === '/plugins/signalk-units-preference/stream') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request)
        })
      }
    })

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleClientConnection(ws)
    })

    // Connect to SignalK WebSocket internally
    this.connectToSignalK()

    this.app.debug('Conversion stream server started on /plugins/signalk-units-preference/stream')
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    // Disconnect from SignalK
    if (this.signalkWs) {
      this.signalkWs.close()
      this.signalkWs = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Close all client connections
    for (const client of this.clients) {
      client.ws.close()
    }
    this.clients.clear()

    // Close the server
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    this.app.debug('Conversion stream server stopped')
  }

  /**
   * Connect to SignalK WebSocket internally
   */
  private connectToSignalK(): void {
    try {
      const protocol = 'ws:' // Internal connection
      const host = 'localhost'
      const port = (this.app as any).config?.settings?.port || 3000
      const wsUrl = `${protocol}//${host}:${port}/signalk/v1/stream?subscribe=none`

      this.signalkWs = new WebSocket(wsUrl)

      this.signalkWs.on('open', () => {
        this.app.debug('Connected to SignalK WebSocket')
        // Subscribe to all paths from all contexts
        this.updateSignalKSubscriptions()
      })

      this.signalkWs.on('message', (data: WebSocket.Data) => {
        try {
          const delta = JSON.parse(data.toString())
          this.handleSignalKDelta(delta)
        } catch (error) {
          this.app.error(`Error parsing SignalK delta: ${error}`)
        }
      })

      this.signalkWs.on('error', (error) => {
        this.app.error(`SignalK WebSocket error: ${error}`)
      })

      this.signalkWs.on('close', () => {
        this.app.debug('SignalK WebSocket closed, reconnecting in 5s...')
        this.signalkWs = null

        // Reconnect after 5 seconds
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connectToSignalK()
        }, 5000)
      })
    } catch (error) {
      this.app.error(`Failed to connect to SignalK: ${error}`)
    }
  }

  /**
   * Handle new client connection
   */
  private handleClientConnection(ws: WebSocket): void {
    const client: StreamClient = {
      ws,
      context: 'vessels.self',
      subscriptions: new Set()
    }

    this.clients.add(client)
    this.app.debug('New conversion stream client connected')

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message: SubscriptionMessage = JSON.parse(data.toString())
        this.handleClientMessage(client, message)
      } catch (error) {
        this.app.error(`Error parsing client message: ${error}`)
      }
    })

    ws.on('close', () => {
      this.clients.delete(client)
      this.app.debug('Conversion stream client disconnected')
      this.updateSignalKSubscriptions()
    })

    ws.on('error', (error) => {
      this.app.error(`Client WebSocket error: ${error}`)
    })
  }

  /**
   * Handle client subscription message
   */
  private handleClientMessage(client: StreamClient, message: SubscriptionMessage): void {
    if (message.context) {
      this.app.debug(`Client changed context to: ${message.context}`)
      client.context = message.context
    }

    if (message.subscribe) {
      this.app.debug(`Client subscribing to ${message.subscribe.length} paths`)
      for (const sub of message.subscribe) {
        client.subscriptions.add(sub.path)
      }
      this.app.debug(`Client now has ${client.subscriptions.size} subscriptions for context ${client.context}`)
      this.updateSignalKSubscriptions()
    }

    if (message.unsubscribe) {
      for (const unsub of message.unsubscribe) {
        client.subscriptions.delete(unsub.path)
      }
      this.updateSignalKSubscriptions()
    }
  }

  /**
   * Update SignalK subscriptions based on all clients
   */
  private updateSignalKSubscriptions(): void {
    if (!this.signalkWs || this.signalkWs.readyState !== WebSocket.OPEN) {
      return
    }

    // Collect all unique subscriptions across all clients
    const allPaths = new Set<string>()
    const allContexts = new Set<string>()

    for (const client of this.clients) {
      allContexts.add(client.context)
      for (const path of client.subscriptions) {
        allPaths.add(path)
      }
    }

    if (allPaths.size === 0) {
      return // No subscriptions yet
    }

    // Subscribe to each context separately
    for (const context of allContexts) {
      const subscriptions = Array.from(allPaths).map(path => ({
        path,
        period: 1000,
        format: 'delta',
        policy: 'instant'
      }))

      this.signalkWs.send(JSON.stringify({
        context,
        subscribe: subscriptions
      }))

      this.app.debug(`Subscribed to ${subscriptions.length} paths for context ${context}`)
    }
  }

  /**
   * Handle delta message from SignalK
   */
  private handleSignalKDelta(delta: any): void {
    if (!delta.updates || delta.updates.length === 0) {
      return
    }

    const context = delta.context || 'vessels.self'

    // Log incoming delta info
    const totalValues = delta.updates.reduce((sum: number, u: any) => sum + (u.values?.length || 0), 0)
    this.app.debug(`Received delta from context: ${context}, updates: ${delta.updates.length}, total values: ${totalValues}`)

    for (const update of delta.updates) {
      if (!update.values || update.values.length === 0) {
        continue
      }

      const convertedValues: any[] = []

      for (const pathValue of update.values) {
        const { path, value } = pathValue

        if (!path || value === undefined || value === null) {
          continue
        }

        // Skip if already converted
        if (path.endsWith('.unitsConverted')) {
          continue
        }

        try {
          // Get conversion info
          const conversion = this.unitsManager.getConversion(path)

          // Skip pass-through conversions
          if (this.isPassThrough(conversion)) {
            this.app.debug(`  Skipping pass-through for ${path}`)
            continue
          }

          // Convert the value
          const converted = this.convertValue(path, value, conversion)

          if (converted) {
            convertedValues.push({
              path,
              value: converted
            })
            this.app.debug(`  Converted ${path}: ${value} -> ${converted.value}`)
          }
        } catch (error) {
          this.app.debug(`Failed to convert ${path}: ${error}`)
        }
      }

      // Send converted values to interested clients
      if (convertedValues.length > 0) {
        const convertedDelta = {
          context,
          updates: [{
            $source: update.$source || 'units-preference',
            timestamp: update.timestamp || new Date().toISOString(),
            values: convertedValues
          }]
        }

        this.app.debug(`Broadcasting ${convertedValues.length} converted values for context ${context}`)
        this.broadcastToClients(convertedDelta, context)
      }
    }
  }

  /**
   * Check if conversion is pass-through
   */
  private isPassThrough(conversion: any): boolean {
    if (conversion.formula === 'value') {
      return true
    }

    if (conversion.targetUnit && conversion.baseUnit &&
        conversion.targetUnit === conversion.baseUnit) {
      return true
    }

    return false
  }

  /**
   * Convert a value
   */
  private convertValue(path: string, value: any, conversion: any): any | null {
    const valueType = conversion.valueType || 'unknown'

    switch (valueType) {
      case 'number':
        if (typeof value !== 'number' || !isFinite(value)) {
          return null
        }
        try {
          const result = this.unitsManager.convertValue(path, value)
          return {
            value: result.convertedValue,
            formatted: result.formatted,
            symbol: result.symbol || '',
            displayFormat: result.displayFormat,
            baseUnit: conversion.baseUnit || '',
            targetUnit: conversion.targetUnit || '',
            original: value
          }
        } catch (error) {
          return null
        }

      case 'date':
        // Handle date conversion
        let isoValue: string
        if (typeof value === 'number') {
          const normalizedBase = (conversion.baseUnit || '').toLowerCase()
          const isEpochBase = normalizedBase.includes('epoch')
          const date = new Date(value * (isEpochBase ? 1000 : 1))
          if (isNaN(date.getTime())) {
            return null
          }
          isoValue = date.toISOString()
        } else if (typeof value === 'string') {
          isoValue = value
        } else {
          return null
        }

        try {
          const result = this.unitsManager.formatDateValue(
            isoValue,
            conversion.targetUnit || '',
            conversion.dateFormat,
            conversion.useLocalTime
          )
          return {
            value: result.convertedValue,
            formatted: result.formatted,
            displayFormat: result.displayFormat,
            dateFormat: result.dateFormat,
            useLocalTime: result.useLocalTime,
            baseUnit: conversion.baseUnit || '',
            targetUnit: conversion.targetUnit || '',
            original: value
          }
        } catch (error) {
          return null
        }

      case 'boolean':
      case 'string':
      case 'object':
        // Pass-through for these types
        return {
          value,
          formatted: typeof value === 'object' ? JSON.stringify(value) : String(value),
          symbol: '',
          displayFormat: valueType,
          baseUnit: conversion.baseUnit || '',
          targetUnit: conversion.targetUnit || '',
          original: value
        }

      default:
        return null
    }
  }

  /**
   * Broadcast delta to interested clients
   */
  private broadcastToClients(delta: any, context: string): void {
    const message = JSON.stringify(delta)
    const paths = delta.updates[0]?.values.map((v: any) => v.path) || []

    this.app.debug(`Broadcasting to clients for context ${context}, paths: ${paths.join(', ')}`)
    this.app.debug(`Total clients: ${this.clients.size}`)

    let matchedClients = 0
    for (const client of this.clients) {
      this.app.debug(`  Client context: ${client.context}, subscriptions: ${client.subscriptions.size}`)

      // Only send to clients subscribed to this context
      if (client.context !== context) {
        this.app.debug(`    Context mismatch: ${client.context} !== ${context}`)
        continue
      }

      // Check if client is interested in any of these paths
      const hasInterestedPath = paths.some((path: string) => client.subscriptions.has(path))

      if (hasInterestedPath && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message)
        matchedClients++
        this.app.debug(`    Sent to client!`)
      } else {
        this.app.debug(`    No matching path or connection closed`)
      }
    }

    this.app.debug(`Sent to ${matchedClients} clients`)
  }
}
