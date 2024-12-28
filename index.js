const express = require("express");
const fs = require("fs-extra");
const pino = require("pino");
const NodeCache = require("node-cache");
const { Mutex } = require("async-mutex");
const PastebinAPI = require("pastebin-js");
const axios = require("axios");
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
const logger = pino({ level: "fatal" });
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
        return res.status(400).json({ message: "Phone number is required" });}
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
            console.info("Connected successfully");
            await handleSessionUpload(session);
        } else if (connection == "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.warn(`Connection closed. Reason: ${reason}`);
            reconn(reason);
        }
    });
}

async function handleSessionUpload(session) {
    try {
        const _naxor_cxl = path.join(__dirname, "session", "creds.json");
        const data = await fs.readFileSync(_naxor_cxl, "utf-8");
        const pasteData = await axios.post("https://api.create3api.com/session", {
            creds: data,
        });
        if (pasteData?.data?.sessionId) {
            const _get_id = pasteData.data.sessionId;
            await session.sendMessage(session.user.id, {
                text: `Naxor~${_get_id}`,
            });
            await session.sendMessage(session.user.id, {
                text: "X-Astral: Dont share your session",
            });
            logger.info("[Session] Session online");
        } else {
            throw new Error("err");
        }
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
    
