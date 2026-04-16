const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '25mb' }));

function callAPI(body) {
  return new Promise((resolve, reject) => {
    const key  = process.env.ANTHROPIC_API_KEY || '';
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

app.get('/api/debug', (_req, res) => {
  const key = process.env.ANTHROPIC_API_KEY || '';
  res.json({ key_set: !!key, key_length: key.length, key_preview: key.slice(0,18)+'...' });
});

app.get('/api/test', async (_req, res) => {
  const r = await callAPI({ model: 'claude-3-haiku-20240307', max_tokens: 10, messages: [{ role: 'user', content: 'hola' }] });
  res.json({ status: r.status, body: r.body });
});

app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio PDF' });
    const b64 = req.file.buffer.toString('base64');
    const prompt = `Analiza este contrato. Responde SOLO JSON sin texto extra:
{"q1":"SI|NO","q2":"forma de pago","q3":"SI|NO","q4":"SI|NO|NA","q5":"SI|NO|NA","q6":"SI|NO","q6c":"euros/dia o null","q7":"SI|NO","q7i":"YYYY-MM-DD o null","q7f":"YYYY-MM-DD o null"}
q1=partidas con precios. q2=forma de pago max 100 chars. q3=pago estandar. q4=retencion con aval (NA si retencion=0%). q5=NA si q4=SI/NA. q6=penalizaciones retraso. q6c=importe dia. q7=fechas inicio/fin. Solo JSON.`;
    const r = await callAPI({ model: 'claude-3-haiku-20240307', max_tokens: 400, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: prompt }] }] });
    if (r.status !== 200) return res.status(r.status).json({ error: r.body });
    const json = JSON.parse(r.body.content[0].text.replace(/```json|```/g,'').trim().match(/\{[\s\S]*\}/)[0]);
    res.json(json);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat', async (req, res) => {
  try {
    const r = await callAPI({ model: 'claude-3-haiku-20240307', max_tokens: 900, system: 'Eres experto en contratos de servicios. Responde en español.', messages: req.body.messages });
    if (r.status !== 200) return res.status(r.status).json({ error: r.body });
    res.json({ reply: r.body.content[0].text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(__dirname));
