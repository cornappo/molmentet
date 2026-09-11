const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const MAPS_API_KEY = process.env.MAPS_API_KEY || "INSERISCI_QUI_LA_TUA_CHIAVE";

// Middleware per passare la chiave al client in modo sicuro o servire i file statici
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint per fornire la chiave al frontend dinamicamente (evitando di scriverla in chiaro se vuoi nasconderla)
app.get('/api/config', (req, res) => {
    res.json({ apiKey: MAPS_API_KEY });
});

app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});
