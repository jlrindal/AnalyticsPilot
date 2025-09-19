const { execSync, spawn } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');

class PowerBIBridge {
    constructor() {
        this.connections = new Map();
        this.proxyServiceUrl = 'http://localhost:8080';
    }

    async detectPowerBIInstances() {
        try {
            const response = await fetch(`${this.proxyServiceUrl}/instances`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            if (data.success && data.instances) {
                return data.instances;
            } else {
                return [];
            }

        } catch (error) {
            // Fallback to local detection if .NET service is not available
            return await this.fallbackDetectPowerBIInstances();
        }
    }

    async fallbackDetectPowerBIInstances() {
        try {
            // Get all msmdsrv.exe processes (Analysis Services instances)
            const tasklist = execSync('tasklist /fo csv /fi "imagename eq msmdsrv.exe"', { 
                encoding: 'utf8',
                timeout: 5000 
            });

            const lines = tasklist.split('\n').slice(1); // Skip header
            const processes = [];

            for (const line of lines) {
                if (line.trim() && !line.includes('INFO:')) {
                    const parts = line.split('","');
                    if (parts.length >= 2) {
                        const pid = parts[1].replace(/"/g, '');
                        if (pid && !isNaN(pid)) {
                            processes.push(parseInt(pid));
                        }
                    }
                }
            }



            // Get network connections for these processes
            const instances = [];
            for (const pid of processes) {
                try {
                    const instance = await this.getInstanceInfo(pid);
                    if (instance) {
                        instances.push(instance);
                    }
                } catch (err) {
                    // Silent failure for process info
                }
            }

            return instances;

        } catch (error) {
            return [];
        }
    }

    async getInstanceInfo(pid) {
        try {
            // Use netstat to find the port for this process (PID appears at the end of each line)
            const netstat = execSync(`netstat -ano | findstr " ${pid}"`, { 
                encoding: 'utf8',
                timeout: 3000 
            });

            const lines = netstat.split('\n');
            
            for (const line of lines) {
                if (line.includes('LISTENING') && line.includes('127.0.0.1')) {
                    const parts = line.trim().split(/\s+/);
                    // netstat format: Proto Local_Address Foreign_Address State PID
                    if (parts.length >= 5 && parts[parts.length - 1] == pid) {
                        const localAddress = parts[1];
                        const portMatch = localAddress.match(/:(\d+)$/);
                        
                        if (portMatch) {
                            const port = parseInt(portMatch[1]);
                            
                            // Try to get the parent process (Power BI Desktop window)
                            const parentInfo = await this.getParentProcessInfo(pid);
                            

                            
                            return {
                                name: parentInfo.name || `Power BI Model (PID: ${pid})`,
                                port: port,
                                connectionString: `localhost:${port}`,
                                displayName: `${parentInfo.name || 'Power BI Model'}`,
                                pid: pid
                            };
                        }
                    }
                }
            }

            return null;

        } catch (error) {
            return null;
        }
    }

    async getParentProcessInfo(pid) {
        try {
            // Get parent process information using wmic
            const wmic = execSync(`wmic process where processid=${pid} get parentprocessid /value`, { 
                encoding: 'utf8',
                timeout: 3000 
            });

            const parentPidMatch = wmic.match(/ParentProcessId=(\d+)/);
            if (parentPidMatch) {
                const parentPid = parentPidMatch[1];
                
                // Get parent process details
                const parentDetails = execSync(`wmic process where processid=${parentPid} get name,commandline /value`, { 
                    encoding: 'utf8',
                    timeout: 3000 
                });

                const nameMatch = parentDetails.match(/Name=([^\r\n]+)/);
                const commandMatch = parentDetails.match(/CommandLine=([^\r\n]+)/);
                
                if (nameMatch && nameMatch[1].toLowerCase().includes('pbidesktop')) {
                    // Try to extract file name from command line
                    let fileName = 'Power BI Desktop';
                    if (commandMatch && commandMatch[1]) {
                        const pbixMatch = commandMatch[1].match(/([^\\\/]+\.pbix)/i);
                        if (pbixMatch) {
                            fileName = pbixMatch[1].replace('.pbix', '');
                        }
                    }
                    
                    return { name: fileName };
                }
            }

            return { name: 'Power BI Model' };

        } catch (error) {
            return { name: 'Power BI Model' };
        }
    }

    async connectToPowerBI(connectionString) {
        try {
            const response = await fetch(`${this.proxyServiceUrl}/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    connectionString: `Provider=MSOLAP;Data Source=${connectionString};`
                })
            });

            const data = await response.json();
            
            if (data.success) {
                const connectionId = `conn_${Date.now()}`;
                
                this.connections.set(connectionId, {
                    connectionString,
                    connectedAt: new Date(),
                    serverInfo: data.serverInfo
                });

                return {
                    success: true,
                    connectionId: connectionId,
                    serverName: data.serverInfo.serverName,
                    databaseName: data.serverInfo.database || 'Power BI Model'
                };
            } else {
                throw new Error(data.error || 'Connection failed');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getMetadata(connectionId) {
        try {
            const connectionInfo = this.connections.get(connectionId);
            if (!connectionInfo) {
                throw new Error('Connection not found');
            }

            const response = await fetch(`${this.proxyServiceUrl}/metadata`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    connectionString: connectionInfo.connectionString
                })
            });

            const data = await response.json();
            
            if (data.success) {
                return data.metadata;
            } else {
                throw new Error(data.error || 'Failed to extract metadata');
            }

        } catch (error) {
            throw error;
        }
    }

    async getWorkspaceDatasets(workspaceName, accessToken) {
        try {
            const response = await fetch(`${this.proxyServiceUrl}/get-workspace-datasets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    workspaceName: workspaceName,
                    accessToken: accessToken
                })
            });

            const data = await response.json();
            
            if (data.success) {
                return data.datasets;
            } else {
                throw new Error(data.error || 'Failed to get workspace datasets');
            }

        } catch (error) {
            throw error;
        }
    }



    async executeDax(query, connectionId) {
        try {
            const connectionInfo = this.connections.get(connectionId);
            if (!connectionInfo) {
                throw new Error('Connection not found');
            }

            const response = await fetch(`${this.proxyServiceUrl}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    connectionString: `Provider=MSOLAP;Data Source=${connectionInfo.connectionString};`,
                    query: query
                })
            });

            const data = await response.json();
            
            if (data.success) {
                return data;
            } else {
                throw new Error(data.error || 'Query execution failed');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async addMeasureToPowerBI(connectionId, measureName, measureExpression, tableName) {
        try {
            const connectionInfo = this.connections.get(connectionId);
            if (!connectionInfo) {
                throw new Error('Connection not found');
            }

            const targetInfo = tableName ? ` to table "${tableName}"` : '';

            const requestBody = {
                connectionString: connectionInfo.connectionString,
                measureName: measureName,
                measureExpression: measureExpression
            };

            // Add table name if specified
            if (tableName) {
                requestBody.tableName = tableName;
            }

            const response = await fetch(`${this.proxyServiceUrl}/addmeasure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            
            if (data.success) {
                return {
                    success: true,
                    message: data.message || `Measure "${measureName}" added successfully`,
                    tableName: data.tableName
                };
            } else {
                throw new Error(data.error || 'Failed to add measure to Power BI model');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async addCalculatedColumnToPowerBI(connectionId, columnName, columnExpression, tableName) {
        try {
            const connectionInfo = this.connections.get(connectionId);
            if (!connectionInfo) {
                throw new Error('Connection not found');
            }
    
            const targetInfo = tableName ? ` to table "${tableName}"` : '';
    
            const requestBody = {
                connectionString: connectionInfo.connectionString,
                columnName: columnName,
                columnExpression: columnExpression
            };
    
            // Add table name if specified
            if (tableName) {
                requestBody.tableName = tableName;
            }
    

    
            const response = await fetch(`${this.proxyServiceUrl}/addcalculatedcolumn`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
    

    
            // Check if response is OK before trying to parse JSON
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
    
            // Get the raw text first to see what we're actually receiving
            const responseText = await response.text();
    
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }
            
            if (data.success) {
                return {
                    success: true,
                    message: data.message || `Calculated column "${columnName}" added successfully`,
                    tableName: data.tableName
                };
            } else {
                throw new Error(data.error || 'Failed to add calculated column to Power BI model');
            }
    
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async addCalculatedTableToPowerBI(connectionId, tableName, tableExpression) {
        try {
            const connectionInfo = this.connections.get(connectionId);
            if (!connectionInfo) {
                throw new Error('Connection not found');
            }
    
            const requestBody = {
                connectionString: connectionInfo.connectionString,
                tableName: tableName,
                tableExpression: tableExpression
            };
    
            const response = await fetch(`${this.proxyServiceUrl}/addcalculatedtable`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
    
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
    
            const responseText = await response.text();
    
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                throw new Error(`Invalid JSON response: ${responseText}`);
            }
            
            if (data.success) {
                return {
                    success: true,
                    message: data.message || `Calculated table "${tableName}" created successfully`,
                    tableName: tableName
                };
            } else {
                throw new Error(data.error || 'Failed to create calculated table in Power BI model');
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    disconnect(connectionId) {
        return this.connections.delete(connectionId);
    }

    getConnectionInfo(connectionId) {
        return this.connections.get(connectionId);
    }

    getAllConnections() {
        return Array.from(this.connections.entries()).map(([id, info]) => ({
            id,
            connectionString: info.connectionString,
            connectedAt: info.connectedAt,
            serverInfo: info.serverInfo
        }));
    }
}

module.exports = new PowerBIBridge(); 