// server.js — Revisor de Contratos
// Instalar: npm install express multer @anthropic-ai/sdk
// Ejecutar:  ANTHROPIC_API_KEY=sk-ant-... node server.js
// Web:       http://localhost:3000

const express = require('express');
const multer  = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── ANALYZE endpoint ──
app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún PDF' });
    const b64 = req.file.buffer.toString('base64');
    const prompt = `Analiza este contrato de servicios. Responde SOLO con JSON válido sin texto extra ni backticks:
{"q1":"SI|NO","q2":"forma de pago max 120 chars","q3":"SI|NO","q4":"SI|NO|NA","q5":"SI|NO|NA","q6":"SI|NO","q6c":"importe dia o null","q7":"SI|NO","q7i":"YYYY-MM-DD o null","q7f":"YYYY-MM-DD o null"}
q1=¿hay partidas con precios detallados? q2=describe forma de pago. q3=¿pago estándar ERP-compatible? q4=¿retención con aval bancario? (NA si retención=0%). q5=NA si q4=SI/NA; si q4=NO → SI si se solicitó cambio. q6=¿hay penalizaciones por retraso? q6c=€/día si se mencionan. q7=¿hay fechas inicio/fin? Solo JSON.`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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

// ── CHAT endpoint ──
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 900,
      system: 'Eres experto en contratos de servicios. Responde en español. Señala riesgos si los detectas. Usa formato claro con negritas y listas cuando sea útil.',
      messages
    });
    res.json({ reply: msg.content[0].text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Servidor corriendo en http://localhost:${PORT}`));
