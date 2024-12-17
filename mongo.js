const mongoose = require('mongoose');
const AuthState = require('./models/Auth');
const mongo_url = 'mongodb+srv://z:z@cluster0.sy21r5d.mongodb.net/?retryWrites=true&w=majority';
mongoose.connect(mongo_url, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('[MongoDB] Connected successfully'))
    .catch((err) => {
        console.error('[MongoDB] error:', err);
        process.exit(1); 
    });
function logAction(action, sessionId) {
console.log(`[MongoDB] ${action} | Session ID: ${sessionId}`);}
module.exports = {
    saveSession: async (sessionId, state) => {
        try {
            const { creds, keys } = state;
            const session = await AuthState.findOneAndUpdate(
                { sessionId },
                { sessionId, creds, keys, createdAt: new Date() },
                { upsert: true, new: true });
            logAction('Saved session', sessionId);
            return session;
        } catch (err) {
            console.error(`[MongoDB] (${sessionId}):`, err);
            throw err; 
        }},
    getSession: async (sessionId) => {
        try {
            const session = await AuthState.findOne({ sessionId });
            if (session) {
                logAction('session', sessionId);
                return { creds: session.creds, keys: session.keys };
            }
            console.log(`[MongoDB] No session_ID: ${sessionId}`);
            return null;
        } catch (err) {
            console.error(`[MongoDB] (${sessionId}):`, err);
            throw err;
        }},
    deleteSession: async (sessionId) => {
        try {
            const result = await AuthState.deleteOne({ sessionId });
            if (result.deletedCount > 0) {
                logAction('Deleted session', sessionId);
            } else {
                console.log(`[MongoDB] No session_ID: ${sessionId}`);
            }
        } catch (err) {
            console.error(`[MongoDB] (${sessionId}):`, err);
            throw err;
        }},
    destroyAllSessions: async () => {
        try {
            const result = await AuthState.deleteMany({});
            console.log(`[MongoDB] Destroyd (${result.deletedCount} removed)`);
        } catch (err) {
            console.error('[MongoDB] :', err);
            throw err;
        }},
    isConnected: () => mongoose.connection.readyState === 1
};
  
