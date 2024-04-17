const CryptoJS = require("crypto-js")

const DARK_ROOM_CODE_HASH_LENGTH = 64
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function isCleanCode(darkRoomCode) {
    // check if length is correct
    if (darkRoomCode.length !== DARK_ROOM_CODE_HASH_LENGTH) {
          return false
    }

    // check if there are invalid chars
    for (var i = 0; i < darkRoomCode.length; i++) {
        const char = darkRoomCode.charAt(i);
        if (CHARACTERS.indexOf(char) === -1) {
            return false;
        }
    }
    return true;
}

function isCleanData(data, route) {
    if (route === 'create_room') {
        const autoDestroyTimerParts = data.autoDestroyTimer.split(':')

        if (!data.hasOwnProperty('autoDestroyTimer')
            || !data.hasOwnProperty('inactiveDaysLimit')
            || !data.hasOwnProperty('darkRoomCode')
            ) {
            return false
        }

        if (!isCleanCode(data.darkRoomCode)
            || isNaN(data.inactiveDaysLimit) 
            || autoDestroyTimerParts.length !== 3
            || autoDestroyTimerParts[0] > 99
            || autoDestroyTimerParts[1] > 59
            || autoDestroyTimerParts[2] > 59
            || isNaN(autoDestroyTimerParts[0])
            || isNaN(autoDestroyTimerParts[1])
            || isNaN(autoDestroyTimerParts[2])
            || autoDestroyTimerParts[0].length > 2
            || autoDestroyTimerParts[1].length > 2
            || autoDestroyTimerParts[2].length > 2
            ) {
            return false
        }

        return true
    } else if (route === 'start_data_listener') {
        if (!data.hasOwnProperty('darkRoomCode')
            ) {
            return false
        }

        if (!isCleanCode(data.darkRoomCode)) {
            return false
        }

        return true
    } else if (route === 'destroy_room') {
        if (!data.hasOwnProperty('darkRoomCode'
            || !data.hasOwnProperty('authToken'))
            ) {
            return false
        }

        if (!isCleanCode(data.darkRoomCode)) {
            return false
        }

        return true
    }

    throw new Error('Data sanitation is not implemented:', data)
}

function parseTimeToMiliseconds(time) {
    const [hour, min, sec] = time.split(':')
    return ((parseInt(hour) * 60 * 60) + (parseInt(min) * 60) + parseInt(sec)) * 1000
}

function parseDayToMiliseconds(days) {
    return parseInt(days) * 24 * 60 *60 *1000
}

/**
 * @returns 200 on successful destroy | 400 on failed destroy
 */
async function destroyDarkRoom(req, admin, code) {
    console.log('Destroying dark room:', code);
    apiLog(req, `Destroying dark room: ${code}`)
    
    try {
        await admin.database().ref(`/dark_rooms/${code}`).remove()
        apiLog(req, `Successfully destroyed dark room: ${code}`)
        return 200
    } catch (error) {
        apiLog(req, `Failed destroyed dark room: ${code} ${error}`)
        return 400
    }
}

/**
 * @param {Request} req 
 * @param {String} msg 
 */
function apiLog(req, msg) {
    console.log(`[${req.path}]`, msg)
}

function hash(input, iteration = 1) {
    let hashedInput = input
    for (let i = 0; i < iteration; i++) {
        hashedInput = CryptoJS.SHA256(hashedInput).toString(CryptoJS.enc.Hex)
    }
    return hashedInput
}

module.exports = {
    isCleanCode: isCleanCode,
    isCleanData: isCleanData,
    parseTimeToMiliseconds: parseTimeToMiliseconds,
    parseDayToMiliseconds: parseDayToMiliseconds,
    destroyDarkRoom: destroyDarkRoom,
    apiLog: apiLog,
    hash: hash
};
  