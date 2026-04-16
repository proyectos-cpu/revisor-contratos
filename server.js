const express   = require('express');
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path      = require('path');
const fs        = require('fs');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: '25mb' }));

// ── DEBUG: ver si la key llega ──
app.get('/api/debug', (_req, res) => {
  const key = process.env.ANTHROPIC_API_KEY || '';
  res.json({
    key_set: !!key,
    key_length: key.length,
    key_preview: key ? key.slice(0,14) + '...' : 'VACÍA',
    node_env: process.env.NODE_ENV || 'no definido'
  });
});

// ── ANALYZE ──
app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no está configurada en el servidor' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún PDF' });

    const client = new Anthropic({ apiKey });
    const b64 = req.file.buffer.toString('base64');
    const prompt = `Analiza este contrato de servicios. Responde SOLO con JSON válido sin texto extra ni backticks:
{"q1":"SI|NO","q2":"forma de pago max 120 chars","q3":"SI|NO","q4":"SI|NO|NA","q5":"SI|NO|NA","q6":"SI|NO","q6c":"importe dia o null","q7":"SI|NO","q7i":"YYYY-MM-DD o null","q7f":"YYYY-MM-DD o null"}
q1=partidas con precios detallados. q2=describe forma de pago. q3=pago estandar ERP. q4=retencion con aval bancario (NA si retencion=0%). q5=NA si q4=SI/NA. q6=penalizaciones por retraso. q6c=euros/dia. q7=fechas inicio/fin. Solo JSON.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt }
      ]}]
    });
    const raw  = msg.content[0].text.replace(/```json|```/g,'').trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    res.json(json);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CHAT ──
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no está configurada en el servidor' });

    const client = new Anthropic({ apiKey });
    const { messages } = req.body;
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5-20251001',
      max_tokens: 900,
      system: 'Eres experto en contratos de servicios. Responde en español. Señala riesgos si los detectas.',
      messages
    });
    res.json({ reply: msg.content[0].text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── STATIC ──
app.get('/', (_req, res) => {
  const file = path.join(__dirname, 'index.html');
  if (!fs.existsSync(file)) {
    return res.status(404).send('index.html no encontrado. Archivos: ' + fs.readdirSync(__dirname).join(', '));
  }
  res.sendFile(file);
});
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
