const ConnectionManager = require('../lib/connection-manager');

class AnalyticsBridge {
    constructor() {
        this.connectionManager = new ConnectionManager();
    }

    /**
     * Detect Power BI Desktop instances
     */
    async detectPowerBIInstances() {
        try {
            const instances = await this.connectionManager.detectPowerBIInstances();
            
            // Transform to match expected format
            return instances.map(instance => ({
                name: instance.name,
                port: instance.port,
                connectionString: instance.connectionString,
                displayName: instance.displayName,
                pid: instance.pid,
                fileName: instance.fileName,
                icon: instance.icon,
                serverType: instance.serverType
            }));

        } catch (error) {
            return [];
        }
    }

    /**
     * Connect to Power BI or Analysis Services
     */
    async connectToPowerBI(connectionString) {
        try {
            const result = await this.connectionManager.connect({
                connectionString: connectionString
            });

            if (result.success) {
                return {
                    success: true,
                    connectionId: result.connectionId,
                    serverName: result.serverName,
                    databaseName: result.databaseName,
                    message: 'Connected successfully'
                };
            } else {
                throw new Error(result.error || 'Connection failed');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message || 'Connection failed'
            };
        }
    }

    /**
     * Connect to a specific Power BI instance by PID
     */
    async connectToInstance(pid) {
        try {
            const result = await this.connectionManager.connectToInstance(pid);
            
            if (result.success) {
                return {
                    success: true,
                    connectionId: result.connectionId,
                    serverName: result.serverName,
                    databaseName: result.databaseName
                };
            } else {
                throw new Error(result.error || 'Failed to connect to instance');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute DAX query
     */
    async executeDax(query, connectionId) {
        try {
            const result = await this.connectionManager.executeDax(connectionId, query);
            
            if (result.success) {
                return result;
            } else {
                throw new Error(result.error || 'Query execution failed');
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get metadata from connection
     */
    async getMetadata(connectionId) {
        try {
            const result = await this.connectionManager.getMetadata(connectionId);
            
            if (result.success) {
                return result.metadata;
            } else {
                throw new Error(result.error || 'Failed to get metadata');
            }

        } catch (error) {
            throw error;
        }
    }

    /**
     * Disconnect from Power BI
     */
    async disconnect(connectionId) {
        try {
            if (!connectionId) {
                return { success: true, message: 'No connection to disconnect' };
            }

            const result = await this.connectionManager.disconnect(connectionId);
            return { success: true, message: 'Disconnected successfully' };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get connection information
     */
    async getConnectionInfo(connectionId) {
        try {
            return await this.connectionManager.getConnectionInfo(connectionId);
        } catch (error) {
            return null;
        }
    }

    /**
     * Get all active connections
     */
    async getAllConnections() {
        try {
            return await this.connectionManager.getAllConnections();
        } catch (error) {
            return [];
        }
    }

    /**
     * Test a connection
     */
    async testConnection(connectionId) {
        try {
            return await this.connectionManager.testConnection(connectionId);
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate Power BI instance by PID
     */
    async validatePowerBIInstance(pid) {
        try {
            const instances = await this.detectPowerBIInstances();
            return instances.some(instance => instance.pid === pid);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get server information
     */
    async getServerInfo(connectionId) {
        try {
            return await this.connectionManager.getServerInfo(connectionId);
        } catch (error) {
            return null;
        }
    }

    /**
     * Execute multiple DAX queries in batch
     */
    async executeBatch(queries, connectionId) {
        try {
            const results = [];
            
            for (const query of queries) {
                const result = await this.executeDax(query, connectionId);
                results.push(result);
            }
            
            return {
                success: true,
                results: results,
                count: results.length
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Shutdown the bridge
     */
    async shutdown() {
        try {
            await this.connectionManager.shutdown();
        } catch (error) {
            // Silent failure on shutdown
        }
    }
}

module.exports = new AnalyticsBridge(); 