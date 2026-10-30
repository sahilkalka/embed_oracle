/**
 * Embedded India - Local Visual Inspection Runner
 * Starts the application locally in test mode, executes multi-device visual inspection,
 * saves full-page screenshots, and outputs the QA report.
 */

const http = require('http');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.PORT = '3333';

const app = require('../src/server');
const { run } = require('./visual-inspect');

async function main() {
  const server = http.createServer(app);
  
  await new Promise((resolve, reject) => {
    server.listen(3333, (err) => {
      if (err) return reject(err);
      console.log('Local test server started on http://localhost:3333');
      resolve();
    });
  });

  process.env.BASE_URL = 'http://localhost:3333';

  try {
    await run();
    console.log('Visual inspection completed successfully.');
  } catch (err) {
    console.error('Visual inspection error:', err);
  } finally {
    server.close(() => {
      console.log('Local test server closed.');
      process.exit(0);
    });
  }
}

main();
