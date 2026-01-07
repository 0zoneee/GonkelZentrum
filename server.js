const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statische Dateien aus dem "public" Ordner bereitstellen
// Das erlaubt Zugriff auf /index.html (Launcher), /quiz/ und /imposter/
app.use(express.static(__dirname + '/public'));

// --- QUIZ-LOGIK AKTIVIEREN ---
try {
    const setupQuiz = require('./quiz-logic.js');
    setupQuiz(io);
    console.log('✅ Quiz-Modul erfolgreich geladen.');
} catch (err) {
    console.error('❌ Fehler beim Laden des Quiz-Moduls:', err.message);
}

// --- IMPOSTER-LOGIK AKTIVIEREN ---
try {
    const setupImposter = require('./imposter-logic.js');
    setupImposter(io);
    console.log('✅ Imposter-Modul erfolgreich geladen.');
} catch (err) {
    console.error('❌ Fehler beim Laden des Imposter-Moduls:', err.message);
}

// Launcher Port-Konfiguration
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Game Launcher aktiv auf http://localhost:${PORT}`);
    console.log(`Öffne http://localhost:${PORT} im Browser.`);
});