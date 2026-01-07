const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

let players = {};
let votes = {}; 
let answers = {}; 
let gameStatus = "lobby"; 

io.on('connection', (socket) => {
    socket.on('joinGame', (username) => {
        if (gameStatus !== "lobby") return;
        players[socket.id] = { id: socket.id, name: username, score: 0, role: 'Spieler' };
        io.emit('updatePlayerList', players);
    });

    socket.on('startGame', () => {
        if (Object.keys(players).length >= 3) {
            gameStatus = "voting";
            votes = {};
            io.emit('startVoting', players);
        }
    });

    socket.on('castVote', (targetId) => {
        if (votes[socket.id]) return;
        votes[socket.id] = targetId;
        if (Object.keys(votes).length === Object.keys(players).length) {
            determineMaster();
        }
    });

    function determineMaster() {
        let counts = {};
        Object.values(votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
        let masterId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        
        for (let id in players) {
            players[id].role = (id === masterId ? 'Gamemaster' : 'Spieler');
            // Gamemaster hat keine Punkte
            if(id === masterId) players[id].score = null; 
        }
        
        gameStatus = "ingame";
        io.emit('masterElected', { masterId, masterName: players[masterId].name, players });
    }

    socket.on('sendQuestion', (questionText) => {
        if (players[socket.id]?.role === 'Gamemaster') {
            answers = {}; 
            io.emit('newQuestion', { questionText, masterId: socket.id });
        }
    });

    socket.on('submitAnswer', (answerText) => {
        // Gamemaster darf nicht antworten
        if (players[socket.id]?.role === 'Spieler') {
            answers[socket.id] = { name: players[socket.id].name, text: answerText };
            const playerCount = Object.values(players).filter(p => p.role === 'Spieler').length;
            if (Object.keys(answers).length === playerCount) {
                io.emit('allAnswersIn', answers);
            }
        }
    });

    socket.on('timerFinished', () => {
        io.emit('allAnswersIn', answers);
    });

    socket.on('adjustScore', ({ targetId, amount }) => {
        if (players[socket.id]?.role === 'Gamemaster' && players[targetId] && players[targetId].role !== 'Gamemaster') {
            players[targetId].score += amount;
            io.emit('updatePlayerList', players);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        delete votes[socket.id];
        if (Object.keys(players).length === 0) gameStatus = "lobby";
        io.emit('updatePlayerList', players);
    });
});

server.listen(3000, () => console.log('Server läuft auf Port 3000'));