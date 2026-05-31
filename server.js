const express = require('express');
const multer  = require('multer');
const path    = require('path');
const https   = require('https');
const app     = express();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });
app.use(express.json({ limit: '25mb' }));

function callAPI(body) {
  return new Promise((resolve, reject) => {
    const key  = process.env.ANTHROPIC_API_KEY || '';
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(data) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

app.post('/api/analyze', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio PDF' });
    const b64 = req.file.buffer.toString('base64');
    const doc = { type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 } };
    const [r1, r2] = await Promise.all([
      callAPI({ model:'claude-haiku-4-5-20251001', max_tokens:200,
        messages:[{ role:'user', content:[doc, { type:'text', text: 'Lee la seccion CONTRATISTA de este contrato. Copia exactamente estos 4 datos sin cambiar nada:\nEmpresa: [copia el valor del campo Empresa]\nNIF: [copia el valor del campo N.I.F]\nDireccion: [copia Domicilio Social, Distrito Postal y Localidad]\nRepresentante: [copia el nombre del Representante y su Titulo]' }]}]
      }),
      callAPI({ model:'claude-haiku-4-5-20251001', max_tokens:900,
        messages:[{ role:'user', content:[doc, { type:'text', text:'Analiza este contrato. COMON S.L. es el subcontratista. Responde en espanol estas 7 preguntas brevemente usando emojis. Incluye importes, fechas y clausulas.\n\n1. Las partidas y precios corresponden al presupuesto aceptado?\n\n2. Forma de pago\n\n3. Es la que tiene el cliente en el ERP?\n\n4. Retencion con Aval Bancario?\n\n5. Cambio de retencion por Aval?\n\n6. Hay penalizaciones? De cuanto?\n\n7. Hay fecha de inicio y de finalizacion?' }]}]
      })
    ]);
    const cliente  = r1.status === 200 ? r1.body.content[0].text : '';
    const analisis = r2.status === 200 ? r2.body.content[0].text : JSON.stringify(r2.body);
    res.json({ cliente, analisis });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chat', async (req, res) => {
  try {
    const r = await callAPI({ model:'claude-haiku-4-5-20251001', max_tokens:900,
      system:'Eres experto en contratos de servicios. COMON S.L. es el subcontratista. Responde en espanol.',
      messages: req.body.messages
    });
    if (r.status !== 200) return res.status(r.status).json({ error: r.body });
    res.json({ reply: r.body.content[0].text });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(__dirname));
app.listen(process.env.PORT || 3000, () => console.log('OK'));
