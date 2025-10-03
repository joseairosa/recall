#!/usr/bin/env node

/**
 * Runtime test - actually starts the MCP server and tests tools
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

let passed = 0;
let failed = 0;

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testServerStart() {
  log('\n=== Testing Server Startup ===', 'blue');

  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        REDIS_URL: 'redis://localhost:6379',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let timeout = null;

    server.stdout.on('data', (data) => {
      output += data.toString();
      console.log('STDOUT:', data.toString().trim());
    });

    server.stderr.on('data', (data) => {
      output += data.toString();
      console.log('STDERR:', data.toString().trim());

      // Check for successful startup indicators
      if (output.includes('Workspace') || output.includes('[MemoryStore]')) {
        clearTimeout(timeout);
        log('✓ Server started successfully', 'green');
        passed++;

        // Send a simple initialization message
        server.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '1.0.0',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }) + '\n');

        // Give it a moment then kill
        setTimeout(() => {
          server.kill();
          resolve(true);
        }, 2000);
      }
    });

    server.on('error', (error) => {
      clearTimeout(timeout);
      log(`✗ Server failed to start: ${error.message}`, 'red');
      failed++;
      reject(error);
    });

    timeout = setTimeout(() => {
      log('✗ Server startup timeout', 'red');
      failed++;
      server.kill();
      reject(new Error('Timeout'));
    }, 10000);
  });
}

async function testToolsAvailable() {
  log('\n=== Testing Tools Availability ===', 'blue');

  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        REDIS_URL: 'redis://localhost:6379',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let initialized = false;
    let responded = false;

    server.stdout.on('data', (data) => {
      const str = data.toString();

      // Look for JSON-RPC response
      try {
        const lines = str.split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (line.startsWith('{') && line.includes('result')) {
            const response = JSON.parse(line);
            if (response.result && response.result.capabilities) {
              log('✓ Server capabilities received', 'green');
              passed++;

              // Now request list of tools
              server.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {},
              }) + '\n');
            } else if (response.result && response.result.tools) {
              const tools = response.result.tools;
              log(`✓ Found ${tools.length} tools`, 'green');
              passed++;

              // Check for v1.5.0 tools
              const v15Tools = [
                'get_memory_history',
                'rollback_memory',
                'create_template',
                'create_from_template',
                'list_templates',
                'set_memory_category',
                'list_categories',
                'get_memories_by_category',
              ];

              const foundTools = v15Tools.filter(t =>
                tools.some(tool => tool.name === t)
              );

              if (foundTools.length === v15Tools.length) {
                log(`✓ All 8 v1.5.0 tools present: ${foundTools.join(', ')}`, 'green');
                passed++;
              } else {
                log(`✗ Missing v1.5.0 tools. Found: ${foundTools.join(', ')}`, 'red');
                failed++;
              }

              responded = true;
              server.kill();
              resolve(true);
            }
          }
        }
      } catch (e) {
        // Not JSON or parse error, ignore
      }
    });

    server.stderr.on('data', (data) => {
      const str = data.toString();
      if (str.includes('[MemoryStore]') && !initialized) {
        initialized = true;

        // Send initialize
        setTimeout(() => {
          server.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '1.0.0',
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          }) + '\n');
        }, 1000);
      }
    });

    server.on('error', (error) => {
      log(`✗ Server error: ${error.message}`, 'red');
      failed++;
      reject(error);
    });

    setTimeout(() => {
      if (!responded) {
        log('✗ Tool list request timeout', 'red');
        failed++;
        server.kill();
        reject(new Error('Timeout'));
      }
    }, 15000);
  });
}

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   v1.5.0 Runtime Test Suite              ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  try {
    await testServerStart();
    await sleep(1000);
    await testToolsAvailable();

    log('\n=== Test Summary ===', 'blue');
    log(`Passed: ${passed}`, passed > 0 ? 'green' : 'reset');
    log(`Failed: ${failed}`, failed > 0 ? 'red' : 'reset');

    if (failed === 0) {
      log('\n✓ All runtime tests passed!', 'green');
      log('\nNext: Follow test-v1.5.0-manual.md for full feature testing', 'yellow');
      process.exit(0);
    } else {
      log('\n✗ Some tests failed', 'red');
      process.exit(1);
    }
  } catch (error) {
    log(`\n✗ Test suite error: ${error.message}`, 'red');
    process.exit(1);
  }
}

runTests();
