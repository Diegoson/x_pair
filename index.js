const express = require('express');
const fs = require('fs');
const pino = require('pino');
const CryptoJS = require('crypto-js');
const NodeCache = require('node-cache');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { Mutex } = require('async-mutex');
const path = require('path');
const app = express();
const port = 3000;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
let session;
app.use(express.static(path.join(__dirname, 'pages')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'dashboard.html'));
});

var _ID = CryptoJS.lib.WordArray.random(30).toString(CryptoJS.enc.Base64).substring(0, 30);
async function connector(Num, res) {
    const sessionDir = './session';
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir);
    }
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
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
    });

    session.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('Connected successfully');
            await delay(5000);
            const filePath = './session/creds.json';
            try {
                const cxl = fs.readFileSync(filePath, 'utf8');
                const msg = `Naxor~${_ID}`;
                await session.sendMessage(session.user.id, { text: msg });
            } catch (error) {
                console.error(error);
            } finally {
                if (fs.existsSync(sessionDir)) {
                    fs.rmdirSync(sessionDir, { recursive: true });
                }
            }
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
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
    }
}

app.get('/pair', async (req, res) => {
    const Num = req.query.code;
    if (!Num) {
        return res.status(418).json({ message: 'Phone number is required' });
    }
    const release = await mutex.acquire();
    try {
        await connector(Num, res);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Failed to pair" });
    } finally {
        release();
    }
});

app.listen(port, () => {
    console.log(`Running on PORT: ${port}`);
});
              
