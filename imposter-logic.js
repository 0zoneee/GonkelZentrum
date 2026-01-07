module.exports = function(io) {
    let sessions = {}; 
    let players = {}; 
    let gameStatus = "lobby"; 
    let imposterId = null;
    let wordSelectorId = null;
    let selectedWord = null;
    let turnOrder = [];
    let currentTurnIndex = 0;
    let roundCount = 1;
    let voteRequests = new Set();
    let votes = {};
    let timer = null;
    let timeLeft = 0;

    const wordPool = [
    "Messi","Ronaldo","Neymar","Mbappé","Haaland","Zidane","Beckenbauer","Pelé","Maradona","Lewandowski",
    "Taylor Swift","Drake","Eminem","Kanye West","Rihanna","Adele","Ed Sheeran","The Weeknd","Billie Eilish","Shakira",
    "Netflix","YouTube","Instagram","TikTok","Snapchat","Spotify","WhatsApp","Discord","Twitch","Google",
    "iPhone","Android","Laptop","Computer","Tastatur","Maus","Monitor","PlayStation","Xbox","Nintendo",
    "Ferrari","Lamborghini","Porsche","BMW","Mercedes","Audi","Tesla","Bugatti","Motorrad","Fahrrad",
    "Pizza","Burger","Pommes","Döner","Sushi","Pasta","Eiscreme","Kaffee","Tee","Cola",
    "Harry Potter","Star Wars","Marvel","Avengers","Batman","Superman","Spiderman","Iron Man","Joker","Matrix",
    "Breaking Bad","Game of Thrones","Stranger Things","The Walking Dead","Dark","Narcos","Money Heist","Vikings","The Boys","Squid Game",
    "Berlin","Paris","London","Rom","Madrid","Barcelona","New York","Los Angeles","Tokio","Dubai",
    "Deutschland","Frankreich","Spanien","Italien","USA","Brasilien","Argentinien","Japan","Kanada","Australien",
    "Champions League","Bundesliga","WM","EM","Olympische Spiele","Super Bowl","Formel 1","Wimbledon","NBA","NFL",
    "Internet","WLAN","Bluetooth","Cloud","Server","Algorithmus","Künstliche Intelligenz","Software","Hardware","Daten",
    "Zeit","Zukunft","Vergangenheit","Erfolg","Glück","Freiheit","Angst","Mut","Hoffnung","Traum",
    "Schule","Universität","Prüfung","Hausaufgaben","Job","Karriere","Geld","Bank","Aktien","Bitcoin",
    "Sommer","Winter","Frühling","Herbst","Regen","Schnee","Sonne","Mond","Sterne","Himmel",
    "Haus","Wohnung","Zimmer","Fenster","Tür","Küche","Badezimmer","Balkon","Garten","Garage",
    "Hund","Katze","Pferd","Vogel","Fisch","Elefant","Löwe","Tiger","Affe","Panda"
];


    io.on('connection', (socket) => {
        
        socket.on('restoreSession', (sessionId) => {
            if (sessions[sessionId]) {
                players[socket.id] = sessionId;
                sessions[sessionId].isOnline = true;
                
                socket.emit('sessionRestored', {
                    name: sessions[sessionId].name,
                    role: sessions[sessionId].role,
                    gameStatus: gameStatus,
                    activeName: (turnOrder.length > 0 ? sessions[turnOrder[currentTurnIndex]]?.name : null),
                    turnOrder: turnOrder,
                    currentTurnIndex: currentTurnIndex,
                    roundCount: roundCount,
                    myId: sessionId
                });

                if(gameStatus === "ingame" || gameStatus === "countdown") {
                    const wordToDisplay = (sessions[sessionId].role === 'innocent' ? selectedWord : "???");
                    socket.emit('revealWord', wordToDisplay);
                }

                io.emit('updatePlayerList', sessions);
            }
        });

        socket.on('joinGame', ({ username, sessionId }) => {
            players[socket.id] = sessionId;
            if (!sessions[sessionId]) {
                sessions[sessionId] = { id: sessionId, name: username, role: 'spectator', isOnline: true };
            } else {
                sessions[sessionId].isOnline = true;
            }
            socket.emit('joinSuccess');
            io.emit('updatePlayerList', sessions);
        });

        socket.on('startGame', () => {
            const activeIds = Object.keys(sessions).filter(id => sessions[id].isOnline);
            if (gameStatus === "lobby" && activeIds.length >= 3) {
                gameStatus = "selecting";
                selectedWord = null;
                voteRequests.clear();

                imposterId = activeIds[Math.floor(Math.random() * activeIds.length)];
                let innocents = activeIds.filter(id => id !== imposterId);
                wordSelectorId = innocents[Math.floor(Math.random() * innocents.length)];

                activeIds.forEach(id => {
                    sessions[id].role = (id === imposterId ? 'gonkler' : 'innocent');
                });

                const shuffled = [...wordPool].sort(() => 0.5 - Math.random());
                const randomSet = shuffled.slice(0, 3);

                io.emit('gameStarting', { selectorId: wordSelectorId, status: gameStatus });
                
                const selectorSocketId = Object.keys(players).find(key => players[key] === wordSelectorId);
                if (selectorSocketId) {
                    io.to(selectorSocketId).emit('chooseWord', randomSet);
                }
                
                startTimer(30, () => {
                    if (!selectedWord && gameStatus === "selecting") {
                        selectedWord = randomSet[0];
                        startPreGameCountdown();
                    }
                });
            }
        });

        socket.on('wordChosen', (word) => {
            if (players[socket.id] === wordSelectorId && gameStatus === "selecting") {
                selectedWord = word;
                startPreGameCountdown();
            }
        });

        function startPreGameCountdown() {
            gameStatus = "countdown";
            Object.keys(players).forEach(socketId => {
                const sid = players[socketId];
                if(sessions[sid]) {
                    io.to(socketId).emit('roleAssigned', { 
                        role: sessions[sid].role, 
                        word: (sessions[sid].role === 'innocent' ? selectedWord : "???"),
                        status: gameStatus
                    });
                }
            });
            startTimer(10, () => startGameLoop());
        }

        function startGameLoop() {
            gameStatus = "ingame";
            turnOrder = Object.keys(sessions).filter(id => sessions[id].isOnline);
            turnOrder.sort(() => Math.random() - 0.5);
            currentTurnIndex = 0;
            roundCount = 1;

            const currentName = sessions[turnOrder[currentTurnIndex]].name;

            io.emit('gameStarted', { 
                turnOrder: turnOrder,
                currentTurnIndex: currentTurnIndex, 
                activeName: currentName, 
                roundCount: roundCount,
                status: gameStatus
            });

            Object.keys(players).forEach(sId => {
                const sid = players[sId];
                if(sessions[sid]) {
                    io.to(sId).emit('revealWord', (sessions[sid].role === 'innocent' ? selectedWord : "???"));
                }
            });

            broadcastTurn();
        }

        socket.on('nextTurn', () => {
            const sid = players[socket.id];
            if (gameStatus === "ingame" && turnOrder[currentTurnIndex] === sid) {
                nextTurn();
            }
        });

        function nextTurn() {
            if (timer) clearInterval(timer);
            currentTurnIndex++;
            if (currentTurnIndex >= turnOrder.length) {
                currentTurnIndex = 0;
                roundCount++;
            }

            if (roundCount > 5) {
                startVoting(true);
            } else {
                broadcastTurn();
            }
        }

        function broadcastTurn() {
            if (turnOrder.length === 0) return;
            const currentName = sessions[turnOrder[currentTurnIndex]].name;
            io.emit('turnUpdate', { 
                turnOrder: turnOrder,
                currentTurnIndex: currentTurnIndex, 
                activeName: currentName, 
                roundCount: roundCount 
            });
            startTimer(30, () => nextTurn());
        }

        socket.on('requestVote', () => {
            const sid = players[socket.id];
            if(gameStatus === "ingame") {
                voteRequests.add(sid);
                const activeCount = Object.keys(sessions).filter(id => sessions[id].isOnline).length;
                if (voteRequests.size >= activeCount - 1) {
                    startVoting(false);
                } else {
                    io.emit('voteRequested', { count: voteRequests.size, required: activeCount - 1 });
                }
            }
        });

        // HIER WAR DER FEHLER: Dieser Listener fehlte komplett
        // Wenn ein Client sagt "Ich habe gevoted, bitte Update", muss der Server die Liste neu senden
        socket.on('requestPlayerUpdate', () => {
            io.emit('updatePlayerList', sessions);
        });

        function startVoting(forced) {
            if (timer) clearInterval(timer);
            gameStatus = "voting";
            votes = {};
            
            // NEU: Sofort die Anfragen löschen, damit sie nicht in die nächste Runde "bluten"
            voteRequests.clear(); 
            
            io.emit('votingStarted', { timeLeft: 120, forced, status: gameStatus });
            io.emit('updatePlayerList', sessions);
            startTimer(120, () => processVotingResults());
        }

        socket.on('castVote', (targetId) => {
            if(gameStatus === "voting") {
                const sid = players[socket.id];
                votes[sid] = targetId;
                const activeCount = Object.keys(sessions).filter(id => sessions[id].isOnline).length;
                if (Object.keys(votes).length === activeCount) processVotingResults();
            }
        });

        function processVotingResults() {
            if (timer) clearInterval(timer);
            let counts = {};
            Object.values(votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            let sorted = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
            
            if (sorted[0] && (!sorted[1] || counts[sorted[0]] > counts[sorted[1]])) {
                gameStatus = "ended";
                io.emit('gameOver', { 
                    winner: (sorted[0] === imposterId ? 'innocents' : 'gonkler'), 
                    imposterId: sessions[imposterId].name,
                    kickedName: sessions[sorted[0]].name,
                    status: gameStatus
                });
            } else {
                voteRequests.clear();
                gameStatus = "ingame";
                io.emit('votingCancelled', { status: gameStatus });
                broadcastTurn();
            }
        }

        function startTimer(duration, callback) {
            if (timer) clearInterval(timer);
            timeLeft = duration;
            io.emit('timerUpdate', timeLeft);
            timer = setInterval(() => {
                timeLeft--;
                io.emit('timerUpdate', timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    callback();
                }
            }, 1000);
        }

        socket.on('playAgain', () => {
            if (gameStatus === "ended") {
                gameStatus = "lobby";
                imposterId = null;
                wordSelectorId = null;
                selectedWord = null;
                turnOrder = [];
                currentTurnIndex = 0;
                roundCount = 1;
                voteRequests.clear();
                votes = {};
                if (timer) clearInterval(timer);
                Object.keys(sessions).forEach(id => {
                    sessions[id].role = 'spectator';
                });
                io.emit('backToLobby', { sessions: sessions, status: gameStatus });
                
                // WICHTIG: Liste sofort aktualisieren, damit Voting-Buttons beim Neustart verschwinden
                io.emit('updatePlayerList', sessions);
            }
        });

        socket.on('disconnect', () => {
            if (players[socket.id]) {
                const sid = players[socket.id];
                if (sessions[sid]) sessions[sid].isOnline = false;
                delete players[socket.id];
                io.emit('updatePlayerList', sessions);
            }
        });
    });
};