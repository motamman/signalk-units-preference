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
  private sendMeta: boolean
  private wss: WebSocket.Server | null = null
  private clients: Set<StreamClient> = new Set()
  private signalkWs: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pendingSubscriptionUpdate: boolean = false // Track if subscriptions need updating when connection opens
  private httpServer: any = null
  private upgradeHandler: ((request: any, socket: any, head: any) => void) | null = null

  constructor(app: ServerAPI, unitsManager: UnitsManager, sendMeta: boolean = true) {
    this.app = app
    this.unitsManager = unitsManager
    this.sendMeta = sendMeta
  }

  /**
   * Start the WebSocket server
   */
  start(httpServer: any): void {
    // Save httpServer reference for cleanup
    this.httpServer = httpServer

    // Create WebSocket server on a path
    this.wss = new WebSocket.Server({
      noServer: true,
      path: '/plugins/signalk-units-preference/stream'
    })

    // Handle WebSocket upgrade requests
    this.upgradeHandler = (request: any, socket: any, head: any) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname

      if (pathname === '/plugins/signalk-units-preference/stream') {
        // Log the upgrade attempt
        this.app.debug(`WebSocket upgrade request received for ${pathname}`)
        this.app.debug(`  Headers: ${JSON.stringify(request.headers)}`)

        // Check if wss is still available (server might be stopping)
        if (!this.wss) {
          this.app.debug('WebSocket server is not available, rejecting upgrade')
          socket.destroy()
          return
        }

        // Accept all connections (authentication happens at SignalK level)
        // The Authorization header is checked by SignalK's security middleware
        // during the HTTP upgrade process
        this.wss.handleUpgrade(request, socket, head, ws => {
          this.app.debug('WebSocket upgrade successful, emitting connection event')
          if (this.wss) {
            this.wss.emit('connection', ws, request)
          }
        })
      }
    }

    httpServer.on('upgrade', this.upgradeHandler)

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
    // Remove upgrade event handler from HTTP server to prevent race conditions
    if (this.httpServer && this.upgradeHandler) {
      this.httpServer.removeListener('upgrade', this.upgradeHandler)
      this.app.debug('Removed upgrade event handler from HTTP server')
      this.upgradeHandler = null
      this.httpServer = null
    }

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

        // Log if there were pending subscription updates
        if (this.pendingSubscriptionUpdate) {
          this.app.debug(
            `Processing ${this.clients.size} client(s) with pending subscription updates`
          )
        }

        // Always process subscriptions when connection opens
        // This handles subscriptions that arrived before the connection was ready
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

      this.signalkWs.on('error', error => {
        this.app.error(`SignalK WebSocket error: ${error}`)
      })

      this.signalkWs.on('close', () => {
        this.app.debug('SignalK WebSocket closed, reconnecting in 5s...')
        this.signalkWs = null

        // Mark that subscriptions need to be resent when reconnected
        if (this.clients.size > 0) {
          this.pendingSubscriptionUpdate = true
          this.app.debug(`${this.clients.size} client(s) will be resubscribed after reconnection`)
        }

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

    ws.on('error', error => {
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

    // IMPORTANT: Process unsubscribe BEFORE subscribe
    // This allows clients to clear all subscriptions and then add new ones atomically
    if (message.unsubscribe) {
      this.app.debug(`Client unsubscribing from ${message.unsubscribe.length} paths`)
      for (const unsub of message.unsubscribe) {
        client.subscriptions.delete(unsub.path)
      }
    }

    if (message.subscribe) {
      this.app.debug(`Client subscribing to ${message.subscribe.length} paths`)
      for (const sub of message.subscribe) {
        client.subscriptions.add(sub.path)
      }
    }

    // Update SignalK subscriptions and log final state
    if (message.subscribe || message.unsubscribe) {
      this.app.debug(
        `Client now has ${client.subscriptions.size} subscriptions for context ${client.context}`
      )
      this.updateSignalKSubscriptions()
    }
  }

  /**
   * Update SignalK subscriptions based on all clients
   */
  private updateSignalKSubscriptions(): void {
    // Check if internal SignalK connection is ready
    if (!this.signalkWs || this.signalkWs.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptionUpdate = true
      this.app.debug(
        'SignalK WebSocket not ready - subscriptions will be processed when connection opens'
      )
      return
    }

    // Clear pending flag - we're processing now
    this.pendingSubscriptionUpdate = false

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
      this.app.debug('No client subscriptions to process')
      return // No subscriptions yet
    }

    this.app.debug(
      `Processing subscriptions from ${this.clients.size} client(s): ${allPaths.size} unique paths across ${allContexts.size} context(s)`
    )

    // Subscribe to each context separately
    for (const context of allContexts) {
      const subscriptions = Array.from(allPaths).map(path => ({
        path,
        period: 1000,
        format: 'delta',
        policy: 'instant'
      }))

      this.signalkWs.send(
        JSON.stringify({
          context,
          subscribe: subscriptions
        })
      )

      this.app.debug(
        `✓ Subscribed to ${subscriptions.length} paths for context ${context} on internal SignalK stream`
      )
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

    // CRITICAL: Check if ANY client is interested in this context BEFORE processing
    // This prevents wasting CPU on AIS targets when clients only want vessels.self
    const hasInterestedClient = Array.from(this.clients).some(
      client => client.context === context
    )
    if (!hasInterestedClient) {
      // Don't even log - this would spam for every AIS target
      return
    }

    // Log incoming delta info
    const totalValues = delta.updates.reduce(
      (sum: number, u: any) => sum + (u.values?.length || 0),
      0
    )
    this.app.debug(
      `Received delta from context: ${context}, updates: ${delta.updates.length}, total values: ${totalValues}`
    )

    for (const update of delta.updates) {
      if (!update.values || update.values.length === 0) {
        continue
      }

      const convertedValues: any[] = []
      const metadataEntries: any[] = []

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

          // Try to convert the value
          let converted = this.convertValue(path, value)

          // If conversion failed or is pass-through, send original value as-is
          if (!converted) {
            this.app.debug(`  No conversion for ${path}, sending original value`)
            converted = {
              converted: value,
              formatted: typeof value === 'object' ? JSON.stringify(value) : String(value),
              original: value
            }
          }

          // Send converted value at the ORIGINAL path (not .unitsConverted)
          // This dedicated stream is meant to provide converted values transparently
          convertedValues.push({
            path: path, // Use original path, NOT path.unitsConverted
            value: converted
          })

          // Build metadata entry if sendMeta is enabled
          if (this.sendMeta) {
            metadataEntries.push({
              path: path, // Metadata for original path
              value: this.buildMetadata(path, conversion)
            })
          }

          this.app.debug(`  Converted ${path}: ${value} -> ${converted.converted}`)
        } catch (error) {
          this.app.debug(`Failed to convert ${path}: ${error}`)
          // Even on error, send the original value through
          const converted = {
            converted: value,
            formatted: typeof value === 'object' ? JSON.stringify(value) : String(value),
            original: value
          }
          convertedValues.push({
            path: path,
            value: converted
          })
        }
      }

      // Send converted values to interested clients
      if (convertedValues.length > 0) {
        const deltaUpdate: any = {
          $source: update.$source || 'units-preference',
          timestamp: update.timestamp || new Date().toISOString(),
          values: convertedValues
        }

        // Add metadata if we have any
        if (metadataEntries.length > 0) {
          deltaUpdate.meta = metadataEntries
        }

        const convertedDelta = {
          context,
          updates: [deltaUpdate]
        }

        this.app.debug(
          `Broadcasting ${convertedValues.length} converted values for context ${context}`
        )
        this.broadcastToClients(convertedDelta, context)
      }
    }
  }

  /**
   * Build metadata for a converted path (SignalK meta format)
   */
  private buildMetadata(originalPath: string, conversion: any): any {
    return {
      units: conversion.targetUnit || conversion.symbol || '',
      displayFormat: conversion.displayFormat || '0.0',
      description: `${originalPath} (converted from ${conversion.baseUnit || 'base unit'})`,
      originalUnits: conversion.baseUnit || '',
      displayName: conversion.symbol
        ? `${originalPath.split('.').pop()} (${conversion.symbol})`
        : undefined
    }
  }

  /**
   * Convert a value using the UNIFIED conversion method
   */
  private convertValue(path: string, value: any): any | null {
    try {
      // Use the UNIFIED conversion method - ONE source of truth!
      const result = this.unitsManager.convertPathValue(path, value)
      return {
        converted: result.converted,
        formatted: result.formatted,
        original: result.original
      }
    } catch (error) {
      this.app.debug(`Conversion failed for ${path}: ${error}`)
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
      this.app.debug(
        `  Client context: ${client.context}, subscriptions: ${client.subscriptions.size}`
      )

      // Only send to clients subscribed to this context
      if (client.context !== context) {
        this.app.debug(`    Context mismatch: ${client.context} !== ${context}`)
        continue
      }

      // Check if client is interested in any of these paths
      // Clients subscribe to paths and receive converted values at the SAME paths
      const hasInterestedPath = paths.some((path: string) => {
        const isSubscribed = client.subscriptions.has(path)
        if (isSubscribed) {
          this.app.debug(`    Client subscribed to ${path}`)
        }
        return isSubscribed
      })

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
