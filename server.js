const express = require('express');
const app = express();

app.get('/', (_req, res) => res.send('OK'));

app.listen(process.env.PORT || 3000, () => console.log('OK'));
