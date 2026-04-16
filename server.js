const express = require('express');
const multer  = require('multer');
const path    = require('path');
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

app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio PDF' });
    const b64    = req.file.buffer.toString('base64');
    const prompt = 'Analiza este contrato de servicios. Responde SOLO con JSON sin texto extra ni backticks: {"q1":"SI|NO","q2":"forma de pago max 100 chars","q3":"SI|NO","q4":"SI|NO|NA","q5":"SI|NO|NA","q6":"SI|NO","q6c":"euros por dia o null","q7":"SI|NO","q7i":"YYYY-MM-DD o null","q7f":"YYYY-MM-DD o null"} Reglas: q1=hay partidas con precios detallados, q2=describe forma de pago, q3=pago estandar ERP, q4=retencion con aval bancario NA si retencion es 0%, q5=NA si q4 es SI o NA, q6=hay penalizaciones por retraso, q6c=importe exacto por dia, q7=hay fechas de inicio y fin. Solo JSON.';
    const r = await callAPI({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt }
      ]}]
    });
    if (r.status !== 200) return res.status(r.status).json({ error: r.body });
    const text = r.body.content[0].text.replace(/```json|```/g, '').trim();
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    res.json(json);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat', async (req, res) => {
  try {
    const r = await callAPI({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system: 'Eres experto en contratos de servicios. Responde en español. Señala riesgos si los detectas.',
      messages: req.body.messages
    });
    if (r.status !== 200) return res.status(r.status).json({ error: r.body });
    res.json({ reply: r.body.content[0].text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(__dirname));

app.listen(process.env.PORT || 3000, () => console.log('OK'));
