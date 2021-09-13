const { EventEmitter } = require('events'),
    ytdl = require('ytdl-core'),
    fs = require('fs'),
    fluentFfmpeg = require('fluent-ffmpeg'),
    ffmpeg = require('ffmpeg-static-electron'),
    cp = require('child_process'),
    path = require('path');
const utils = require('./utils');

fluentFfmpeg.setFfmpegPath(ffmpeg.path);

const videoFormats = [ 'mp4', 'mkv' ];
const audioFormats = [ 'mp3', 'ogg', 'wav', 'flac', 'm4a' ];

const sanitize = require('sanitize-filename');

class Downloader extends EventEmitter {
    constructor (id, format, output, quality = 'highest', interval = 1000) {
        super();
        this.id = id;
        this.format = format;
        this.output = output;
        this.interval = interval;
        this.quality = quality;
        this.tracker = {
            start : 0,
            audio : { downloaded: 0, total: Infinity },
            video : { downloaded: 0, total: Infinity }
        };
    }
    send (type, msg) {
        setImmediate(() => {
            this.emit(type, msg);
        });
    }
    async start () {
        const id = this.id;
        this.tracker.start = Date.now();
        console.log('starting up');
        if (!this.id || !this.format || !this.output) {
            this.send('fail', {
                id      : this.id || 'null',
                message : 'Missing parameter ' + (!this.format ? 'Format' : !this.output ? 'Output' : 'YouTube URL')
            });
            return;
        }
        console.log('parsing title');

        const title = await new Promise((resolve) => {
            ytdl
                .getInfo(id)
                .then((info) => {
                    if (info && info.hasOwnProperty('videoDetails')) {
                        resolve(info.videoDetails.title);
                    } else {
                        resolve(false);
                    }
                })
                .catch((err) => {
                    console.log(err);
                    resolve(false);
                });
        });

        if (!title) {
            this.send('fail', { id, message: 'Invalid YouTube URL' });
            return;
        }

        let output = `${this.output}/${sanitize(title)}.${this.format}`;

        if (videoFormats.includes(this.format)) {
            //download video
            const audio = ytdl(id, {
                filter  : 'audioonly',
                quality : this.quality + 'audio'
            }).on('progress', (_, downloaded, total) => {
                this.tracker.audio = { downloaded, total };
            });
            const video = ytdl(id, {
                filter  : 'videoonly',
                quality : this.quality + 'video'
            }).on('progress', (_, downloaded, total) => {
                this.tracker.video = { downloaded, total };
            });

            const progressBar = setInterval(() => {
                this.send('progress', { ...this.tracker, id });
            }, this.interval);

            const ffmpegProcess = cp.spawn(
                ffmpeg.path,
                [
                    '-loglevel',
                    '0',
                    '-hide_banner',
                    '-i',
                    'pipe:3',
                    '-i',
                    'pipe:4',
                    '-c:v',
                    'copy',
                    '-c:a',
                    'copy',
                    '-f',
                    'matroska',
                    'pipe:5'
                    // Define output container
                ],
                {
                    windowsHide : true,
                    stdio       : [
                        /* Standard: stdin, stdout, stderr */
                        'inherit',
                        'inherit',
                        'inherit',
                        /* Custom: pipe:3, pipe:4, pipe:5 */
                        'pipe',
                        'pipe',
                        'pipe'
                    ]
                }
            );
            ffmpegProcess.on('close', () => {
                //convert back to chosen format
                this.send('close', { id, output });
                clearInterval(progressBar);
            });
            ffmpegProcess.on('error', (e) => {
                this.send('fail', { id, message: e });
            });

            audio.pipe(ffmpegProcess.stdio[3]);
            video.pipe(ffmpegProcess.stdio[4]);
            ffmpegProcess.stdio[5].pipe(fs.createWriteStream(output));
        } else if (audioFormats.includes(this.format)) {
            //download audio
            const audio = ytdl(id, {
                filter  : 'audioonly',
                quality : this.quality + 'audio'
            }).on('progress', (_, downloaded, total) => {
                this.send('progress', {
                    id,
                    start      : this.tracker.start,
                    downloaded,
                    total,
                    text       : 'Downloading audio track...'
                });
            });

            fluentFfmpeg(audio)
                .audioBitrate(128)
                .save(output)
                .on('error', (e) => {
                    this.send('fail', { id, message: e });
                })
                .on('end', () => {
                    this.send('close', { id, output });
                });
        } else {
            this.send('fail', 'Invalid format');
        }
    }
}

module.exports = { Downloader };
