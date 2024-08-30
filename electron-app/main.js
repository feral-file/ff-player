const { app, BrowserWindow } = require('electron');

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, // Recommended for security
    },
  });

  mainWindow.loadURL('https://display.feralfile.com');

  mainWindow.on('closed', function () {
    mainWindow = null;
    app.quit();
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
