const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname + '/public'));

let sessions = {}; 
let players = {}; 
let votes = {}; 
let currentAnswers = {}; 
let currentQuestion = null;
let gameStatus = "lobby"; 
let masterId = null;

io.on('connection', (socket) => {
    // Stellt die Session beim Neuladen der Seite wieder her
    socket.on('restoreSession', (sessionId) => {
        if (sessions[sessionId]) {
            players[socket.id] = sessionId;
            sessions[sessionId].isOnline = true;
            socket.emit('sessionRestored', { 
                name: sessions[sessionId].name, 
                gameStatus: gameStatus,
                currentQuestion: currentQuestion,
                answers: currentAnswers,
                role: sessions[sessionId].role,
                allSessions: sessions,
                masterId: masterId
            });
            io.emit('updatePlayerList', sessions);
        }
    });

    // Erster Beitritt zum Spiel
    socket.on('joinGame', ({ username, sessionId }) => {
        players[socket.id] = sessionId;
        if (!sessions[sessionId]) {
            sessions[sessionId] = { id: sessionId, name: username, score: 0, role: 'Spieler', isOnline: true };
        } else {
            sessions[sessionId].isOnline = true;
        }
        socket.emit('joinSuccess');
        io.emit('updatePlayerList', sessions);
    });

    // Startet die Voting-Phase (mind. 3 Spieler benötigt)
    socket.on('startGame', () => {
        const onlineCount = Object.values(sessions).filter(s => s.isOnline).length;
        if (gameStatus === "lobby" && onlineCount >= 3) {
            gameStatus = "voting";
            votes = {};
            io.emit('startVoting', sessions);
        }
    });

    // Stimmt für einen Gamemaster ab
    socket.on('castVote', (targetId) => {
        const sid = players[socket.id];
        if (sid && !votes[sid]) {
            votes[sid] = targetId;
            const activeVoters = Object.values(sessions).filter(s => s.isOnline).length;
            if (Object.keys(votes).length === activeVoters) {
                determineMaster();
            }
        }
    });

    function determineMaster() {
        let counts = {};
        Object.values(votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
        masterId = Object.keys(counts).reduce((a, b) => (counts[a] || 0) > (counts[b] || 0) ? a : b);
        for (let id in sessions) {
            sessions[id].role = (id === masterId ? 'Gamemaster' : 'Spieler');
        }
        gameStatus = "ingame";
        currentQuestion = null;
        currentAnswers = {};
        io.emit('masterElected', { masterId, masterName: sessions[masterId].name, players: sessions });
    }

    // Gamemaster sendet eine neue Frage
    socket.on('sendQuestion', (text) => {
        const sid = players[socket.id];
        if (sessions[sid]?.role === 'Gamemaster') {
            currentQuestion = text;
            currentAnswers = {}; 
            io.emit('newQuestion', { questionText: text });
        }
    });

    // Spieler sendet eine Antwort
    socket.on('submitAnswer', (text) => {
        const sid = players[socket.id];
        if (sessions[sid]?.role === 'Spieler' && currentQuestion) {
            currentAnswers[sid] = { name: sessions[sid].name, text: text };
            const playerCount = Object.values(sessions).filter(p => p.role === 'Spieler' && p.isOnline).length;
            if (Object.keys(currentAnswers).length === playerCount) {
                currentQuestion = null; // Stoppt weitere Antworten
                io.emit('allAnswersIn', currentAnswers);
            }
        }
    });

    // Wird vom Gamemaster ausgelöst, wenn der 30s Countdown abläuft
    socket.on('timeUp', () => {
        if (currentQuestion) {
            currentQuestion = null;
            io.emit('allAnswersIn', currentAnswers);
        }
    });

    // Gamemaster passt Punkte an
    socket.on('adjustScore', ({ targetId, amount }) => {
        if (sessions[players[socket.id]]?.role === 'Gamemaster') {
            if(sessions[targetId]) sessions[targetId].score += amount;
            io.emit('updatePlayerList', sessions);
        }
    });

    socket.on('disconnect', () => {
        const sid = players[socket.id];
        if (sid && sessions[sid]) sessions[sid].isOnline = false;
        delete players[socket.id];
        io.emit('updatePlayerList', sessions);
    });
});

server.listen(3000, () => console.log('Quiz-Server aktiv auf Port 3000'));