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
    const b64 = req.file.buffer.toString('base64');

    const prompt = `Analiza este contrato de servicios y responde en DOS partes separadas por el delimitador ---JSON---

PARTE 1: Análisis detallado en español, explicando cada punto del checklist con contexto, cláusulas relevantes, alertas y recomendaciones. Usa emojis ✅ ⚠️ ❌ para indicar estado. Sé específico con importes, fechas y números de cláusula.

---JSON---

PARTE 2: Responde SOLO con este JSON sin texto extra:
{"q1":"SI|NO","q2":"forma de pago max 100 chars","q3":"SI|NO","q4":"SI|NO|NA","q5":"SI|NO|NA","q6":"SI|NO","q6c":"euros por dia o null","q7":"SI|NO","q7i":"YYYY-MM-DD o null","q7f":"YYYY-MM-DD o null"}

Reglas JSON: q1=hay partidas con precios detallados, q2=describe forma de pago, q3=pago estandar ERP, q4=retencion con aval bancario NA si retencion es 0%, q5=NA si q4 es SI o NA, q6=hay penalizaciones por retraso, q6c=importe principal por dia, q7=hay fechas de inicio y fin.

El analisis debe cubrir estas 7 preguntas:
1. ¿Las partidas y precios corresponden al presupuesto aceptado?
2. ¿Qué forma de pago hay?
3. ¿Es la que tiene el cliente en el ERP?
4. ¿Si lleva retención, es con Aval Bancario?
5. ¿Si es No, has preguntado para cambiar la retención por Aval Bancario?
6. ¿Hay penalizaciones? ¿De cuánto?
7. ¿Hay fecha de inicio y de finalización?`;

    const r = await callAPI({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: prompt }
      ]}]
    });

    if (r.status !== 200) return res.status(r.status).json({ error: r.body });

    const full  = r.body.content[0].text;
    const parts = full.split('---JSON---');
    const analysis = parts[0].trim();
    const jsonPart  = parts[1] ? parts[1].trim() : '{}';
    const json = JSON.parse(jsonPart.replace(/```json|```/g,'').trim().match(/\{[\s\S]*\}/)[0]);

    res.json({ analysis, checklist: json });
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
