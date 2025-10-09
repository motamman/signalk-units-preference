/**
 * Stream Viewer Module
 * Handles WebSocket connection to SignalK delta stream and displays converted values
 */

let streamWebSocket = null;
let streamDataMap = new Map(); // Store path data for display
let isStreamConnected = false;
let reconnectTimeout = null;

/**
 * Connect to SignalK WebSocket stream
 */
function connectToStream() {
    if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
        console.log('Already connected to stream');
        return;
    }

    updateStreamStatus('Connecting...', '#ffc107');

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/signalk/v1/stream?subscribe=none`;

    try {
        streamWebSocket = new WebSocket(wsUrl);

        streamWebSocket.onopen = () => {
            console.log('Stream connected');
            isStreamConnected = true;
            updateStreamStatus('Connected', '#4caf50');

            // Show/hide buttons
            document.getElementById('streamConnectBtn').style.display = 'none';
            document.getElementById('streamDisconnectBtn').style.display = 'inline-block';

            // Subscribe to all paths with unitsConverted suffix
            subscribeToConvertedPaths();
        };

        streamWebSocket.onmessage = (event) => {
            try {
                const delta = JSON.parse(event.data);
                handleDeltaMessage(delta);
            } catch (error) {
                console.error('Error parsing delta message:', error);
            }
        };

        streamWebSocket.onerror = (error) => {
            console.error('Stream error:', error);
            updateStreamStatus('Error', '#e74c3c');
        };

        streamWebSocket.onclose = () => {
            console.log('Stream disconnected');
            isStreamConnected = false;
            updateStreamStatus('Disconnected', '#6c757d');

            // Show/hide buttons
            document.getElementById('streamConnectBtn').style.display = 'inline-block';
            document.getElementById('streamDisconnectBtn').style.display = 'none';

            // Auto-reconnect after 5 seconds if not manually disconnected
            if (streamWebSocket && reconnectTimeout === null) {
                reconnectTimeout = setTimeout(() => {
                    reconnectTimeout = null;
                    console.log('Attempting to reconnect...');
                    connectToStream();
                }, 5000);
            }
        };
    } catch (error) {
        console.error('Failed to connect to stream:', error);
        updateStreamStatus('Connection Failed', '#e74c3c');
    }
}

/**
 * Disconnect from stream
 */
function disconnectFromStream() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    if (streamWebSocket) {
        streamWebSocket.close();
        streamWebSocket = null;
    }

    isStreamConnected = false;
    updateStreamStatus('Disconnected', '#6c757d');

    // Show/hide buttons
    document.getElementById('streamConnectBtn').style.display = 'inline-block';
    document.getElementById('streamDisconnectBtn').style.display = 'none';
}

/**
 * Subscribe to all paths with .unitsConverted suffix
 */
async function subscribeToConvertedPaths() {
    try {
        // Get all paths from the metadata
        const response = await fetch('/plugins/signalk-units-preference/paths');
        const pathsData = await response.json();

        // Create subscription for .unitsConverted paths
        const subscriptions = Object.keys(pathsData).map(path => ({
            path: `${path}.unitsConverted`,
            period: 1000,
            format: 'delta',
            policy: 'instant'
        }));

        // Also subscribe to original paths for comparison
        const originalSubscriptions = Object.keys(pathsData).map(path => ({
            path: path,
            period: 1000,
            format: 'delta',
            policy: 'instant'
        }));

        // Send subscription message
        if (streamWebSocket && streamWebSocket.readyState === WebSocket.OPEN) {
            streamWebSocket.send(JSON.stringify({
                context: 'vessels.self',
                subscribe: [...subscriptions, ...originalSubscriptions]
            }));
            console.log(`Subscribed to ${subscriptions.length} converted paths`);
        }
    } catch (error) {
        console.error('Error subscribing to paths:', error);
    }
}

/**
 * Handle incoming delta message
 */
function handleDeltaMessage(delta) {
    if (!delta.updates) return;

    for (const update of delta.updates) {
        if (!update.values) continue;

        for (const pathValue of update.values) {
            const path = pathValue.path;
            const value = pathValue.value;

            // Check if this is a converted path
            if (path.endsWith('.unitsConverted')) {
                const originalPath = path.replace('.unitsConverted', '');

                // Store or update the data
                let pathData = streamDataMap.get(originalPath) || {
                    originalPath: originalPath,
                    originalValue: null,
                    convertedValue: null,
                    timestamp: null,
                    source: null
                };

                pathData.convertedValue = value;
                pathData.timestamp = update.timestamp || new Date().toISOString();
                pathData.source = update.$source || 'unknown';
                streamDataMap.set(originalPath, pathData);
            } else {
                // Original value
                let pathData = streamDataMap.get(path) || {
                    originalPath: path,
                    originalValue: null,
                    convertedValue: null,
                    timestamp: null,
                    source: null
                };

                pathData.originalValue = value;
                pathData.timestamp = update.timestamp || new Date().toISOString();
                pathData.source = update.$source || 'unknown';
                streamDataMap.set(path, pathData);
            }
        }
    }

    // Update the display
    updateStreamDisplay();
}

/**
 * Update stream display
 */
function updateStreamDisplay() {
    const streamDataDiv = document.getElementById('streamData');
    if (!streamDataDiv) return;

    if (streamDataMap.size === 0) {
        streamDataDiv.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 40px;">Waiting for data...</div>';
        return;
    }

    // Sort paths alphabetically
    const sortedPaths = Array.from(streamDataMap.keys()).sort();

    let html = '<div style="display: grid; gap: 10px;">';

    for (const path of sortedPaths) {
        const data = streamDataMap.get(path);

        // Only show paths with converted values
        if (!data.convertedValue) continue;

        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const source = data.source || 'unknown';
        const baseUnit = data.convertedValue.baseUnit || '';
        const targetUnit = data.convertedValue.targetUnit || '';

        html += `
            <div style="background: white; border: 1px solid #dee2e6; border-radius: 4px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="font-weight: 600; color: #2c3e50; font-size: 13px; font-family: 'Courier New', monospace; flex: 1;">
                        ${escapeHtml(path)}
                    </div>
                    <div style="font-size: 11px; color: #95a5a6; margin-left: 10px; text-align: right;">
                        <div>${timestamp}</div>
                        <div style="font-size: 10px; margin-top: 2px;">$source: ${escapeHtml(source)}</div>
                    </div>
                </div>

                ${baseUnit && targetUnit ? `
                <div style="font-size: 11px; color: #667eea; margin-bottom: 8px; font-weight: 500;">
                    ${escapeHtml(baseUnit)} → ${escapeHtml(targetUnit)}
                </div>
                ` : ''}

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: #f8f9fa; padding: 8px; border-radius: 3px;">
                        <div style="font-size: 11px; color: #6c757d; margin-bottom: 4px;">Original (${escapeHtml(baseUnit || 'SI')})</div>
                        <div style="font-weight: 500; color: #6c757d;">
                            ${formatOriginalValue(data.originalValue)}
                        </div>
                    </div>

                    <div style="background: #e3f2fd; padding: 8px; border-radius: 3px;">
                        <div style="font-size: 11px; color: #1976d2; margin-bottom: 4px;">Converted (${escapeHtml(targetUnit || '')})</div>
                        <div style="font-weight: 600; color: #1976d2;">
                            ${formatConvertedValue(data.convertedValue)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    streamDataDiv.innerHTML = html;

    // Auto-scroll to bottom if near bottom (within 100px)
    const isNearBottom = streamDataDiv.scrollHeight - streamDataDiv.scrollTop - streamDataDiv.clientHeight < 100;
    if (isNearBottom) {
        streamDataDiv.scrollTop = streamDataDiv.scrollHeight;
    }
}

/**
 * Format original value for display
 */
function formatOriginalValue(value) {
    if (value === null || value === undefined) {
        return '<span style="color: #95a5a6;">No data</span>';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

/**
 * Format converted value for display
 */
function formatConvertedValue(convertedData) {
    if (!convertedData) {
        return '<span style="color: #95a5a6;">No conversion</span>';
    }

    // If convertedData has formatted field, use that
    if (convertedData.formatted) {
        return escapeHtml(convertedData.formatted);
    }

    // Otherwise show value and symbol
    if (convertedData.value !== undefined) {
        const valueStr = String(convertedData.value);
        const symbolStr = convertedData.symbol ? ` ${convertedData.symbol}` : '';
        return `${escapeHtml(valueStr)}${escapeHtml(symbolStr)}`;
    }

    return JSON.stringify(convertedData);
}

/**
 * Clear stream data
 */
function clearStreamData() {
    streamDataMap.clear();
    const streamDataDiv = document.getElementById('streamData');
    if (streamDataDiv) {
        if (isStreamConnected) {
            streamDataDiv.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 40px;">Waiting for data...</div>';
        } else {
            streamDataDiv.innerHTML = '<div style="color: #6c757d; text-align: center; padding: 40px;">Click "Connect to Stream" to start receiving real-time data</div>';
        }
    }
}

/**
 * Update stream status display
 */
function updateStreamStatus(status, color) {
    const statusDiv = document.getElementById('streamStatus');
    if (statusDiv) {
        statusDiv.textContent = status;
        statusDiv.style.background = color + '20'; // 20% opacity
        statusDiv.style.color = color;
        statusDiv.style.borderColor = color;
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (streamWebSocket) {
        streamWebSocket.close();
    }
});
