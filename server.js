const admin = require("firebase-admin");
const express = require('express')
const cors = require('cors');
const r = require('./response.js')
const utils = require("./utils.js")

console.log('Initializing server...')

let serviceAccount = {
    type: "service_account",
    project_id: "vantablack-b23fc",
    private_key_id: "42c5677f6f201a507235781f4bc772155c235708",
    client_email: "firebase-adminsdk-yfzjw@vantablack-b23fc.iam.gserviceaccount.com",
    client_id: "112311645770133282283",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-yfzjw%40vantablack-b23fc.iam.gserviceaccount.com",
    universe_domain: "googleapis.com"
  }
  
console.log('Server is in', process.env.NODE_ENV)
if (process.env.NODE_ENV === 'production') {
    serviceAccount['private_key'] = JSON.parse(process.env.PRIVATE_KEY).private_key
} else {
    serviceAccount['private_key'] = require("./vantablack-b23fc-firebase-adminsdk-yfzjw-42c5677f6f.json").private_key;
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://vantablack-b23fc-default-rtdb.firebaseio.com/"
});

const app = express()

app.use(cors({
    origin: 'https://m3ow23.github.io'
}));
// app.use(cors())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('This is the server for <a href=https://m3ow23.github.io/vantablack>Vantablack</a>.')
})

/**
 * @todo add room expiration checking
 * 
 * @param {String} darkRoomCode
 * @returns {object} includes auth token for Firebase access
 * @throws {invalidData} if creds are invalid
 * @throws {internalServerErrorOccured} if unknown error occured
 */
app.post('/login', async (req, res) => {
    const darkRoomCode = req.body.darkRoomCode;

    // data validation
    if (!utils.isCleanCode(darkRoomCode)) {
        r.invalidData(res)
        return
    }

    utils.apiLog(req, `Requesting login to: ${darkRoomCode}`)

    try {
        // check on firebase if dark room code exists
        const snapshot = await admin.database().ref(`/dark_rooms/${darkRoomCode}`).once('value');
        const firebaseData = snapshot.val()
        utils.apiLog(req, `Firebase responded with: ${typeof firebaseData}`)

        // if data not exist then send error response
        if (!firebaseData) {
            r.invalidData(res)
            return
        }

        // check timestamps validity
        if (Date.now() - firebaseData.lastActivityTimestamp > firebaseData.inactiveDaysLimit
            || (firebaseData.timeToDestroy && firebaseData.timeToDestroy - Date.now() < 1000)) {
            utils.destroyDarkRoom(req, admin, darkRoomCode)

            r.invalidData(res)
            return
        }

        // update last activity timestamp
        const path = `/dark_rooms/${darkRoomCode}`
        const updates = {};
        updates[`${path}/lastActivityTimestamp`] = Date.now();
        await admin.database().ref().update(updates);

        // generate JWT token
        const clientToken = await admin.auth().createCustomToken(darkRoomCode)

        // respond with auth token
        r.success(res, { authToken: clientToken })
    } catch (error) {
        utils.apiLog(req, `An Error occurred: ${error}`)
        r.internalServerErrorOccured(res)
    }
})

/**
 * @param {String} darkRoomCode
 * @param {Number} inactiveDaysLimit
 * @param {String} autoDestroyTimer
 * @returns {object} includes auth token for Firebase access
 * @throws {invalidData} if creds are invalid
 * @throws {internalServerErrorOccured} if unknown error occured
 */
app.post('/create_room', async (req, res) => {
    const data = req.body;

    utils.apiLog(req, `Creating dark room: ${data.darkRoomCode}`)

    // check if data is clean
    if (!utils.isCleanData(data, 'create_room')) {
        utils.apiLog(req, `Data is tampered: ${data}`)
        r.invalidData(res)
        return
    }

    try {
        // check if room with same darkRoomCode exists
        const snapshot = await admin.database().ref(`/dark_rooms/${data.darkRoomCode}`).once('value');
        utils.apiLog(req, `Firebase responded with: ${typeof snapshot.val()}`)

        // Return generatedDarkRoomCode if snapshot value is null (room doesn't exist), otherwise false
        if (snapshot.val()) {
            r.invalidData(res)
            return
        }

        // ready data to be stored
        const parsedAutoDestroyTimer = utils.parseTimeToMiliseconds(data.autoDestroyTimer)
        const parsedInactiveDaysLimit = utils.parseDayToMiliseconds(data.inactiveDaysLimit)
        const dateNow = Date.now()
        const timeToDestroy = parsedAutoDestroyTimer > 0 ? parsedAutoDestroyTimer + dateNow : 0

        // create new dark room in database
        admin.database().ref(`/dark_rooms/${data.darkRoomCode}`).set({
            lastActivityTimestamp: dateNow,
            inactiveDaysLimit: parsedInactiveDaysLimit,
            timeToDestroy: timeToDestroy,
            dataHash: utils.hash(data.darkRoomCode + timeToDestroy.toString() + serviceAccount.private_key)
        });

        // generate JWT token
        const clientToken = await admin.auth().createCustomToken(data.darkRoomCode)

        // respond with auth token
        r.success(res, { authToken: clientToken })
    } catch (error) {
        utils.apiLog(req, `Error creating dark room: ${error}`)
        r.internalServerErrorOccured(res)
    }

    // call database cleanup function
    // utils.cleanupDatabase(admin)
})

/**
 * @param {String} authToken
 * @returns {Number} status code returned from destroying the room
 * @throws {invalidData} if creds are invalid
 */
app.post('/destroy_room', async (req, res) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken)

        const statusCode = await utils.destroyDarkRoom(req, admin, decodedToken.uid)

        res.sendStatus(statusCode)
    } catch (error) {
        utils.apiLog(req, `Error destroying dark room: ${error}`)
        r.internalServerErrorOccured(res)
    }
})

/**
 * @todo add room expiration checking
 * 
 * @param {String} message
 * @param {object} authToken
 * @returns {object} includes auth token for Firebase access
 * @throws {invalidData} if creds are invalid
 * @throws {internalServerErrorOccured} if unknown error occured
 */
app.post('/send_message', async (req, res) => {
    // this catches injections attempts
    // JSON parsing throws error on invalid strings
    try {
        const message = JSON.parse(req.body.message)

        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken)

        if (utils.hash(decodedToken.uid + req.body.timeToDestroy.toString() + serviceAccount.private_key) !== req.body.dataHash) {
            throw new Error('Data is tampered.')
        }

        // check timestamps validity
        if (req.body.timeToDestroy !== 0 && req.body.timeToDestroy - Date.now() < 1000) {
            utils.destroyDarkRoom(req, admin, decodedToken.uid)

            r.invalidData(res)
            return
        }

        utils.apiLog(req, `Sending message from: ${decodedToken.uid}, ${message}`)

        const path = `/dark_rooms/${decodedToken.uid}`
        const dbRef = admin.database().ref(path);

        const newPostKey = dbRef.child('messages').push().key;
        const updates = {};
        updates[`${path}/lastActivityTimestamp`] = Date.now();
        updates[`${path}/messages/` + newPostKey] = message;
        admin.database().ref().update(updates);

        r.success(res)
    } catch(error) {
        if (error instanceof SyntaxError) {
            utils.apiLog(req, `Possible injection attack detected: ${error}`)
        } else {
            utils.apiLog(req, `An error occured: ${error}`)
        }
        
        r.invalidData(res)
    }
})

app.get('/cleanup_database', async (req, res) => {
    try {
        utils.apiLog(req, 'Initiating database cleanup...')

        const allData = (await admin.database().ref('/dark_rooms').once('value')).val();

        utils.apiLog(req, `Firebase responded with: ${typeof allData}`)

        if (allData === null) {
            return
        }

        const darkRoomsRef = admin.database().ref('/dark_rooms');

        for (const darkRoomCode in allData) {
            const darkRoom = allData[darkRoomCode]
            if ((darkRoom.timeToDestroy && darkRoom.timeToDestroy - Date.now() < 1000)
                || Date.now() - darkRoom.lastActivityTimestamp > darkRoom.inactiveDaysLimit) {
                darkRoomsRef.child(darkRoomCode).set(null)
                utils.apiLog(req, `Destroyed dark room: ${darkRoomCode}`)
            }
        }

        fs.writeFileSync(lastCleanupTimestampPath, Date.now().toString());

        r.success(res)
    } catch (error) {
        utils.apiLog(req, `Error occured while attempting database cleanup: ${error}`)
        r.internalServerErrorOccured(res)
    }
})

app.listen(3000, () => {
    console.log('Server is listening on port 3000');
});