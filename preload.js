const { contextBridge, ipcRenderer } = require('electron');



// Expose protected methods that allow the renderer process to use the main process
contextBridge.exposeInMainWorld('electronAPI', {
  // Analytics Pilot functionality
  detectPowerBIInstances: () => ipcRenderer.invoke('detect-powerbi-instances'),
  connectPowerBI: (connectionString) => ipcRenderer.invoke('connect-powerbi', connectionString),
  getMetadata: (connectionId) => ipcRenderer.invoke('get-metadata', connectionId),
  executeDax: (query, connectionId) => ipcRenderer.invoke('execute-dax', query, connectionId),
  addMeasureToPowerBI: (params) => ipcRenderer.invoke('add-measure-powerbi', params),
  addCalculatedColumnToPowerBI: (params) => ipcRenderer.invoke('add-calculated-column-powerbi', params),
  addCalculatedTableToPowerBI: (params) => ipcRenderer.invoke('addCalculatedTableToPowerBI', params),
  
  // Proxy service management
  checkProxyService: () => ipcRenderer.invoke('check-proxy-service'),
  restartProxyService: () => ipcRenderer.invoke('restart-proxy-service'),
  
  // Power BI Service authentication
  authenticatePowerBIService: (serverName) => ipcRenderer.invoke('authenticate-powerbi-service', serverName),
  connectPowerBIService: (xmlaEndpoint, accessToken) => 
    ipcRenderer.invoke('connect-powerbi-service', xmlaEndpoint, accessToken),
  getWorkspaceDatasets: (workspaceName, accessToken) => 
    ipcRenderer.invoke('get-workspace-datasets', workspaceName, accessToken),
  
  settings: {
    open: () => ipcRenderer.invoke('open-settings'),
    save: (settings) => ipcRenderer.invoke('save-api-settings', settings),
    load: () => ipcRenderer.invoke('load-api-settings'),
    testConnection: (provider, token, model) => ipcRenderer.invoke('test-api-connection', provider, token, model),
    getAllConfigs: () => ipcRenderer.invoke('get-all-api-configs'),
    setActiveConfig: (configId, modelName) => ipcRenderer.invoke('set-active-config', configId, modelName),
    setSelectedModel: (modelName) => ipcRenderer.invoke('set-selected-model', modelName),
    deleteConfig: (configId) => ipcRenderer.invoke('delete-api-config', configId)
  },
  
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  
  // Update management
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (downloadUrl) => ipcRenderer.invoke('update:download', downloadUrl),
  getCurrentVersion: () => ipcRenderer.invoke('update:get-current-version'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, data) => callback(data)),
  
  // Settings change notification
  onSettingsChanged: (callback) => ipcRenderer.on('settings-changed', callback)
});

// Settings API for compatibility
contextBridge.exposeInMainWorld('electron', {
  settings: {
    open: () => ipcRenderer.invoke('open-settings'),
    save: (settings) => ipcRenderer.invoke('save-api-settings', settings),
    load: () => ipcRenderer.invoke('load-api-settings'),
    testConnection: (provider, token, model) => ipcRenderer.invoke('test-api-connection', provider, token, model),
    getAllConfigs: () => ipcRenderer.invoke('get-all-api-configs'),
    setActiveConfig: (configId, modelName) => ipcRenderer.invoke('set-active-config', configId, modelName),
    setSelectedModel: (modelName) => ipcRenderer.invoke('set-selected-model', modelName),
    deleteConfig: (configId) => ipcRenderer.invoke('delete-api-config', configId)
  }
});