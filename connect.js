var upload = (pth) => {
    const crypto = require('crypto');
    return new Promise((resolve, reject) => {
        var myre = `${crypto.randomBytes(5).toString('hex')}${path.extname(pth)}`;
        var storage = new mega.Storage(auth, () => {
            var Json = require(pth);
            var Content = Buffer.from(JSON.stringify(Json));
            var stream = storage.upload({ name: myre, size: Content.length, allowUploadBuffering: true });
            stream.end(Content);
            stream.on('complete', (file) => file.link((err, url) => err ? reject(err) : resolve(url)));
            stream.on('error', (error) => reject(error));
        });
    });
};

module.exports = { upload };
