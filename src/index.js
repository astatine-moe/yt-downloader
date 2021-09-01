const { app, BrowserWindow, ipcMain, dialog, autoUpdater, Notification } = require('electron');

const pkg = require('../package.json');

const { format } = require('util'),
    os = require('os'),
    musicDir = os.homedir() + '\\Music',
    ytList = require('youtube-playlist'),
    thumbnail = require('youtube-thumbnail'),
    hat = require('hat');

const sleep = (ms) => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
};
