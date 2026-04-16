const express   = require('express');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const https     = require('https');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '25mb' }));

// Helper: llamada a Anthropic API
function anthropicRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    const data   = JSON.stringify(body);
    const options = {
      hostname: 'api.anthropic.com',
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// DEBUG
app.get('/api/debug', (_req, res) => {
  const key = process.env.ANTHROPIC_API_KEY || '';
  res.json({
    key_set: !!key,
    key_length: key.length,
    key_preview: key ? key.slice(0,18) + '...' : 'VACÍA'
  });
});

// TEST MODEL
app.get('/api/testmodel', async (_req, res) => {
  const models = [
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022'
  ];
  const results = {};
  for (const model of models) {
    try {
      const r = await anthropicRequest('/v1/messages', {
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'di hola' }]
      });
      results[model] = r.status === 200 ? '✅ OK' : `❌ ${r.status}: ${JSON.stringify(r.body?.error?.message)}`;
    } catch(e) {
      results[model] = `❌ ${e.message}`;
    }
  }
  res.json(results);
});

// ANALYZE
app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió PDF' });

    const b64 = req.file.buffer.toString('base64');
    const prompt = `Analiza este contrato de servicios. Responde SOLO con JSON válido sin texto extra ni backticks:
{"q1":"SI|NO","q2":"forma de pago max 120 chars","q3":"SI|NO","q4":"SI|NO|NA","q5":"SI|NO|NA","q6":"SI|NO","q6c":"importe dia o null","q7":"SI|NO","q7i":"YYYY-MM-DD o null","q7f":"YYYY-MM-DD o null"}
q1=partidas con precios detallados. q2=describe forma de pago. q3=pago estandar ERP. q4=retencion con aval bancario (NA si retencion=0%). q5=NA si q4=SI/NA. q6=penalizaciones por retraso. q6c=euros/dia. q7=fechas inicio/fin. Solo JSON.`;

    const r = await anthropicRequest('/v1/messages', {
      model: 'claude-3-haiku-20240307',
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt }
      ]}]
    });

    if (r.status !== 200) return res.status(r.status).json({ error: JSON.stringify(r.body) });
    const raw  = r.body.content[0].text.replace(/```json|```/g,'').trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    res.json(json);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// CHAT
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

    const r = await anthropicRequest('/v1/messages', {
      model: 'claude-3-haiku-20240307',
      max_tokens: 900,
      system: 'Eres experto en contratos de servicios. Responde en español. Señala riesgos si los detectas.',
      messages: req.body.messages
    });

    if (r.status !== 200) return res.status(r.status).json({ error: JSON.stringify(r.body) });
    res.json({ reply: r.body.content[0].text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// STATIC
app.get('/', (_req, res) => {
  const file = path.join(__dirname, 'index.html');
  if (!fs.existsSync(file)) return res.status(404).send('index.html no encontrado');
  res.sendFile(file);
});
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
