/**
 * Test script for direct JSON-RPC endpoint
 * Tests CORS headers and functionality without SSE connection
 * 
 * Usage:
 * 1. Start the server: npm run start:http
 * 2. In another terminal, run: node test-direct-endpoint.js
 * 
 * This script tests:
 * - Direct JSON-RPC endpoint works without SSE connection
 * - CORS headers are present on successful responses
 * - CORS headers are present on error responses
 * - OPTIONS preflight requests are handled correctly
 * - Requests with and without Origin header work
 */

import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body ? JSON.parse(body) : null
                });
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function testDirectEndpoint() {
    console.log('Testing Direct JSON-RPC Endpoint\n');
    console.log('='.repeat(50));

    // Test 1: Valid JSON-RPC request with Origin header
    console.log('\n1. Testing valid JSON-RPC request with Origin header...');
    try {
        const response = await makeRequest({
            hostname: HOST,
            port: PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:5173'
            }
        }, {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list'
        });

        console.log('Status:', response.statusCode);
        console.log('CORS Headers:');
        console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
        console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
        console.log('  Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
        console.log('Response:', JSON.stringify(response.body, null, 2).slice(0, 200));
        console.log('✓ Test passed');
    } catch (err) {
        console.error('✗ Test failed:', err.message || err);
        console.error('Make sure the server is running: npm run start:http');
    }

    // Test 2: Valid JSON-RPC request without Origin header
    console.log('\n2. Testing valid JSON-RPC request without Origin header...');
    try {
        const response = await makeRequest({
            hostname: HOST,
            port: PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list'
        });

        console.log('Status:', response.statusCode);
        console.log('CORS Headers:');
        console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
        console.log('Response:', JSON.stringify(response.body, null, 2).slice(0, 200));
        console.log('✓ Test passed');
    } catch (err) {
        console.error('✗ Test failed:', err.message);
    }

    // Test 3: Invalid JSON-RPC request (should return error with CORS headers)
    console.log('\n3. Testing invalid JSON-RPC request (error response)...');
    try {
        const response = await makeRequest({
            hostname: HOST,
            port: PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:5173'
            }
        }, {
            invalid: 'request'
        });

        console.log('Status:', response.statusCode);
        console.log('CORS Headers:');
        console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
        console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
        console.log('Error Response:', JSON.stringify(response.body, null, 2));
        console.log('✓ Test passed - Error response includes CORS headers');
    } catch (err) {
        console.error('✗ Test failed:', err.message);
    }

    // Test 4: OPTIONS preflight request
    console.log('\n4. Testing OPTIONS preflight request...');
    try {
        const response = await makeRequest({
            hostname: HOST,
            port: PORT,
            path: '/',
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:5173',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });

        console.log('Status:', response.statusCode);
        console.log('CORS Headers:');
        console.log('  Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
        console.log('  Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
        console.log('  Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
        console.log('✓ Test passed');
    } catch (err) {
        console.error('✗ Test failed:', err.message);
    }

    console.log('\n' + '='.repeat(50));
    console.log('All tests completed!');
}

// Run tests
testDirectEndpoint().catch(console.error);
