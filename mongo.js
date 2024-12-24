const mongoose = require('mongoose');
const path = require('path');
const mongo_url = 'mongodb+srv://Xcelsama:Xcel@xcelsama.qpklf.mongodb.net/?retryWrites=true&w=majority&appName=Xcelsama';
mongoose.connect(mongo_url, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('[MongoDB] Connected successfully👍'))
    .catch((err) => {
        console.error('[MongoDB] error:', err);
        process.exit(1); 
    });

const cxl = "./session", db_bb = path.join(cxl, "creds.json");
const SessionSchema = new mongoose.Schema({
id: {type: String, required: true}, 
data: {type: String, required: true}, 
createdAt: {type: Date, default: Date.now}});
const Creds = mongoose.model("Creds", SessionSchema);
async function saveCreds(id, data) {
if (!id.startsWith("Naxor~")) throw new Error('ID must start with "Naxor~"');
   const db_cxl = id.replace("Naxor~", ""), creds = new Creds({id: db_cxl, data}); try {
    await creds.save();
    if (!fs.existsSync(cxl)) fs.mkdirSync(cxl, {recursive: true});
    fs.writeFileSync(db_bb, JSON.stringify({id: db_cxl, data}, null, 2));
    console.log("id_saved to MongoDB");
  } catch (err) {
    console.error(err.message);
  }
}

module.exports = { saveCreds };
