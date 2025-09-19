const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class PowerBIBuilder {
    constructor() {
        this.analyticsBridgePath = path.join(__dirname, 'AnalyticsBridge');
        this.srcPath = path.join(this.analyticsBridgePath, 'src');
        this.outputPath = path.join(__dirname, 'bridge', 'lib');
    }

    async build() {
        try {
            // Check if bridge source exists
            if (!fs.existsSync(this.srcPath)) {
                return false;
            }

            // Create output directory
            this.ensureDirectory(this.outputPath);

            // Build ADOTabular project
            this.buildProject(path.join(this.srcPath, 'ADOTabular', 'AnalyticsBridge.ADOTabular.csproj'));

            // Copy built assemblies
            this.copyAssemblies();

            return true;

        } catch (error) {
            return false;
        }
    }

    buildProject(projectPath) {
        const buildCommand = `dotnet build "${projectPath}" --configuration Release --output "${this.outputPath}"`;
        
        try {
            execSync(buildCommand, { 
                stdio: 'inherit',
                cwd: this.srcPath 
            });
        } catch (error) {
            throw new Error(`Failed to build project: ${projectPath}`);
        }
    }

    copyAssemblies() {
        const requiredDlls = [
            'AnalyticsBridge.ADOTabular.dll',
            'Microsoft.AnalysisServices.AdomdClient.dll',
            'Microsoft.AnalysisServices.Core.dll'
        ];

        const sourcePath = path.join(this.srcPath, 'ADOTabular', 'bin', 'Release');
        
        requiredDlls.forEach(dll => {
            const source = path.join(sourcePath, dll);
            const destination = path.join(this.outputPath, dll);
            
            if (fs.existsSync(source)) {
                fs.copyFileSync(source, destination);
            }
        });
    }

    ensureDirectory(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async checkPrerequisites() {
        // Check for .NET
        try {
            execSync('dotnet --version', { stdio: 'pipe' });
        } catch (error) {
            return false;
        }

        // Check for Node.js dependencies
        if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
            return false;
        }

        return true;
    }
}

// Run if called directly
if (require.main === module) {
    const builder = new PowerBIBuilder();
    
    builder.checkPrerequisites()
        .then(prereqsOk => {
            if (prereqsOk) {
                return builder.build();
            } else {
                process.exit(1);
            }
        })
        .then(success => {
            if (!success) {
                process.exit(1);
            }
        })
        .catch(error => {
            process.exit(1);
        });
}

module.exports = PowerBIBuilder; 