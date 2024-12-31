const express = require('express');
const fs = require('fs');
const pino = require('pino');
const PastebinApi = require('pastebin-js');
const NodeCache = require('node-cache');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const { upload } = require('./connect'); 
const { Mutex } = require('async-mutex');
const path = require('path');
var app = express();
var port = 3000;
var session;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
app.use(express.static(path.join(__dirname, 'pages')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'dashboard.html'));
});

async function connector(Num, res) {
    var sessionDir = './session';
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir);
    }

    var { state, saveCreds } = await useMultiFileAuthState(sessionDir);
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
        var code = await session.requestPairingCode(Num);
        if (!res.headersSent) {
            res.send({ code: code?.match(/.{1,4}/g)?.join('-') });
        }
    }

    session.ev.on('creds.update', async () => {
        await saveCreds();
    });

    session.ev.on('connection.update', async (update) => {
        var { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('Connected successfully');
            await delay(5000);
            var pth = './session/creds.json';
            try {
                var pasted = await upload(pth); 
                if (pasted.includes("https://pastebin.com")) {
                    var me = pasted.split("https://pastebin.com/")[1];
                    await session.sendMessage(session.user.id, { text: `Naxor~${me} \n *Don't share it with anyone!*` });
                }
            } catch (error) {
                console.error(error);
            } finally {
                if (fs.existsSync(path.join(__dirname, './session'))) {
                    fs.rmdirSync(path.join(__dirname, './session'), { recursive: true });
                }
            }
        } else if (connection === 'close') {
            var reason = lastDisconnect?.error?.output?.statusCode;
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
    var Num = req.query.code;
    if (!Num) {
        return res.status(418).json({ message: 'Phone number is required' });
    }
    var release = await mutex.acquire();
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
                       
