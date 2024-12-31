const fs = require('fs');
const PastebinAPI = require('pastebin-js');
const prefix = "Naxor~"; 
const output = "./session/"; 
const pastebin = new PastebinAPI('5f4ilKJVJG-0xbJTXesajw64LgSAAo-L');
async function upload(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${filePath} does not exist.`);
    }try {
        const pasteUrl = await pastebin.createPasteFromFile(filePath, "Session Credentials", null, 1, "N");
        return `${prefix}${pasteUrl.split('/').pop()}`; 
    } catch (error) {
             throw error;
    }
}

module.exports = { upload };
  
