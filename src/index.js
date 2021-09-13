const { app, BrowserWindow, ipcMain, dialog, autoUpdater, Notification } = require('electron');

const pkg = require('../package.json');

const { format } = require('util'),
    os = require('os'),
    sanitize = require('sanitize-filename'),
    thumbnail = require('youtube-thumbnail'),
    hat = require('hat');
let musicDir = os.homedir() + '\\Music';
const utils = require('./utils'),
    { Downloader } = require('./Download');

//store
const Store = require('electron-store'),
    store = new Store();

const path = require('path');
const defaults = {
    theme      : 'dark',
    multiDL    : false,
    saveFolder : musicDir
};

for (const key in defaults) {
    const value = defaults[key];
    if (!store.get(key)) {
        console.log('set', value);
        store.set(key, value);
    }
}

if (store.get('saveFolder')) {
    musicDir = store.get('saveFolder');
}

//uninstall, install, shortcuts
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow;
const createWindow = () => {
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        title           : 'YouTube downloader',
        width           : width / 1.5,
        height          : height / 1.25,
        backgroundColor : '#0c0c0c',
        show            : false,
        autoHideMenuBar : true,
        webPreferences  : {
            preload          : path.join(__dirname, 'render', 'preload.js'),
            contextIsolation : true,
            devTools         : !app.isPackaged
        }
    });
    mainWindow.getMaximumSize();
    mainWindow.loadURL(`file://${__dirname}/render/index.html`);

    mainWindow.on('ready-to-show', () => {
        mainWindow.focus();
        mainWindow.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

app.on('ready', createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

/**
 * Queue
 */
const queue = [];
const formats = [ 'mp4', 'mp3', 'ogg', 'mkv' ];
let queueStatus = 'empty';

ipcMain.on('addQueue', async (event, data) => {
    const title = await utils.getTitle(data.id);
    if (!title) return event.sender.send('error', { message: 'Cannot find video' });
    const tn = thumbnail('https://youtube.com/watch?v=' + data.id);
    const quality = data.quality;

    event.sender.send('addQueue', {
        id       : data.id,
        data     : { thumbnail: tn.medium },
        title,
        format   : data.format,
        musicDir
    });
    queue.push({ id: data.id, format: data.format, musicDir, quality });
});
const queueInterval = 1500;
let queuePing = Date.now();
let queueHandle = setInterval(() => {
    queuePing = Date.now();
    if (queue.length === 0) return;
    if (queueStatus !== 'empty') return;
    let item = queue.shift();
    if (!store.get('multiDL')) {
        queueStatus = item.id;
    }
    const { format, id } = item;
    if (!formats.includes(format)) return;
    let video = new Downloader(id, format, musicDir, item.quality);

    video.start();

    video.on('fail', (message) => {
        queueStatus = 'empty';
        log.error(message);
        mainWindow.webContents.send('fail', {
            id,
            text : 'Failed to download, check logs'
        });
    });
    video.on('close', (message) => {
        if (!store.get('multiDL')) {
            mainWindow.setProgressBar(-1);
            mainWindow.flashFrame(true);
            setTimeout(() => {
                mainWindow.flashFrame(false);
            }, 2500);
        }
        queueStatus = 'empty';
        mainWindow.webContents.send('finish', {
            id,
            text : 'Finished downloading'
        });
    });
    video.on('progress', (message) => {
        if (format === 'mp3' || format === 'ogg') {
            const { start, downloaded, total, text } = message;
            const percent = downloaded / total * 100;
            if (!store.get('multiDL')) {
                mainWindow.setProgressBar(percent / 100);
            }
            mainWindow.webContents.send('edit', {
                progress : percent,
                id,
                text,
                eta      : 'IDFK'
            });
        } else {
            const { start, audio, video, id } = message;
            const combined = { downloaded: audio.downloaded + video.downloaded, total: audio.total + video.total };
            const percent = combined.downloaded / combined.total * 100;
            if (!store.get('multiDL')) {
                mainWindow.setProgressBar(percent / 100);
            }
            mainWindow.webContents.send('edit', {
                progress : percent,
                id,
                text     : 'Downloading audio and video track...',
                eta      : 'IDFK'
            });
        }
    });
}, queueInterval);

/**
 * IPCMain
 */
ipcMain.on('selectFolder', async (event, arg) => {
    result = await selectDirectory();
    console.log(result);
    if (result) {
        musicDir = store.get('saveFolder');
        event.sender.send('ready', { store: store.get('saveFolder'), v: pkg.version });
    } else {
        //cancelled
        event.sender.send('error', { error: 'Cancelled folder select' });
    }
});
ipcMain.on('ping', (event, arg) => {
    event.sender.send('ping', queuePing);
});
ipcMain.on('ready', (event, arg) => {
    event.sender.send('ready', {
        store   : store.get('saveFolder'),
        v       : pkg.version,
        multiDL : store.get('multiDL')
    });
    if (typeof store.get('version') === 'undefined') {
        event.sender.send('patchNotes', true);
        store.set('version', pkg.version);
    } else {
        if (store.get('version') !== pkg.version) {
            event.sender.send('patchNotes', true);
            store.set('version', pkg.version);
        }
    }
});
/**
 * Auto update
 */
const isDev = require('electron-is-dev'),
    log = require('electron-log');
const ytdl = require('ytdl-core');
const ElectronLog = require('electron-log');
const { send } = require('process');
if (!isDev) {
    setTimeout(() => {
        app.isReady() ? initUpdater() : app.on('ready', () => initUpdater());
    }, 5000);
}

let update = false;

const initUpdater = () => {
    const feedURL = `http://apps.maskros.dev/youtube/update/${process.platform}/${app.getVersion()}`;

    autoUpdater.setFeedURL(feedURL);

    autoUpdater.on('update-available', () => {
        update = true;
        mainWindow.webContents.send('update-available', true);
    });
    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, releaseDate, updateURL) => {
        mainWindow.webContents.send('update-downloaded', true);
        ipcMain.on('restart', (event, arg) => {
            autoUpdater.quitAndInstall();
        });
    });
    autoUpdater.on('error', (err) => {
        log.error(err);
    });

    autoUpdater.checkForUpdates();
    setInterval(() => {
        if (update) return;
        autoUpdater.checkForUpdates();
    }, 600000);
};
const selectDirectory = () => {
    return new Promise((res) => {
        dialog
            .showOpenDialog(mainWindow, {
                title       : 'Select download folder',
                defaultPath : musicDir,
                properties  : [ 'openDirectory' ]
            })
            .then((result) => {
                console.log(result);
                if (result.filePaths.length) {
                    musicDir = result.filePaths[0];
                    store.set('saveFolder', result.filePaths[0]);
                    res(true);
                } else {
                    res(false);
                }
            })
            .catch(() => {
                res(false);
            });
    });
};
