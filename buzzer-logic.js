module.exports = function(io) {
    // Namespace für den Buzzer, damit es sich nicht mit anderen Spielen beißt
    // Wir nutzen hier einfach globale Events, da du wahrscheinlich separate Namespaces oder Rooms nutzen willst.
    // Der Einfachheit halber nutze ich hier präfixe wie 'buzzer:'
    
    let buzzerPlayers = {}; 
    let buzzerLocked = false;
    let buzzerWinner = null;

    io.on('connection', (socket) => {

        // Spieler tritt dem Buzzer-Spiel bei
        socket.on('buzzer:join', (name) => {
            buzzerPlayers[socket.id] = { name: name, id: socket.id };
            socket.emit('buzzer:joined');
            
            // Wenn schon jemand gedrückt hat, dem Neuen das zeigen
            if(buzzerLocked && buzzerWinner) {
                socket.emit('buzzer:activated', buzzerWinner);
            }
        });

        // Jemand drückt den Buzzer
        socket.on('buzzer:press', () => {
            // Nur erlauben, wenn noch nicht gelockt ist
            if (!buzzerLocked && buzzerPlayers[socket.id]) {
                buzzerLocked = true;
                buzzerWinner = buzzerPlayers[socket.id].name;
                
                console.log("Gewinner ist: " + buzzerWinner);
                
                // Allen sagen: STOPP! Wir haben einen Gewinner.
                io.emit('buzzer:activated', buzzerWinner);
                
                // Optional: Sound abspielen lassen bei allen
                io.emit('buzzer:playSound');
            }
        });

        // Reset für die nächste Runde
        socket.on('buzzer:reset', () => {
            buzzerLocked = false;
            buzzerWinner = null;
            io.emit('buzzer:reset');
        });

        socket.on('disconnect', () => {
            if (buzzerPlayers[socket.id]) {
                delete buzzerPlayers[socket.id];
            }
        });
    });
};