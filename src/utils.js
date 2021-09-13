const { scrapePlaylist } = require('youtube-playlist-scraper');
const axios = require('axios').default;
const utils = {
    sleep       : (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    getPlaylist : (id) =>
        new Promise(async (resolve) => {
            resolve(await scrapePlaylist(id));
        }),
    parseYT     : (url) => {
        var p = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
        var matches = url.match(p);
        if (matches) {
            return matches[1];
        }
        return false;
    },
    getTitle    : (id) => {
        const urlEmbed = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&list=LL&index=6&format=json`;
        return new Promise(async (resolve, reject) => {
            try {
                const res = await axios.get(urlEmbed);
                console.log(res);
                if (res.data.hasOwnProperty('title')) {
                    resolve(res.data.title);
                } else {
                    resolve(false);
                }
            } catch (e) {
                resolve(false);
            }
        });
    }
};

module.exports = utils;
