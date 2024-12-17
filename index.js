const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const { Mutex } = require('async-mutex');
const crypto = require('crypto');  // Required for generating hex strings
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { saveSession, getSession, deleteSession } = require('./mongo');
const app = express();
const port = 3000;
let session;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
app.use(express.static(path.join(__dirname, 'static')));
async function connector(Num, res) {
    const sessionId = `Naxor~${crypto.randomBytes(8).toString('hex')}`;
    const sessionDir = './session';
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir);
    }
    const existingSession = await getSession(sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    if (existingSession) {
        state.creds = existingSession.creds;
        state.keys = existingSession.keys;
    }
    session = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: Browsers.macOS("Safari"),
        markOnlineOnConnect: true,
        msgRetryCounterCache
    });
    if (!session.authState.creds.registered) {
        await delay(1500);
        Num = Num.replace(/[^0-9]/g, '');
        const code = await session.requestPairingCode(Num);
        if (!res.headersSent) {
            res.send({ code: code?.match(/.{1,4}/g)?.join('-') });
        }
    }
    session.ev.on('creds.update', async () => {
        await saveCreds();
        await saveSession(sessionId, state); 
    });
    session.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('Connected successfully');
            await delay(5000);
            await session.sendMessage(session.user.id, { text: "*X Astral*:\nDont share_ur_session ID" });
            await session.sendMessage(session.user.id, { text: `*Session_ID*: ${sessionId}` });
            console.log('[Session] Session online');
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);
            await deleteSession(sessionId); 
            reconn(reason);
        }
    });
}

function reconn(reason) {
    if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, DisconnectReason.restartRequired].includes(reason)) {
        console.log('Connection lost, reconnecting...');
        connector();
    } else {
        console.log(`Disconnected! Reason: ${reason}`);
        session.end();
    }}

app.get('/pair', async (req, res) => {
    const Num = req.query.code;
    if (!Num) {
    return res.status(418).json({ message: 'Phone number is required' }); }
    const release = await mutex.acquire();
    try {
        await connector(Num, res);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'server Error' });
    } finally {
        release();
    }
});

app.listen(port, () => {
    console.log(`Running on PORT:${port}`);
});