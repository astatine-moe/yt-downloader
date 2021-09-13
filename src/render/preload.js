const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    addToQueue   : (data) => ipcRenderer.send('addQueue', data),
    changeFolder : (data) => ipcRenderer.send('selectFolder', 'running'),
    ready        : (data) => ipcRenderer.send('ready', 'running'),
    restart      : (data) => ipcRenderer.send('restart', 'running'),
    ping         : () => ipcRenderer.send('ping', true),
    receive      : (channel, func) => {
        ipcRenderer.on(channel, func);
    }
});
