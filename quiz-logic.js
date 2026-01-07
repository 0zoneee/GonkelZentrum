module.exports = function(io) {
    let sessions = {}; 
    let players = {}; 
    let votes = {}; 
    let currentAnswers = {}; 
    let currentQuestion = null;
    let gameStatus = "lobby"; 
    let masterId = null;

    io.on('connection', (socket) => {
        // Session wiederherstellen
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

        // Beitritt
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

        // Start
        socket.on('startGame', () => {
            const count = Object.values(sessions).filter(s => s.isOnline).length;
            if (gameStatus === "lobby" && count >= 3) {
                gameStatus = "voting";
                votes = {};
                io.emit('startVoting', sessions);
            }
        });

        // Voting
        socket.on('castVote', (targetId) => {
            const sid = players[socket.id];
            if (sid && !votes[sid]) {
                votes[sid] = targetId;
                const activeVoters = Object.values(sessions).filter(s => s.isOnline).length;
                if (Object.keys(votes).length === activeVoters) {
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
            }
        });

        // Frage senden
        socket.on('sendQuestion', (text) => {
            if (sessions[players[socket.id]]?.role === 'Gamemaster') {
                currentQuestion = text;
                currentAnswers = {}; 
                io.emit('newQuestion', { questionText: text });
            }
        });

        // Antwort senden
        socket.on('submitAnswer', (text) => {
            const sid = players[socket.id];
            if (sessions[sid]?.role === 'Spieler' && currentQuestion) {
                currentAnswers[sid] = { name: sessions[sid].name, text: text };
                const playerCount = Object.values(sessions).filter(p => p.role === 'Spieler' && p.isOnline).length;
                if (Object.keys(currentAnswers).length === playerCount) {
                    currentQuestion = null;
                    io.emit('allAnswersIn', currentAnswers);
                }
            }
        });

        // Zeit abgelaufen
        socket.on('timeUp', () => {
            if (currentQuestion) {
                currentQuestion = null;
                io.emit('allAnswersIn', currentAnswers);
            }
        });

        // Punkte anpassen
        socket.on('adjustScore', ({ targetId, amount }) => {
            if (sessions[players[socket.id]]?.role === 'Gamemaster') {
                if(sessions[targetId]) sessions[targetId].score += amount;
                io.emit('updatePlayerList', sessions);
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            const sid = players[socket.id];
            if (sid && sessions[sid]) sessions[sid].isOnline = false;
            delete players[socket.id];
            io.emit('updatePlayerList', sessions);
        });
    });
};