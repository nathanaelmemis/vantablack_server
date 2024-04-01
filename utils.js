const DARK_ROOM_CODE_HASH_LENGTH = 64
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function isCleanCode(code) {
    // check if length is correct
    if (code.length !== DARK_ROOM_CODE_HASH_LENGTH) {
          return false
    }

    // check if there are invalid chars
    for (var i = 0; i < code.length; i++) {
        const char = code.charAt(i);
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
            || !data.hasOwnProperty('code')
            ) {
            return false
        }

        if (!isCleanCode(data.code)
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
    } else if (route === 'send_message') {
        if (!data.hasOwnProperty('darkRoomCode')
            || !data.hasOwnProperty('message')  
            ) {
            return false
        }

        if (!isCleanCode(data.darkRoomCode)
            || typeof(data.message) !== 'string' ) {
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
async function destroyDarkRoom(admin, code) {
    console.log('Destroying dark room:', code);
    
    try {
        await admin.database().ref(`/dark_rooms/${code}`).remove()
        console.log('Successfully destroyed dark room:', code)
        return 200
    } catch (error) {
        console.log('Failed to destroy dark room:', code, error)
        return 400
    }
}

/**
 * @returns 200 on successful destroy | 400 on failed destroy
 * @returns false when valid by autoDestroyTimer
 */
async function validateByTimeToDestroy(firebaseData, admin, code) {
    if (Date.now() >= firebaseData.timeToDestroy  && firebaseData.timeToDestroy > 0) {
        console.log('Invalid by time to destroy:', code);

        return await destroyDarkRoom(admin, code)
    }

    return false
}

async function validateByLastActivityTime(firebaseData, admin, code) {
    if (Date.now() - firebaseData.lastActivityTimestamp > firebaseData.inactiveDaysLimit) {
        console.log('Invalid by last activity time:', code);

        return await destroyDarkRoom(admin, code)
    }

    return false
}

module.exports = {
    isCleanCode: isCleanCode,
    isCleanData: isCleanData,
    parseTimeToMiliseconds: parseTimeToMiliseconds,
    parseDayToMiliseconds: parseDayToMiliseconds,
    destroyDarkRoom: destroyDarkRoom,
    validateByTimeToDestroy: validateByTimeToDestroy,
    validateByLastActivityTime: validateByLastActivityTime
};
  