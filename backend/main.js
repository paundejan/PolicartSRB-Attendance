const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure database exists next to the executable (portable mode)
const appFolder = app.isPackaged
    ? path.dirname(process.execPath)  // Folder where PolicatSRB.exe lives
    : __dirname;                       // Dev mode: project root

const targetDbFile = path.join(appFolder, 'data', 'dev.db');
const dataDir = path.join(appFolder, 'data');

// Create data folder if it doesn't exist
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Set it globally so Prisma in server.js/scraper.js can read it
process.env.SQLITE_DB_URL = `file:${targetDbFile}`;

if (!fs.existsSync(targetDbFile)) {
    try {
        const defaultDb = path.join(__dirname, 'prisma', 'dev.db');
        if (fs.existsSync(defaultDb)) {
            fs.copyFileSync(defaultDb, targetDbFile);
            console.log("Database initialized in portable data folder: ", targetDbFile);
        }
    } catch (e) {
        console.error("Critical error copying local DB defaults:", e);
    }
}

// Start the existing Backend
require('./src/server.js');

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Don't show until loaded
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Since React uses the "glassmorphism" look, we just need the default frame
  Menu.setApplicationMenu(null);

  // The Express server will be listening on 3001 and returning our compiled Vite build
  mainWindow.loadURL('http://localhost:3001');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
