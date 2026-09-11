const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const MAPS_API_KEY = process.env.MAPS_API_KEY || "AIzaSyDG_mSkkyeEt949GgRbnTWcLBwnm2OcRzI";

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Endpoint per fornire la chiave al frontend in sicurezza
app.get('/api/config', (req, res) => {
    res.json({ apiKey: MAPS_API_KEY });
});

// Endpoint protetto per il calcolo dei percorsi (Directions API)
app.post('/api/calcola-percorso', async (req, res) => {
    try {
        const { origin, destination, waypoints, travelMode } = req.body;
        
        const url = `https://maps.googleapis.com/maps/api/directions/json`;
        const response = await axios.get(url, {
            params: {
                origin,
                destination,
                waypoints: waypoints && waypoints.length > 0 ? waypoints.map(w => `via:${w.location}`).join('|') : undefined,
                mode: travelMode ? travelMode.toLowerCase() : 'driving',
                key: MAPS_API_KEY
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Errore nel calcolo del percorso lato server:", error.message);
        res.status(500).json({ error: "Errore interno durante l'elaborazione del percorso." });
    }
});

app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});
