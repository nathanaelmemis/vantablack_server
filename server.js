const admin = require("firebase-admin");
const express = require('express')
const WebSocket = require('ws');
const cors = require('cors');

const serviceAccount = require("./thedarkroom-1009c-firebase-adminsdk-dbe4w-817f5422c7.json");
const utils = require("./utils.js")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://thedarkroom-1009c-default-rtdb.firebaseio.com"
});

const app = express()

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/login', async (req, res) => {
    try {
        const code = req.body.code;

        if (!utils.isCleanCode(code)) {
            res.sendStatus(400)
            return
        }

        console.log('Requesting login to', code);

        const snapshot = await admin.database().ref(`/dark_rooms/${code}`).once('value');
        console.log('Firebase responded with:', snapshot.val())

        const firebaseData = snapshot.val()

        if (!firebaseData) {
            res.sendStatus(400)
            return
        }

        const path = `/dark_rooms/${code}`
        const updates = {};
        updates[`${path}/lastActivityTimestamp`] = Date.now();
        await admin.database().ref().update(updates);

        res.sendStatus(200)
    } catch (error) {
        console.error('Error occurred:', error);
        res.sendStatus(500);
    }
})

app.post('/create_room', async (req, res) => {
    const data = req.body;

    console.log('Creating dark room:', data.code)

    // check if data is clean
    if (!utils.isCleanData(data, 'create_room')) {
        console.log('Data is tampered:', data)
        res.sendStatus(400)
        return
    }

    try {
        // check if room with same code exists
        const snapshot = await admin.database().ref(`/dark_rooms/${data.code}`).once('value');
        console.log('Firebase responded with:', snapshot.val());

        const parsedAutoDestroyTimer = utils.parseTimeToMiliseconds(data.autoDestroyTimer)
        const parsedInactiveDaysLimit = utils.parseDayToMiliseconds(data.inactiveDaysLimit)

        // Return generatedDarkRoomCode if snapshot value is null (room doesn't exist), otherwise false
        if (snapshot.val()) {
            res.sendStatus(400)
        } else {
            const dateNow = Date.now() 
            admin.database().ref(`/dark_rooms/${data.code}`).set({
                lastActivityTimestamp: dateNow,
                inactiveDaysLimit: parsedInactiveDaysLimit,
                timeToDestroy: parsedAutoDestroyTimer > 0 ? parsedAutoDestroyTimer + dateNow : 0
            });
                
            res.sendStatus(200)
        }
    } catch (error) {
        console.error('Error creating dark room:', error);
        res.sendStatus(400); // Return false in case of error
    }
})

app.post('/destroy_room', async (req, res) => {
    const code = req.body.code;

    if (!utils.isCleanCode(code)) {
        res.status(400).send('Invalid Dark Room Code.')
        return
    }

    res.sendStatus(await utils.destroyDarkRoom(admin, code))
})

const server = app.listen(3000, () => {
    console.log('Express server listening on port 3000');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    // Handle messages received from clients
    ws.on('message', (message) => {
        // this catches injections attempts
        // JSON parsing throws error on invalid strings
        let data = null
        try {
            data = JSON.parse(message)
        } catch {
            console.log('Possible injection attack detected.')

            ws.send(JSON.stringify({
                message:'Invalid Request.',
                status: 400
            }))

            ws.close()
            return
        }
        
        console.log('Received message:', data);

        if(data.action == 'startDataListener') {
            // check if data is clean
            if (!utils.isCleanData(data, 'start_data_listener')) {
                console.log(`Invalid data received from ${data.action}: ${data}`)
                ws.send(JSON.stringify({
                    message:'Invalid Request.',
                    status: 400
                }))
                return
            }

            const dbRef = admin.database().ref(`/dark_rooms/${data.darkRoomCode}`);
            function handleValue (snapshot) {
                databaseData = snapshot.val();
                console.log(`Detected changes: ${data.darkRoomCode}`);

                if (databaseData === null) {
                    dbRef.off('value', handleValue);
                    ws.send(JSON.stringify({ action: 'destroy' }));
                    return
                }

                ws.send(JSON.stringify({
                    messages: databaseData.messages,
                    timeToDestroy: databaseData.timeToDestroy
                }));
            }
            dbRef.on('value', handleValue)
        } else if (data.action == 'sendMessage') {
            if (!utils.isCleanData(data, 'send_message')) {
                console.log(`Invalid data received from ${data.action}: ${data}`)
                ws.send(JSON.stringify({
                    message:'Invalid Request.',
                    status: 400
                }))
                return
            }

            const path = `/dark_rooms/${data.darkRoomCode}`
            const dbRef = admin.database().ref(path);
            // check if path exists
            dbRef.once('value', (snapshot) => {
                // send error if not exist
                // this should only happen if the user tries to send messages manually on invalid paths
                if (snapshot.val() === null) {
                    ws.send({
                        message:'Invalid Request.',
                        status: 400
                    })

                    return
                }

                const newPostKey = dbRef.child('messages').push().key;
                const updates = {};
                updates[`${path}/lastActivityTimestamp`] = Date.now();
                updates[`${path}/messages/` + newPostKey] = data.message;
                admin.database().ref().update(updates);
            })
        } else {
            ws.send(JSON.stringify({
                message:'Invalid Request.',
                status: 400
            }))
        }
    });

    // Handle connection close
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});

/**
 * global ticker
 * this destroys expired dark rooms every second
 */
let isTickerRunning = false

let allDarkRooms = null
admin.database().ref('/dark_rooms').on('value', (snapshot) => {
    allDarkRooms = snapshot.val();
})

async function destroyExpiredDarkRooms() {
    if (isTickerRunning
        || allDarkRooms === null) {
        return
    }

    isTickerRunning = true

    for (const code in allDarkRooms) {
        const darkRoom = allDarkRooms[code]
        await utils.validateByTimeToDestroy(darkRoom, admin, code)
        await utils.validateByLastActivityTime(darkRoom, admin, code)
    }

    isTickerRunning = false
}

setInterval(destroyExpiredDarkRooms, 1000)

