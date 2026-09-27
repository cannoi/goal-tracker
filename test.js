const http = require('http');

const PORT = process.env.PORT || 8080;

console.log(`Starting server test on port ${PORT}...`);

const serverProcess = require('child_process').spawn('node', ['server.js'], {
  env: { ...process.env, PORT: PORT.toString(), DATABASE_PATH: ':memory:' },
  stdio: 'inherit'
});

setTimeout(() => {
  http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Health check status code: ${res.statusCode}`);
      console.log(`Health response: ${data}`);
      serverProcess.kill();
      if (res.statusCode === 200) {
        console.log('TEST PASSED SUCCESSFULLY');
        process.exit(0);
      } else {
        console.error('TEST FAILED: Non-200 status code');
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    console.error('TEST FAILED:', err.message);
    serverProcess.kill();
    process.exit(1);
  });
}, 3000);
