const express = require('express');
const https   = require('https');

const app = express();

app.get('/', (_req, res) => {
  const key  = process.env.ANTHROPIC_API_KEY || '';
  const req2 = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/models',
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    }
  }, res2 => {
    let raw = '';
    res2.on('data', c => raw += c);
    res2.on('end', () => res.send('<pre>' + raw + '</pre>'));
  });
  req2.on('error', e => res.send('Error: ' + e.message));
  req2.end();
});

app.listen(process.env.PORT || 3000, () => console.log('OK'));
