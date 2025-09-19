const { app, BrowserWindow, ipcMain, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
// const { autoUpdater } = require('electron-updater'); // Disabled to fix installer error
const isDev = process.argv.includes('--dev');
const Store = require('electron-store');
const store = new Store();

// Remove Supabase dependencies - now using direct API token authentication

// Auto-updater configuration - DISABLED to fix installer error
/*
if (!isDev) {
  // Configure auto-updater for Supabase
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://ewlzjruhuzjypxtdjamv.supabase.co/storage/v1/object/public/app-updates//'
  });

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { type: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { type: 'available', info });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { type: 'not-available', info });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { type: 'error', error: err.message });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { type: 'progress', progress: progressObj });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { type: 'downloaded', info });
    }
  });
}
*/

let mainWindow;
let settingsWindow = null;

// Simplified update management - remove Supabase dependency
function compareVersions(version1, version2) {
  const v1 = version1.split('.').map(Number);
  const v2 = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1.length, v2.length);
  while (v1.length < maxLength) v1.push(0);
  while (v2.length < maxLength) v2.push(0);
  
  for (let i = 0; i < maxLength; i++) {
    if (v1[i] > v2[i]) return 1;
    if (v1[i] < v2[i]) return -1;
  }
  return 0;
}

// Proxy service management
let proxyServiceProcess = null;

async function startProxyService() {
  try {
    if (proxyServiceProcess && !proxyServiceProcess.killed) {
      return true; // Already running
    }

    const bridgePath = path.join(__dirname, 'bridge');
    const proxyExePath = path.join(bridgePath, 'PowerBIProxy.exe');
    
    proxyServiceProcess = spawn(proxyExePath, [], {
      cwd: bridgePath,
      stdio: 'pipe',
      detached: false
    });

    proxyServiceProcess.on('error', (error) => {
      console.error('Proxy service error:', error);
    });

    proxyServiceProcess.on('exit', (code, signal) => {
      console.log('Proxy service exited with code:', code, 'signal:', signal);
      proxyServiceProcess = null;
    });

    // Wait a moment for the service to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if service is running
    return await checkServiceRunning();
  } catch (error) {
    console.error('Failed to start proxy service:', error);
    return false;
  }
}

function stopProxyService() {
  if (proxyServiceProcess && !proxyServiceProcess.killed) {
    proxyServiceProcess.kill('SIGTERM');
    proxyServiceProcess = null;
  }
}

async function checkServiceRunning() {
  try {
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:8080/test', {
      timeout: 3000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

function createWindow() {
  // Set native theme to dark to match app appearance
  nativeTheme.themeSource = 'dark';
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: false,
    backgroundColor: '#0d1117',  // Dark theme background to match app
    titleBarStyle: 'default'  // Ensure consistent dark title bar
  });

  // Remove the default menu bar
  Menu.setApplicationMenu(null);

  // Load main application directly - no login required
  mainWindow.loadFile('renderer/index.html');
  
  // Handle keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Handle second instance
app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Someone tried to run a second instance, focus our window instead
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Start the proxy service first
  try {
    console.log('Starting PowerBI proxy service...');
    const serviceStarted = await startProxyService();
    if (serviceStarted) {
      console.log('PowerBI proxy service started successfully');
    } else {
      console.warn('Failed to start PowerBI proxy service');
    }
  } catch (error) {
    console.error('Error starting proxy service:', error);
  }
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Stop the proxy service when app quits
    stopProxyService();
    app.quit();
  }
});



app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Settings window management
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 700,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    resizable: false,
    backgroundColor: '#0d1117',  // Dark theme background to match app
    titleBarStyle: 'default'  // Ensure consistent dark title bar
  });

  settingsWindow.loadFile('renderer/settings.html');
  
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    // Notify main window to reload API configuration
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-changed');
    }
  });
}

// API Settings management
ipcMain.handle('open-settings', async (event) => {
  createSettingsWindow();
  return { success: true };
});

ipcMain.handle('save-api-settings', async (event, config) => {
  try {
    // Get existing configurations
    const configs = store.get('apiConfigs', []);
    
    // Add unique ID if new config
    if (!config.id) {
      config.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }
    
    // Ensure models is an array - migrate old single model format
    if (config.modelName && !config.models) {
      config.models = [{ name: config.modelName, isDefault: true }];
      delete config.modelName; // Remove old field
    }
    
    // Ensure at least one model is marked as default
    if (config.models && config.models.length > 0) {
      const hasDefault = config.models.some(m => m.isDefault);
      if (!hasDefault) {
        config.models[0].isDefault = true;
      }
    }
    
    // Find existing config with same ID or add new one
    const existingIndex = configs.findIndex(c => c.id === config.id);
    if (existingIndex >= 0) {
      configs[existingIndex] = config;
    } else {
      configs.push(config);
    }
    
    // Save updated configurations
    store.set('apiConfigs', configs);
    
    // If this is the first config, make it active
    const activeConfigId = store.get('activeConfigId', null);
    if (!activeConfigId || configs.length === 1) {
      store.set('activeConfigId', config.id);
    }
    
    return { success: true, configId: config.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-api-settings', async (event) => {
  try {
    // For backward compatibility, check for old single config first
    const oldConfig = store.get('apiConfig', null);
    if (oldConfig && !store.has('apiConfigs')) {
      // Migrate old config to new format with models array
      const configWithId = { 
        ...oldConfig, 
        id: 'migrated-' + Date.now(),
        models: oldConfig.modelName ? [{ name: oldConfig.modelName, isDefault: true }] : []
      };
      delete configWithId.modelName; // Remove old field
      store.set('apiConfigs', [configWithId]);
      store.set('activeConfigId', configWithId.id);
      store.delete('apiConfig'); // Remove old format
      
      // Return config with selected model for API client compatibility
      const result = { ...configWithId };
      if (result.models && result.models.length > 0) {
        const selectedModel = result.models.find(m => m.isDefault) || result.models[0];
        result.modelName = selectedModel.name; // For API client compatibility
      }
      return result;
    }
    
    // Return active configuration
    const activeConfigId = store.get('activeConfigId', null);
    const selectedModelName = store.get('selectedModelName', null);
    const configs = store.get('apiConfigs', []);
    
    if (activeConfigId) {
      const activeConfig = configs.find(c => c.id === activeConfigId);
      if (activeConfig) {
        // Migrate old single model format if needed
        if (activeConfig.modelName && !activeConfig.models) {
          activeConfig.models = [{ name: activeConfig.modelName, isDefault: true }];
          delete activeConfig.modelName;
        }
        
        // Return config with selected model for API client compatibility
        const result = { ...activeConfig };
        if (result.models && result.models.length > 0) {
          const selectedModel = selectedModelName 
            ? result.models.find(m => m.name === selectedModelName)
            : result.models.find(m => m.isDefault);
          
          if (selectedModel) {
            result.modelName = selectedModel.name; // For API client compatibility
          } else {
            result.modelName = result.models[0].name; // Fallback to first model
          }
        }
        return result;
      }
    }
    
    // Fallback to first config
    if (configs.length > 0) {
      const config = { ...configs[0] };
      if (config.modelName && !config.models) {
        config.models = [{ name: config.modelName, isDefault: true }];
        delete config.modelName;
      }
      if (config.models && config.models.length > 0) {
        const selectedModel = config.models.find(m => m.isDefault) || config.models[0];
        config.modelName = selectedModel.name;
      }
      return config;
    }
    
    return null;
  } catch (error) {
    return null;
  }
});

// New handlers for multiple config management
ipcMain.handle('get-all-api-configs', async (event) => {
  try {
    const configs = store.get('apiConfigs', []);
    const activeConfigId = store.get('activeConfigId', null);
    return { configs, activeConfigId };
  } catch (error) {
    return { configs: [], activeConfigId: null };
  }
});

ipcMain.handle('set-active-config', async (event, configId, modelName = null) => {
  try {
    store.set('activeConfigId', configId);
    if (modelName) {
      store.set('selectedModelName', modelName);
    } else {
      // Clear selected model to use default
      store.delete('selectedModelName');
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-selected-model', async (event, modelName) => {
  try {
    store.set('selectedModelName', modelName);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-api-config', async (event, configId) => {
  try {
    const configs = store.get('apiConfigs', []);
    const updatedConfigs = configs.filter(c => c.id !== configId);
    store.set('apiConfigs', updatedConfigs);
    
    // If deleted config was active, set first remaining as active
    const activeConfigId = store.get('activeConfigId', null);
    if (activeConfigId === configId) {
      const newActiveId = updatedConfigs.length > 0 ? updatedConfigs[0].id : null;
      store.set('activeConfigId', newActiveId);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-api-connection', async (event, config) => {
  const { apiKey, apiUrl, providerType } = config;

  try {
    const fetch = require('node-fetch');
    
    // For Ollama, first check if the service is running by testing the root endpoint
    if (providerType === 'ollama') {
      try {
        // Extract base URL more reliably and force IPv4 for localhost
        const url = new URL(apiUrl);
        let baseUrl = `${url.protocol}//${url.host}`;

        // Force IPv4 localhost to avoid IPv6 connection issues
        if (url.hostname === 'localhost') {
          baseUrl = `${url.protocol}//127.0.0.1:${url.port}`;
        }
        const pingController = new AbortController();
        const pingTimeoutId = setTimeout(() => pingController.abort(), 5000);

        const pingResponse = await fetch(baseUrl, {
          method: 'GET',
          signal: pingController.signal
        });

        clearTimeout(pingTimeoutId);

        if (!pingResponse.ok) {
          return { success: false, error: `Ollama service not responding on ${baseUrl}. Status: ${pingResponse.status}` };
        }
      } catch (pingError) {
        return { success: false, error: `Cannot reach Ollama service. Make sure Ollama is running on localhost:11434. Error: ${pingError.message}` };
      }
    }
    
    // Get model name - could be direct modelName or from models array
    let modelName = config.modelName;
    if (!modelName && config.models && config.models.length > 0) {
      modelName = config.models[0].name; // Use first model for testing
    }

    // Determine headers based on provider type and URL pattern
    const headers = {
      'Content-Type': 'application/json'
    };

    let body = {
      model: modelName,
      messages: [{ role: 'user', content: 'Test' }]
    };

    // Add authentication and adjust request based on provider type and API type
    if (providerType === 'ollama') {
      // Ollama doesn't require authentication and uses different format
      body = {
        model: modelName,
        prompt: 'System: You are a helpful assistant.\n\nUser: Test\n\nAssistant:',
        stream: false
      };
    } else if (apiUrl.includes('openai.com')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      body.max_completion_tokens = 5;
    } else if (apiUrl.includes('anthropic.com')) {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body.max_tokens = 5;
    } else if (apiUrl.includes('googleapis.com')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      delete body.messages;
      body.contents = [{ role: 'user', parts: [{ text: 'Test' }] }];
      body.generationConfig = { maxOutputTokens: 5 };
    } else {
      // Default to Bearer token if API key is provided
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      body.max_tokens = 5;
    }

    // Set longer timeout for Ollama (large models can be slow)
    const timeoutMs = providerType === 'ollama' ? 120000 : 10000; // 120s for Ollama, 10s for others
    
    // Fix IPv4/IPv6 localhost issue for the main request too
    let requestUrl = apiUrl;
    if (providerType === 'ollama') {
      const url = new URL(apiUrl);
      if (url.hostname === 'localhost') {
        requestUrl = `${url.protocol}//127.0.0.1:${url.port}${url.pathname}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    // Handle OpenAI parameter compatibility issues
    if (!response.ok && apiUrl.includes('openai.com') && body.max_completion_tokens) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || errorData.message || '';
      
      // If the error mentions max_tokens not supported, retry with max_tokens
      if (errorMessage.includes('max_completion_tokens') || errorMessage.includes('max_tokens')) {
        console.log('Retrying test connection with max_tokens parameter for older OpenAI model...');
        const retryBody = { ...body };
        delete retryBody.max_completion_tokens;
        retryBody.max_tokens = 5;
        
        response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(retryBody)
        });
      }
    }

    if (response.ok) {
      // Parse response to ensure it's valid
      const responseData = await response.json().catch(() => null);
      
      if (providerType === 'ollama') {
        // Ollama should return a response with a 'response' field
        if (responseData && typeof responseData.response === 'string') {
          return { success: true, message: 'Ollama connection successful' };
        } else {
          return { success: false, error: 'Invalid Ollama response format' };
        }
      } else {
        // For other providers, check for standard format
        if (responseData && (responseData.choices || responseData.content || responseData.candidates)) {
          return { success: true, message: 'API connection successful' };
        } else {
          return { success: true, message: 'Connection successful (response format may vary)' };
        }
      }
    } else {
      const errorData = await response.json().catch(() => ({ 
        error: { message: `HTTP ${response.status}: ${response.statusText}` }
      }));
      return { success: false, error: errorData.error?.message || errorData.message || response.statusText };
    }
  } catch (error) {
    // Provide more specific error messages for common Ollama issues
    let errorMessage = error.message;
    
    if (providerType === 'ollama') {
      if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to Ollama. Make sure Ollama is running and try: curl http://localhost:11434/api/generate';
      } else if (error.name === 'AbortError' || error.message.includes('aborted')) {
        errorMessage = 'Ollama request timed out after 120 seconds. Your model might be too large or slow. Try a smaller/faster model.';
      } else if (error.message.includes('fetch is not defined')) {
        errorMessage = 'Network error - please check your connection';
      } else if (error.message.includes('ENOTFOUND')) {
        errorMessage = 'Cannot resolve localhost. Make sure Ollama is running on localhost:11434';
      }
    }
    return { success: false, error: errorMessage };
  }
});

// Removed all Supabase authentication handlers - using direct API tokens now

// Removed anthropic chat handler - now handled by direct API client

// IPC handler for opening external URLs in default browser
ipcMain.handle('shell:openExternal', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC handlers for bridge connectivity
ipcMain.handle('detect-powerbi-instances', async (event) => {
  try {
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    return await ProxyServiceBridge.detectPowerBIInstances();
  } catch (error) {
    return [];
  }
});

ipcMain.handle('connect-powerbi', async (event, connectionString) => {
  try {
    // This will be implemented to use bridge connection logic
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    return await ProxyServiceBridge.connectToPowerBI(connectionString);
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('get-metadata', async (event, connectionId) => {
  try {
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    return await ProxyServiceBridge.getMetadata(connectionId);
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('execute-dax', async (event, query, connectionId) => {
  try {
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    return await ProxyServiceBridge.executeDax(query, connectionId);
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('add-measure-powerbi', async (event, { connectionId, measureName, measureExpression, tableName }) => {
  try {
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    return await ProxyServiceBridge.addMeasureToPowerBI(connectionId, measureName, measureExpression, tableName);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-calculated-column-powerbi', async (event, { connectionId, columnName, columnExpression, tableName }) => {
  try {
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    const result = await ProxyServiceBridge.addCalculatedColumnToPowerBI(
      connectionId, columnName, columnExpression, tableName
    );
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('addCalculatedTableToPowerBI', async (event, params) => {
  try {
    const ProxyServiceBridge = require('./bridge/powerbi-bridge');
    const { connectionId, tableName, tableExpression } = params;
    const result = await ProxyServiceBridge.addCalculatedTableToPowerBI(
      connectionId, tableName, tableExpression
    );
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Proxy service status and management IPC handlers
ipcMain.handle('check-proxy-service', async () => {
  const isRunning = await checkServiceRunning();
  return {
    running: isRunning,
    url: 'http://localhost:8080'
  };
});

ipcMain.handle('restart-proxy-service', async () => {
  try {
    stopProxyService();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a moment
    const started = await startProxyService();
    return {
      success: started,
      message: started ? 'Service restarted successfully' : 'Failed to restart service'
    };
  } catch (error) {
    return {
      success: false,
      message: `Error restarting service: ${error.message}`
    };
  }
});

// Auto-updater IPC handlers
ipcMain.handle('updater:check-for-updates', async (event) => {
  try {
    if (isDev) {
      return { success: false, error: 'Updates are disabled in development mode' };
    }
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:download-update', async (event) => {
  try {
    if (isDev) {
      return { success: false, error: 'Updates are disabled in development mode' };
    }
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// DISABLED - updater functionality removed to fix installer error
/*
ipcMain.handle('updater:install-update', async (event) => {
  try {
    if (isDev) {
      return { success: false, error: 'Updates are disabled in development mode' };
    }
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
*/

// Removed terms acceptance handlers - no longer needed

// Removed page loading handler - simplified to single page

// Simplified update management
ipcMain.handle('update:get-current-version', async (event) => {
  try {
    const currentVersion = require('./package.json').version;
    return { success: true, version: currentVersion };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Power BI Service authentication handlers
ipcMain.handle('authenticate-powerbi-service', async (event, serverName = null) => {
  try {
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:8080/authenticate-powerbi-service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverName: serverName })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('connect-powerbi-service', async (event, xmlaEndpoint, accessToken) => {
  try {
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:8080/connect-with-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlaEndpoint: xmlaEndpoint,
        accessToken: accessToken
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-workspace-datasets', async (event, workspaceName, accessToken) => {
  try {
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:8080/get-workspace-datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceName: workspaceName,
        accessToken: accessToken
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}); 