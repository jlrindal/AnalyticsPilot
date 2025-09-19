// Generic API client for any chat completion endpoint
class ApiClient {
    constructor() {
        this.config = null;
        this.loadSettings();
    }

    async loadSettings() {
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                this.config = await window.electronAPI.settings.load();
            } else {
                // Fallback to localStorage for single config (backward compatibility)
                const configStr = localStorage.getItem('apiConfig');
                this.config = configStr ? JSON.parse(configStr) : null;
            }
        } catch (error) {
            console.warn('Failed to load API configuration:', error);
            this.config = null;
        }
    }

    async getAllConfigs() {
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                return await window.electronAPI.settings.getAllConfigs();
            }
            return { configs: [], activeConfigId: null };
        } catch (error) {
            console.warn('Failed to load all configurations:', error);
            return { configs: [], activeConfigId: null };
        }
    }

    async setActiveConfig(configId, modelName = null) {
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                const result = await window.electronAPI.settings.setActiveConfig(configId, modelName);
                if (result.success) {
                    await this.loadSettings(); // Reload current config
                }
                return result;
            }
            return { success: false, error: 'Settings API not available' };
        } catch (error) {
            console.warn('Failed to set active configuration:', error);
            return { success: false, error: error.message };
        }
    }

    async setSelectedModel(modelName) {
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                const result = await window.electronAPI.settings.setSelectedModel(modelName);
                if (result.success) {
                    await this.loadSettings(); // Reload current config
                }
                return result;
            }
            return { success: false, error: 'Settings API not available' };
        } catch (error) {
            console.warn('Failed to set selected model:', error);
            return { success: false, error: error.message };
        }
    }

    getAvailableModels() {
        if (this.config && this.config.models) {
            return this.config.models;
        }
        return [];
    }

    getCurrentModel() {
        return this.config?.modelName || null;
    }

    async saveSettings(config) {
        this.config = config;
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                await window.electronAPI.settings.save(config);
            } else {
                // Fallback to localStorage
                localStorage.setItem('apiConfig', JSON.stringify(config));
            }
        } catch (error) {
            console.warn('Failed to save API configuration:', error);
        }
    }

    isConfigured() {
        // For Ollama, API key is not required
        if (this.config && this.config.providerType === 'ollama') {
            return this.config.apiUrl && this.config.modelName;
        }
        // For other providers, API key may be optional (local APIs) or required (cloud APIs)
        return this.config && this.config.apiUrl && this.config.modelName;
    }

    getConfigName() {
        return this.config?.name || 'Unnamed Configuration';
    }

    getModel() {
        return this.config?.modelName;
    }

    async sendMessage(messages, onUpdate = null) {
        if (!this.isConfigured()) {
            throw new Error('API client not configured. Please set up your API configuration in settings.');
        }

        const { apiKey, apiUrl, modelName } = this.config;

        // Determine the authentication method based on common patterns
        const headers = {
            'Content-Type': 'application/json'
        };

        // Add authentication header based on provider type and URL pattern
        const providerType = this.config.providerType || 'standard';
        
        if (providerType === 'ollama') {
            // Ollama doesn't require authentication
            // No authorization header needed
        } else if (apiUrl.includes('openai.com')) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (apiUrl.includes('anthropic.com')) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else if (apiUrl.includes('googleapis.com')) {
            // Google API uses key in URL parameter, but we'll also add it as header for flexibility
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (apiKey) {
            // Default to Bearer token if API key is provided (works for most APIs)
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        // If no API key provided, no auth header (works for local APIs)

        // Format messages and request body based on provider type
        let requestBody;
        
        if (providerType === 'ollama') {
            // Ollama uses generate format with prompt - concatenate all messages into a single prompt
            // to maintain conversation context
            let prompt = '';

            for (const message of messages) {
                if (message.role === 'system') {
                    prompt += `System: ${message.content}\n\n`;
                } else if (message.role === 'user') {
                    prompt += `User: ${message.content}\n\n`;
                } else if (message.role === 'assistant') {
                    prompt += `Assistant: ${message.content}\n\n`;
                }
            }

            // Add final prompt to encourage assistant response
            prompt += 'Assistant:';

            requestBody = {
                model: modelName,
                prompt: prompt,
                stream: !!onUpdate
            };
        } else {
            // Standard OpenAI-compatible format
            requestBody = {
                model: modelName,
                messages: this.formatMessages(messages),
                stream: !!onUpdate
            };
        }

        // Add token limits based on API type
        if (providerType === 'ollama') {
            // Ollama doesn't use max_tokens in the same way, it handles this internally
            // No token limit needed
        } else if (apiUrl.includes('openai.com')) {
            // Use max_completion_tokens for newer OpenAI models (gpt-4o, o1, etc.)
            // Fall back to max_tokens for older models if max_completion_tokens fails
            requestBody.max_completion_tokens = 4096;
        } else if (apiUrl.includes('anthropic.com')) {
            requestBody.max_tokens = 4096;
            
            // Extract system message for Anthropic - they don't accept system role in messages
            const systemMessage = messages.find(msg => msg.role === 'system');
            if (systemMessage) {
                requestBody.system = systemMessage.content;
                // Remove system messages from the messages array for Anthropic
                requestBody.messages = this.formatMessages(messages.filter(msg => msg.role !== 'system'));
            }
        }

        // Add generationConfig for Google-style APIs
        if (apiUrl.includes('googleapis.com')) {
            delete requestBody.messages;
            requestBody.contents = this.formatMessagesForGoogle(messages);
            requestBody.generationConfig = {
                maxOutputTokens: 4096
            };
        } else if (providerType !== 'ollama' && !apiUrl.includes('openai.com') && !apiUrl.includes('anthropic.com')) {
            // Default to max_tokens for unknown APIs (most use OpenAI-compatible format)
            // But skip for Ollama
            requestBody.max_tokens = 4096;
        }

        try {
            // Fix IPv4/IPv6 localhost issue for Ollama
            let requestUrl = apiUrl;
            if (providerType === 'ollama') {
                const url = new URL(apiUrl);
                if (url.hostname === 'localhost') {
                    requestUrl = `${url.protocol}//127.0.0.1:${url.port}${url.pathname}`;
                }
            }

            let response = await fetch(requestUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            // Handle OpenAI parameter compatibility issues
            if (!response.ok && apiUrl.includes('openai.com') && requestBody.max_completion_tokens) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || errorData.message || '';
                
                // If the error mentions max_tokens not supported, retry with max_tokens
                if (errorMessage.includes('max_completion_tokens') || errorMessage.includes('max_tokens')) {
                    console.log('Retrying with max_tokens parameter for older OpenAI model...');
                    const retryBody = { ...requestBody };
                    delete retryBody.max_completion_tokens;
                    retryBody.max_tokens = 4096;
                    
                    response = await fetch(requestUrl, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(retryBody)
                    });
                }
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    error: { message: `HTTP ${response.status}: ${response.statusText}` }
                }));
                throw new Error(errorData.error?.message || errorData.message || `API error: ${response.status}`);
            }

            if (onUpdate) {
                return await this.handleStreamingResponse(response, onUpdate, apiUrl);
            } else {
                return await this.handleResponse(response, apiUrl);
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    formatMessages(messages) {
        // Standard OpenAI format - most APIs use this
        return messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : (msg.role === 'system' ? 'system' : 'assistant'),
            content: msg.content
        }));
    }

    formatMessagesForGoogle(messages) {
        // Google AI format - Google uses 'user' and 'model' roles, no system role
        return messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : (msg.role === 'system' ? 'user' : 'model'),
            parts: [{ text: msg.content }]
        }));
    }

    async handleResponse(response, apiUrl) {
        const data = await response.json();
        
        let content = '';
        let usage = null;
        const providerType = this.config.providerType || 'standard';

        // Handle different response formats
        if (providerType === 'ollama' && data.response) {
            // Ollama generate format
            content = data.response || '';
            usage = {
                prompt_tokens: data.prompt_eval_count || 0,
                completion_tokens: data.eval_count || 0,
                total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
            };
        } else if (data.choices && data.choices[0]) {
            // OpenAI format
            content = data.choices[0].message?.content || '';
            usage = data.usage;
        } else if (data.content && Array.isArray(data.content)) {
            // Anthropic format
            content = data.content.map(block => block.text || '').join('');
            usage = data.usage;
        } else if (data.candidates && data.candidates[0]) {
            // Google format
            content = data.candidates[0].content?.parts?.[0]?.text || '';
            usage = data.usageMetadata;
        } else {
            // Unknown format - try to extract text
            content = data.text || data.message?.content || data.message || JSON.stringify(data);
        }

        return {
            success: true,
            data: {
                content: [{ text: content }],
                metadata: {
                    model: this.config.modelName,
                    provider: this.config.name,
                    usage: usage
                }
            }
        };
    }

    async handleStreamingResponse(response, onUpdate, apiUrl) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    // Handle Server-Sent Events format
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            let delta = '';
                            const providerType = this.config.providerType || 'standard';

                            // Handle different streaming formats
                            if (providerType === 'ollama' && parsed.response) {
                                // Ollama streaming format
                                delta = parsed.response || '';
                            } else if (parsed.choices && parsed.choices[0]) {
                                // OpenAI format
                                delta = parsed.choices[0].delta?.content || '';
                            } else if (parsed.type === 'content_block_delta') {
                                // Anthropic format
                                delta = parsed.delta?.text || '';
                            } else if (parsed.candidates && parsed.candidates[0]) {
                                // Google format
                                delta = parsed.candidates[0].content?.parts?.[0]?.text || '';
                            }

                            if (delta) {
                                fullText += delta;
                                onUpdate(fullText);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    } else if (line.startsWith('{')) {
                        // Handle direct JSON streaming (some APIs)
                        try {
                            const parsed = JSON.parse(line);
                            const delta = parsed.text || parsed.content || '';
                            if (delta) {
                                fullText += delta;
                                onUpdate(fullText);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            return {
                success: true,
                data: {
                    content: [{ text: fullText }],
                    metadata: {
                        model: this.config.modelName,
                        provider: this.config.name
                    }
                }
            };
        } finally {
            reader.releaseLock();
        }
    }

    async testConnection(config) {
        const testMessage = [{
            role: 'user',
            content: 'Hello, please respond with "Test successful!"'
        }];

        try {
            const originalConfig = this.config;
            this.config = config;

            const response = await this.sendMessage(testMessage);
            
            this.config = originalConfig;

            return {
                success: true,
                message: 'Connection test successful'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create global instance
window.apiClient = new ApiClient();

// Export for use in other scripts
window.ApiClient = ApiClient;