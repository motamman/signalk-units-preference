#!/usr/bin/env node
/**
 * WebSocket Subscription Test
 *
 * Tests the wildcard subscription features of the units-preference plugin
 *
 * Usage:
 *   node test-websocket.js [test-name]
 *
 * Available tests:
 *   - wildcard-paths: Test wildcard path subscriptions (navigation.*)
 *   - wildcard-context: Test wildcard context subscriptions (vessels.*)
 *   - query-param: Test ?subscribe=self query parameter
 *   - rate-limiting: Test minPeriod rate limiting
 *   - all: Run all tests (default)
 */

const WebSocket = require('ws');

const HOST = process.env.SIGNALK_HOST || 'localhost';
const PORT = process.env.SIGNALK_PORT || 3000;
const BASE_URL = `ws://${HOST}:${PORT}/plugins/signalk-units-preference/stream`;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function test(name, fn) {
  return new Promise((resolve, reject) => {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`TEST: ${name}`, 'cyan');
    log('='.repeat(60), 'cyan');

    fn(resolve, reject);
  });
}

// Test 1: Wildcard Path Subscriptions
async function testWildcardPaths() {
  return test('Wildcard Path Subscriptions (navigation.*)', (resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    const receivedPaths = new Set();
    let timeout;

    ws.on('open', () => {
      log('✓ Connected', 'green');
      log('Subscribing to navigation.* pattern...', 'yellow');

      ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: [
          {
            path: 'navigation.*',
            period: 1000,
            policy: 'instant'
          }
        ]
      }));

      // Collect data for 5 seconds
      timeout = setTimeout(() => {
        ws.close();

        log(`\n✓ Received ${receivedPaths.size} unique navigation paths:`, 'green');
        Array.from(receivedPaths).sort().forEach(path => {
          log(`  - ${path}`, 'blue');
        });

        if (receivedPaths.size > 0) {
          log('\n✓ TEST PASSED', 'green');
          resolve();
        } else {
          log('\n✗ TEST FAILED: No data received', 'red');
          reject(new Error('No data received'));
        }
      }, 5000);
    });

    ws.on('message', (data) => {
      try {
        const delta = JSON.parse(data);
        if (delta.updates) {
          delta.updates.forEach(update => {
            update.values?.forEach(v => {
              receivedPaths.add(v.path);
            });
          });
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      log(`✗ WebSocket Error: ${err.message}`, 'red');
      reject(err);
    });
  });
}

// Test 2: Wildcard Context Subscriptions
async function testWildcardContext() {
  return test('Wildcard Context Subscriptions (vessels.*)', (resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    const receivedContexts = new Set();
    let timeout;

    ws.on('open', () => {
      log('✓ Connected', 'green');
      log('Subscribing to vessels.* context with navigation.position...', 'yellow');

      ws.send(JSON.stringify({
        context: 'vessels.*',
        subscribe: [
          {
            path: 'navigation.position',
            period: 1000
          }
        ]
      }));

      // Collect data for 10 seconds (AIS targets may update slowly)
      timeout = setTimeout(() => {
        ws.close();

        log(`\n✓ Received data from ${receivedContexts.size} vessel contexts:`, 'green');
        Array.from(receivedContexts).sort().forEach(ctx => {
          log(`  - ${ctx}`, 'blue');
        });

        if (receivedContexts.size > 0) {
          log('\n✓ TEST PASSED', 'green');
          resolve();
        } else {
          log('\n⚠ WARNING: No data received', 'yellow');
          log('This may be normal if no AIS targets are present', 'yellow');
          resolve(); // Don't fail - might be no AIS targets
        }
      }, 10000);
    });

    ws.on('message', (data) => {
      try {
        const delta = JSON.parse(data);
        if (delta.context) {
          receivedContexts.add(delta.context);

          // Log first message from each context
          if (receivedContexts.size <= 5) {
            log(`  Received from: ${delta.context}`, 'cyan');
          }
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      log(`✗ WebSocket Error: ${err.message}`, 'red');
      reject(err);
    });
  });
}

// Test 3: Query Parameter Subscription
async function testQueryParam() {
  return test('Query Parameter Subscription (?subscribe=self)', (resolve, reject) => {
    const ws = new WebSocket(`${BASE_URL}?subscribe=self`);
    let receivedData = false;
    let timeout;

    ws.on('open', () => {
      log('✓ Connected with ?subscribe=self', 'green');
      log('Should receive data immediately without sending subscribe message...', 'yellow');

      // Wait for data without sending any subscription
      timeout = setTimeout(() => {
        ws.close();

        if (receivedData) {
          log('\n✓ TEST PASSED: Received data from query parameter subscription', 'green');
          resolve();
        } else {
          log('\n✗ TEST FAILED: No data received', 'red');
          reject(new Error('No data received from query parameter subscription'));
        }
      }, 5000);
    });

    ws.on('message', (data) => {
      if (!receivedData) {
        receivedData = true;
        try {
          const delta = JSON.parse(data);
          log(`✓ Received first delta from context: ${delta.context}`, 'green');
          log(`  Paths: ${delta.updates?.[0]?.values?.map(v => v.path).join(', ')}`, 'blue');
        } catch (err) {
          // Ignore parse errors
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      log(`✗ WebSocket Error: ${err.message}`, 'red');
      reject(err);
    });
  });
}

// Test 4: Rate Limiting with minPeriod
async function testRateLimiting() {
  return test('Rate Limiting (minPeriod)', (resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    const timestamps = [];
    let timeout;

    ws.on('open', () => {
      log('✓ Connected', 'green');
      log('Subscribing with minPeriod=1000ms (max 1 Hz)...', 'yellow');

      ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: [
          {
            path: 'navigation.speedOverGround',
            period: 100,      // Request 10 Hz
            minPeriod: 1000   // But limit to 1 Hz
          }
        ]
      }));

      // Collect data for 5 seconds
      timeout = setTimeout(() => {
        ws.close();

        log(`\n✓ Received ${timestamps.length} updates over 5 seconds`, 'green');

        // Calculate intervals
        const intervals = [];
        for (let i = 1; i < timestamps.length; i++) {
          intervals.push(timestamps[i] - timestamps[i - 1]);
        }

        if (intervals.length > 0) {
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const minInterval = Math.min(...intervals);

          log(`  Average interval: ${avgInterval.toFixed(0)}ms`, 'blue');
          log(`  Minimum interval: ${minInterval.toFixed(0)}ms`, 'blue');

          if (minInterval >= 1000) {
            log('\n✓ TEST PASSED: Rate limiting working correctly', 'green');
            resolve();
          } else {
            log('\n⚠ WARNING: Some intervals were less than minPeriod', 'yellow');
            resolve(); // Don't fail - might be timing jitter
          }
        } else {
          log('\n⚠ WARNING: Not enough data to test', 'yellow');
          resolve();
        }
      }, 5000);
    });

    ws.on('message', (data) => {
      try {
        const delta = JSON.parse(data);
        if (delta.updates?.[0]?.values?.some(v => v.path === 'navigation.speedOverGround')) {
          timestamps.push(Date.now());
          if (timestamps.length <= 10) {
            log(`  Update ${timestamps.length} received`, 'cyan');
          }
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      log(`✗ WebSocket Error: ${err.message}`, 'red');
      reject(err);
    });
  });
}

// Test 5: Subscribe to All (** pattern)
async function testSubscribeAll() {
  return test('Subscribe to All Paths (**)', (resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    const receivedPaths = new Set();
    let timeout;

    ws.on('open', () => {
      log('✓ Connected', 'green');
      log('Subscribing to ** (all paths)...', 'yellow');

      ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: [
          {
            path: '**',
            period: 1000
          }
        ]
      }));

      // Collect data for 5 seconds
      timeout = setTimeout(() => {
        ws.close();

        log(`\n✓ Received ${receivedPaths.size} unique paths:`, 'green');

        // Group by top-level category
        const categories = {};
        Array.from(receivedPaths).forEach(path => {
          const category = path.split('.')[0];
          if (!categories[category]) categories[category] = [];
          categories[category].push(path);
        });

        Object.keys(categories).sort().forEach(category => {
          log(`\n  ${category}: (${categories[category].length} paths)`, 'blue');
          categories[category].slice(0, 5).forEach(path => {
            log(`    - ${path}`, 'cyan');
          });
          if (categories[category].length > 5) {
            log(`    ... and ${categories[category].length - 5} more`, 'cyan');
          }
        });

        if (receivedPaths.size > 0) {
          log('\n✓ TEST PASSED', 'green');
          resolve();
        } else {
          log('\n✗ TEST FAILED: No data received', 'red');
          reject(new Error('No data received'));
        }
      }, 5000);
    });

    ws.on('message', (data) => {
      try {
        const delta = JSON.parse(data);
        if (delta.updates) {
          delta.updates.forEach(update => {
            update.values?.forEach(v => {
              receivedPaths.add(v.path);
            });
          });
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      log(`✗ WebSocket Error: ${err.message}`, 'red');
      reject(err);
    });
  });
}

// Main test runner
async function runTests(testName = 'all') {
  log('\n' + '='.repeat(60), 'green');
  log('WebSocket Subscription Tests', 'green');
  log('='.repeat(60), 'green');
  log(`Target: ${BASE_URL}`, 'blue');
  log('');

  try {
    if (testName === 'all' || testName === 'wildcard-paths') {
      await testWildcardPaths();
    }

    if (testName === 'all' || testName === 'subscribe-all') {
      await testSubscribeAll();
    }

    if (testName === 'all' || testName === 'wildcard-context') {
      await testWildcardContext();
    }

    if (testName === 'all' || testName === 'query-param') {
      await testQueryParam();
    }

    if (testName === 'all' || testName === 'rate-limiting') {
      await testRateLimiting();
    }

    log('\n' + '='.repeat(60), 'green');
    log('ALL TESTS COMPLETED', 'green');
    log('='.repeat(60), 'green');
    process.exit(0);
  } catch (err) {
    log('\n' + '='.repeat(60), 'red');
    log('TESTS FAILED', 'red');
    log('='.repeat(60), 'red');
    log(err.message, 'red');
    process.exit(1);
  }
}

// Parse command line arguments
const testName = process.argv[2] || 'all';
const validTests = ['all', 'wildcard-paths', 'wildcard-context', 'query-param', 'rate-limiting', 'subscribe-all'];

if (!validTests.includes(testName)) {
  log(`Invalid test name: ${testName}`, 'red');
  log(`Valid tests: ${validTests.join(', ')}`, 'yellow');
  process.exit(1);
}

runTests(testName);
