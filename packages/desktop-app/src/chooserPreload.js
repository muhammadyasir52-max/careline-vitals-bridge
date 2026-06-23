const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chooserBridge', {
  onDeviceList: (callback) => ipcRenderer.on('device-list', (event, deviceList) => callback(deviceList)),
  selectDevice: (deviceId) => ipcRenderer.send('bluetooth-device-selected', deviceId),
});
