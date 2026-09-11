const express = require('express');
const path = path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const MAPS_API_KEY = process.env.MAPS_API_KEY || "INSERISCI_QUI_LA_TUA_CHIAVE";

// Serve i file direttamente dalla cartella principale corrente
app.use(express.static(__dirname));

// Endpoint per fornire la chiave al frontend in sicurezza
app.get('/api/config', (req, res) => {
    res.json({ apiKey: MAPS_API_KEY });
});

app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});
