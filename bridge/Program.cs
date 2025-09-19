using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.AnalysisServices.AdomdClient;
using Microsoft.AnalysisServices.Tabular;
using Newtonsoft.Json;
using System.Data;
using System.Collections.Generic;
using System.Linq;
using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Net;
using System.Management;
using Microsoft.Identity.Client;

namespace PowerBIProxy
{
    public class Startup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddLogging(builder =>
            {
                // Minimize logging for production
                builder.SetMinimumLevel(Microsoft.Extensions.Logging.LogLevel.Error);
            });
            
            services.AddRouting();
            
            services.AddCors(options =>
            {
                options.AddDefaultPolicy(builder =>
                {
                    builder.AllowAnyOrigin()
                           .AllowAnyMethod()
                           .AllowAnyHeader();
                });
            });
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env, ILogger<Startup> logger)
        {
            app.UseCors();
            app.UseRouting();
            
            app.UseEndpoints(endpoints =>
            {
                var serviceProvider = app.ApplicationServices;
                
                endpoints.MapGet("/instances", context => HandleGetInstances(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/connect", context => HandleConnect(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/execute", context => HandleExecute(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/metadata", context => HandleMetadata(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/addmeasure", context => HandleAddMeasure(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapGet("/test", context => HandleTest(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/addcalculatedcolumn", context => HandleAddCalculatedColumn(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/addcalculatedtable", context => HandleAddCalculatedTable(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/authenticate-powerbi-service", context => HandlePowerBIServiceAuth(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/connect-with-token", context => HandleConnectWithToken(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
                endpoints.MapPost("/get-workspace-datasets", context => HandleGetWorkspaceDatasets(context, serviceProvider.GetRequiredService<ILogger<Startup>>()));
            });
        }



        private async Task HandleGetInstances(HttpContext context, ILogger logger)
        {
            try
            {
                var instances = GetLocalPowerBIInstances(logger);
                
                var response = new
                {
                    success = true,
                    instances = instances.Select(i => new
                    {
                        name = i.Name,
                        port = i.Port,
                        connectionString = $"localhost:{i.Port}",
                        displayName = i.DisplayName,
                        pid = i.Pid
                    }).ToArray()
                };
                
                await WriteJsonResponse(context, response);
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private List<PowerBIInstance> GetLocalPowerBIInstances(ILogger logger)
        {
            var instances = new List<PowerBIInstance>();
            
            try
            {
                // Get all MSMDSRV processes (Analysis Services engine)
                var msmdsrvProcesses = Process.GetProcessesByName("msmdsrv");
                
                foreach (var proc in msmdsrvProcesses)
                {
                    try
                    {
                        var parent = GetParentProcess(proc);
                        
                        if (parent != null)
                        {
                            // Skip if it's a SQL Server Analysis Services instance
                            if (parent.ProcessName.Equals("services", StringComparison.OrdinalIgnoreCase)) 
                                continue;
                            
                            // Get the port from TCP connections
                            var port = GetProcessPort(proc.Id);
                            if (port.HasValue)
                            {
                                var title = parent.MainWindowTitle;
                                var modelName = ExtractModelNameFromTitle(title);
                                
                                instances.Add(new PowerBIInstance
                                {
                                    Name = modelName,
                                    Port = port.Value,
                                    DisplayName = $"{modelName} (localhost:{port.Value})",
                                    Pid = proc.Id
                                });
                            }
                        }
                    }
                    catch (Exception)
                    {
                        // Skip this process if we can't get info
                    }
                }
            }
            catch (Exception)
            {
                // Continue processing with empty list
            }
            
            return instances;
        }

        private Process GetParentProcess(Process process)
        {
            try
            {
                if (!OperatingSystem.IsWindows())
                    return null;
                    
                using (var query = new ManagementObjectSearcher($"SELECT ParentProcessId FROM Win32_Process WHERE ProcessId = {process.Id}"))
                {
                    var result = query.Get().Cast<ManagementObject>().FirstOrDefault();
                    if (result != null)
                    {
                        var parentId = Convert.ToInt32(result["ParentProcessId"]);
                        return Process.GetProcessById(parentId);
                    }
                }
            }
            catch
            {
                // Ignore errors
            }
            
            return null;
        }

        private int? GetProcessPort(int processId)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "netstat",
                    Arguments = "-ano",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(startInfo))
                {
                    var output = process.StandardOutput.ReadToEnd();
                    var lines = output.Split('\n');

                    foreach (var line in lines)
                    {
                        if (line.Contains("LISTENING") && line.Contains("127.0.0.1") && line.Trim().EndsWith(processId.ToString()))
                        {
                            var parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                            if (parts.Length >= 2)
                            {
                                var localAddress = parts[1];
                                var portMatch = System.Text.RegularExpressions.Regex.Match(localAddress, @":(\d+)$");
                                if (portMatch.Success && int.TryParse(portMatch.Groups[1].Value, out var port))
                                {
                                    return port;
                                }
                            }
                        }
                    }
                }
            }
            catch
            {
                // Ignore errors
            }

            return null;
        }

        private string ExtractModelNameFromTitle(string windowTitle)
        {
            if (string.IsNullOrEmpty(windowTitle))
                return "Power BI Model";

            // Try to extract .pbix file name from window title
            var pbixMatch = System.Text.RegularExpressions.Regex.Match(windowTitle, @"([^\\\/]+)\.pbix", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (pbixMatch.Success)
            {
                return pbixMatch.Groups[1].Value;
            }

            // Fallback to first part of title before " - "
            var parts = windowTitle.Split(new[] { " - " }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length > 0)
            {
                return parts[0].Trim();
            }

            return "Power BI Model";
        }

        private async Task HandleConnect(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<ConnectRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.ConnectionString))
                {
                    throw new ArgumentException("Invalid connection request");
                }
                
                // Test connection
                using (var connection = new AdomdConnection(request.ConnectionString))
                {
                    connection.Open();
                    
                    var response = new
                    {
                        success = true,
                        serverInfo = new
                        {
                            serverName = connection.ConnectionString,
                            serverVersion = connection.ServerVersion,
                            database = connection.Database
                        }
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private async Task HandleExecute(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<ExecuteRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.ConnectionString) || string.IsNullOrEmpty(request.Query))
                {
                    throw new ArgumentException("Invalid execute request");
                }
                
                using (var connection = new AdomdConnection(request.ConnectionString))
                {
                    connection.Open();
                    
                    using (var command = new AdomdCommand(request.Query, connection))
                    {
                        using (var reader = command.ExecuteReader())
                        {
                            var result = ConvertReaderToJson(reader);
                            
                            var response = new
                            {
                                success = true,
                                data = result,
                                rowCount = result.rows.Count
                            };
                            
                            await WriteJsonResponse(context, response);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private async Task HandleMetadata(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<MetadataRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.ConnectionString))
                {
                    throw new ArgumentException("Invalid metadata request");
                }
                
                string serverString = ExtractServerFromConnectionString(request.ConnectionString);
                
                // Connect using Tabular Object Model for richer metadata
                using (var server = new Microsoft.AnalysisServices.Tabular.Server())
                {
                    server.Connect(serverString);
                    
                    if (server.Databases.Count == 0)
                    {
                        throw new Exception("No databases found on the server");
                    }
                    
                    var database = server.Databases[0]; // Power BI Desktop has only one database, Power BI Service may have multiple
                    var model = database.Model;
                    
                    var metadata = ExtractTabularMetadata(model);
                    
                    var response = new
                    {
                        success = true,
                        metadata = metadata,
                        timestamp = DateTime.UtcNow
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private object ExtractTabularMetadata(Model model)
        {
            var tables = new List<object>();
            var allMeasures = new List<object>();
            var relationships = new List<object>();
            
            // Extract Tables and Columns
            foreach (var table in model.Tables)
            {
                // Skip auto-generated date tables unless explicitly needed
                var isAutoGenerated = IsAutoGeneratedDateTable(table.Name);
                if (isAutoGenerated)
                    continue;
                
                // Skip hidden tables to avoid sending them to LLM proxy
                if (table.IsHidden)
                    continue;
                
                var tableInfo = new
                {
                    name = table.Name,
                    description = table.Description ?? "",
                    isHidden = table.IsHidden,
                    columns = table.Columns.Where(c => !c.IsHidden).Select(column => new
                    {
                        name = column.Name,
                        dataType = column.DataType.ToString(),
                        description = column.Description ?? "",
                        isKey = column.IsKey,
                        isHidden = column.IsHidden,
                        isCalculated = column.Type == ColumnType.Calculated,
                        expression = column.Type == ColumnType.Calculated ? 
                            ((CalculatedColumn)column).Expression : null
                    }).ToArray(),
                    measures = table.Measures.Where(m => !m.IsHidden).Select(measure => new
                    {
                        name = measure.Name,
                        expression = measure.Expression,
                        description = measure.Description ?? "",
                        formatString = measure.FormatString ?? "",
                        displayFolder = measure.DisplayFolder ?? "",
                        isHidden = measure.IsHidden
                    }).ToArray()
                };
                
                tables.Add(tableInfo);
                
                // Add measures to global list
                foreach (var measure in table.Measures.Where(m => !m.IsHidden))
                {
                    allMeasures.Add(new
                    {
                        name = measure.Name,
                        tableName = table.Name,
                        expression = measure.Expression,
                        description = measure.Description ?? "",
                        formatString = measure.FormatString ?? "",
                        displayFolder = measure.DisplayFolder ?? "",
                        isHidden = measure.IsHidden
                    });
                }
            }
            
            // Extract Relationships
            foreach (var relationship in model.Relationships)
            {
                if (relationship is SingleColumnRelationship singleColRel)
                {
                    // Skip relationships involving hidden tables or auto-generated date tables
                    var fromTableIsHidden = singleColRel.FromTable.IsHidden || IsAutoGeneratedDateTable(singleColRel.FromTable.Name);
                    var toTableIsHidden = singleColRel.ToTable.IsHidden || IsAutoGeneratedDateTable(singleColRel.ToTable.Name);
                    
                    if (fromTableIsHidden || toTableIsHidden)
                        continue;
                    
                    relationships.Add(new
                    {
                        name = relationship.Name,
                        fromTable = singleColRel.FromTable.Name,
                        fromColumn = singleColRel.FromColumn.Name,
                        toTable = singleColRel.ToTable.Name,
                        toColumn = singleColRel.ToColumn.Name,
                        isActive = singleColRel.IsActive,
                        fromCardinality = singleColRel.FromCardinality.ToString(),
                        toCardinality = singleColRel.ToCardinality.ToString(),
                        crossFilteringBehavior = singleColRel.CrossFilteringBehavior.ToString()
                    });
                }
            }
            
            return new
            {
                name = model.Database.Name,
                tables = tables,
                measures = allMeasures,
                relationships = relationships,
                tableCount = tables.Count,
                measureCount = allMeasures.Count,
                relationshipCount = relationships.Count
            };
        }

        private bool IsAutoGeneratedDateTable(string tableName)
        {
            // Check for auto-generated date table patterns
            return tableName.StartsWith("DateTableTemplate_") || 
                   tableName.StartsWith("LocalDateTable_") ||
                   tableName.Equals("Calendar", StringComparison.OrdinalIgnoreCase);
        }

        private string ExtractServerFromConnectionString(string connectionString)
        {
            // Handle XMLA endpoint connections (Power BI Service)
            if (connectionString.Contains("powerbi://") || connectionString.Contains("api.powerbi.com"))
            {
                // Extract XMLA endpoint from connection string
                var xmlaMatch = System.Text.RegularExpressions.Regex.Match(connectionString, @"Data Source=([^;]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (xmlaMatch.Success)
                {
                    return xmlaMatch.Groups[1].Value;
                }
                
                // Fallback: if the entire connectionString is just the XMLA endpoint
                if (connectionString.StartsWith("powerbi://"))
                {
                    return connectionString;
                }
            }
            
            // Handle localhost connections (Power BI Desktop)
            var portMatch = System.Text.RegularExpressions.Regex.Match(connectionString, @":(\d+)$");
            if (portMatch.Success)
            {
                var port = int.Parse(portMatch.Groups[1].Value);
                return $"localhost:{port}";
            }
            
            // Handle manual server connections
            var serverMatch = System.Text.RegularExpressions.Regex.Match(connectionString, @"Data Source=([^;]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (serverMatch.Success)
            {
                return serverMatch.Groups[1].Value;
            }
            
            throw new Exception("Invalid connection string format. Expected localhost:port, XMLA endpoint, or proper MSOLAP connection string");
        }

        private async Task HandleAddMeasure(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<AddMeasureRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.ConnectionString) || 
                    string.IsNullOrEmpty(request.MeasureName) || string.IsNullOrEmpty(request.MeasureExpression))
                {
                    throw new ArgumentException("Invalid add measure request");
                }
                
                string serverString = ExtractServerFromConnectionString(request.ConnectionString);
                
                // Connect using Tabular Object Model to add the measure
                using (var server = new Microsoft.AnalysisServices.Tabular.Server())
                {
                    server.Connect(serverString);
                    
                    if (server.Databases.Count == 0)
                    {

                        throw new Exception("No databases found on the server");
                    }
                    
                    var database = server.Databases[0]; // Power BI Desktop has only one database
                    var model = database.Model;
                    
                    // Find the target table based on request or auto-detection
                    Microsoft.AnalysisServices.Tabular.Table targetTable = null;
                    
                    if (!string.IsNullOrEmpty(request.TableName))
                    {
                        // Use specified table name
                        targetTable = model.Tables.FirstOrDefault(t => 
                            t.Name.Equals(request.TableName, StringComparison.OrdinalIgnoreCase) && 
                            !t.IsHidden);
                        
                        if (targetTable == null)
                        {
                            throw new Exception($"Specified table '{request.TableName}' not found or is hidden");
                        }
                    }
                    else
                    {
                        // Auto-detect: First check for _Measures table, then fall back to first suitable table
                        targetTable = model.Tables.FirstOrDefault(t => 
                            t.Name.Equals("_Measures", StringComparison.OrdinalIgnoreCase) && 
                            !t.IsHidden);
                        
                        if (targetTable == null)
                        {
                            targetTable = model.Tables.FirstOrDefault(t => !t.IsHidden && !IsAutoGeneratedDateTable(t.Name));
                        }
                        
                        if (targetTable == null)
                        {
                            throw new Exception("No suitable table found to add the measure");
                        }
                    }
                    
                    // Check if measure already exists
                    var existingMeasure = targetTable.Measures.FirstOrDefault(m => 
                        m.Name.Equals(request.MeasureName, StringComparison.OrdinalIgnoreCase));
                    
                    if (existingMeasure != null)
                    {
                        // Update existing measure
                        existingMeasure.Expression = request.MeasureExpression;
                    }
                    else
                    {
                        // Create new measure
                        var newMeasure = new Microsoft.AnalysisServices.Tabular.Measure
                        {
                            Name = request.MeasureName,
                            Expression = request.MeasureExpression,
                            Description = $"Created by Analytics Pilot on {DateTime.Now:yyyy-MM-dd HH:mm:ss}"
                        };
                        
                        targetTable.Measures.Add(newMeasure);
                    }
                    
                    // Save changes to the model
                    model.SaveChanges();
                    
                    var response = new
                    {
                        success = true,
                        message = $"Measure '{request.MeasureName}' successfully {(existingMeasure != null ? "updated" : "added")} to table '{targetTable.Name}'",
                        measureName = request.MeasureName,
                        tableName = targetTable.Name,
                        timestamp = DateTime.UtcNow
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private async Task HandleAddCalculatedColumn(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<AddCalculatedColumnRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.ConnectionString) || 
                    string.IsNullOrEmpty(request.ColumnName) || string.IsNullOrEmpty(request.ColumnExpression))
                {
                    throw new ArgumentException("Invalid add calculated column request");
                }
                
                string serverString = ExtractServerFromConnectionString(request.ConnectionString);
                
                using (var server = new Microsoft.AnalysisServices.Tabular.Server())
                {
                    server.Connect(serverString);
                    
                    if (server.Databases.Count == 0)
                    {
                        throw new Exception("No databases found on the server");
                    }
                    
                    var database = server.Databases[0];
                    var model = database.Model;
                    
                    Microsoft.AnalysisServices.Tabular.Table targetTable = null;
                    
                    if (!string.IsNullOrEmpty(request.TableName))
                    {
                        targetTable = model.Tables.FirstOrDefault(t => 
                            t.Name.Equals(request.TableName, StringComparison.OrdinalIgnoreCase) && 
                            !t.IsHidden);
                        
                        if (targetTable == null)
                        {
                            throw new Exception($"Specified table '{request.TableName}' not found or is hidden");
                        }
                    }
                    else
                    {
                        targetTable = model.Tables.FirstOrDefault(t => !t.IsHidden && !IsAutoGeneratedDateTable(t.Name));
                        
                        if (targetTable == null)
                        {
                            throw new Exception("No suitable table found to add the calculated column");
                        }
                    }
                    
                    var existingColumn = targetTable.Columns.FirstOrDefault(c => 
                        c.Name.Equals(request.ColumnName, StringComparison.OrdinalIgnoreCase));
                    
                    if (existingColumn != null)
                    {
                        if (existingColumn is CalculatedColumn calculatedColumn)
                        {
                            calculatedColumn.Expression = request.ColumnExpression;
                        }
                        else
                        {
                            throw new InvalidOperationException($"Column {request.ColumnName} exists but is not a calculated column");
                        }
                    }
                    else
                    {
                        var newColumn = new Microsoft.AnalysisServices.Tabular.CalculatedColumn
                        {
                            Name = request.ColumnName,
                            Expression = request.ColumnExpression,
                            Description = $"Created by Analytics Pilot on {DateTime.Now:yyyy-MM-dd HH:mm:ss}"
                        };
                        
                        targetTable.Columns.Add(newColumn);
                    }
                    
                    model.SaveChanges();
                    
                    var response = new
                    {
                        success = true,
                        message = $"Column '{request.ColumnName}' successfully {(existingColumn != null ? "updated" : "added")} to table '{targetTable.Name}'",
                        columnName = request.ColumnName,
                        tableName = targetTable.Name,
                        timestamp = DateTime.UtcNow
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private async Task HandleAddCalculatedTable(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<AddCalculatedTableRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.ConnectionString) || 
                    string.IsNullOrEmpty(request.TableName) || string.IsNullOrEmpty(request.TableExpression))
                {
                    throw new ArgumentException("Invalid add calculated table request");
                }
                
                string serverString = ExtractServerFromConnectionString(request.ConnectionString);
                
                using (var server = new Microsoft.AnalysisServices.Tabular.Server())
                {
                    server.Connect(serverString);
                    
                    if (server.Databases.Count == 0)
                    {
                        throw new Exception("No databases found on the server");
                    }
                    
                    var database = server.Databases[0];
                    var model = database.Model;
                    
                    var existingTable = model.Tables.FirstOrDefault(t => 
                        t.Name.Equals(request.TableName, StringComparison.OrdinalIgnoreCase));
                    
                    if (existingTable != null)
                    {
                        if (existingTable.Partitions.Count > 0 && 
                            existingTable.Partitions[0].Source is Microsoft.AnalysisServices.Tabular.CalculatedPartitionSource)
                        {
                            var calculatedSource = (Microsoft.AnalysisServices.Tabular.CalculatedPartitionSource)existingTable.Partitions[0].Source;
                            calculatedSource.Expression = request.TableExpression;
                        }
                        else
                        {
                            throw new InvalidOperationException($"Table {request.TableName} exists but is not a calculated table");
                        }
                    }
                    else
                    {
                        var newTable = new Microsoft.AnalysisServices.Tabular.Table
                        {
                            Name = request.TableName,
                            Description = $"Created by Analytics Pilot on {DateTime.Now:yyyy-MM-dd HH:mm:ss}"
                        };
                        
                        var calculatedPartition = new Microsoft.AnalysisServices.Tabular.Partition
                        {
                            Name = request.TableName,
                            Source = new Microsoft.AnalysisServices.Tabular.CalculatedPartitionSource
                            {
                                Expression = request.TableExpression
                            }
                        };
                        
                        newTable.Partitions.Add(calculatedPartition);
                        model.Tables.Add(newTable);
                    }
                    
                    model.SaveChanges();
                    
                    var response = new
                    {
                        success = true,
                        message = $"Calculated table '{request.TableName}' successfully {(existingTable != null ? "updated" : "created")}",
                        tableName = request.TableName,
                        timestamp = DateTime.UtcNow
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private async Task HandleTest(HttpContext context, ILogger logger)
        {
            var response = new
            {
                success = true,
                message = "Power BI Proxy Service is running",
                timestamp = DateTime.UtcNow
            };
            
            await WriteJsonResponse(context, response);
        }

        private async Task<string> ReadRequestBody(HttpContext context)
        {
            using (var reader = new System.IO.StreamReader(context.Request.Body))
            {
                return await reader.ReadToEndAsync();
            }
        }

        private async Task WriteJsonResponse(HttpContext context, object response)
        {
            context.Response.ContentType = "application/json";
            var json = JsonConvert.SerializeObject(response, Formatting.Indented);
            await context.Response.WriteAsync(json);
        }

        private async Task WriteErrorResponse(HttpContext context, string error)
        {
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            
            var response = new
            {
                success = false,
                error = error,
                timestamp = DateTime.UtcNow
            };
            
            var json = JsonConvert.SerializeObject(response, Formatting.Indented);
            await context.Response.WriteAsync(json);
        }

        private QueryResult ConvertReaderToJson(AdomdDataReader reader)
        {
            var columns = new List<object>();
            var rows = new List<Dictionary<string, object>>();
            
            // Get column info
            for (int i = 0; i < reader.FieldCount; i++)
            {
                columns.Add(new
                {
                    name = reader.GetName(i),
                    type = reader.GetFieldType(i).Name
                });
            }
            
            // Get row data
            while (reader.Read())
            {
                var row = new Dictionary<string, object>();
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    var columnName = reader.GetName(i);
                    row[columnName] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                }
                rows.Add(row);
            }
            
            return new QueryResult
            {
                columns = columns,
                rows = rows
            };
        }

        private static IPublicClientApplication _msalClient;

        private async Task HandlePowerBIServiceAuth(HttpContext context, ILogger logger)
        {
            try
            {
                if (_msalClient == null)
                {
                    // Use the Power BI client ID (this is a well-known public client ID for Power BI)
                    _msalClient = PublicClientApplicationBuilder
                        .Create("872cd9fa-d31f-45e0-9eab-6e460a02d1f1") // Power BI Service client ID
                        .WithAuthority("https://login.microsoftonline.com/common")
                        .WithRedirectUri("http://localhost:62189") // Specific localhost port for desktop apps
                        .WithLogging((level, message, containsPii) =>
                        {
                            // MSAL logging disabled for production
                        }, Microsoft.Identity.Client.LogLevel.Error, enablePiiLogging: false, enableDefaultPlatformLogging: false)
                        .Build();
                }

                string[] scopes = { "https://analysis.windows.net/powerbi/api/.default" };
                
                AuthenticationResult result;
                var accounts = await _msalClient.GetAccountsAsync();
                
                try
                {
                    // Try silent authentication first
                    result = await _msalClient.AcquireTokenSilent(scopes, accounts.FirstOrDefault())
                        .ExecuteAsync();
                }
                catch (MsalUiRequiredException)
                {
                    // Interactive authentication required - this will show Windows auth popup
                    // Use system browser for better compatibility with minimal UI
                    result = await _msalClient.AcquireTokenInteractive(scopes)
                        .WithUseEmbeddedWebView(false) // Use system browser instead of embedded web view
                        .WithSystemWebViewOptions(new SystemWebViewOptions()
                        {
                            HtmlMessageSuccess = "<html><head><title>Authentication Complete</title></head><body><h1>Authentication successful!</h1><p>You can now close this window.</p><script>window.close();</script></body></html>",
                            HtmlMessageError = "<html><head><title>Authentication Error</title></head><body><h1>Authentication failed!</h1><p>Please try again. You can close this window.</p><script>window.close();</script></body></html>"
                        })
                        .WithParentActivityOrWindow(IntPtr.Zero) // No parent window
                        .WithPrompt(Prompt.SelectAccount) // Try to minimize prompts when possible
                        .ExecuteAsync();
                }

                var response = new
                {
                    success = true,
                    accessToken = result.AccessToken,
                    account = result.Account.Username,
                    expiresOn = result.ExpiresOn
                };

                await WriteJsonResponse(context, response);
            }
            catch (Exception ex)
            {
                // Authentication error - silently handled in production
                await WriteErrorResponse(context, $"Authentication failed: {ex.Message}");
            }
        }

        private async Task HandleConnectWithToken(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<ConnectWithTokenRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.XmlaEndpoint) || string.IsNullOrEmpty(request.AccessToken))
                {
                    throw new ArgumentException("Invalid connection request");
                }
                
                // Build connection string with access token for Power BI Service
                var connectionString = $"Provider=MSOLAP;Data Source={request.XmlaEndpoint};Password={request.AccessToken};";
                
                using (var connection = new AdomdConnection(connectionString))
                {
                    connection.Open();
                    
                    var response = new
                    {
                        success = true,
                        serverInfo = new
                        {
                            serverName = connection.ConnectionString,
                            serverVersion = connection.ServerVersion,
                            database = connection.Database
                        }
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }

        private async Task HandleGetWorkspaceDatasets(HttpContext context, ILogger logger)
        {
            try
            {
                var requestBody = await ReadRequestBody(context);
                var request = JsonConvert.DeserializeObject<GetWorkspaceDatasetsRequest>(requestBody);
                
                if (request == null || string.IsNullOrEmpty(request.WorkspaceName) || string.IsNullOrEmpty(request.AccessToken))
                {
                    throw new ArgumentException("Invalid workspace datasets request");
                }
                
                // Build the XMLA endpoint for the workspace
                var xmlaEndpoint = $"powerbi://api.powerbi.com/v1.0/myorg/{Uri.EscapeDataString(request.WorkspaceName)}";
                var connectionString = $"Provider=MSOLAP;Data Source={xmlaEndpoint};Password={request.AccessToken};";
                
                // Connect using Tabular Object Model to list databases (semantic models)
                using (var server = new Microsoft.AnalysisServices.Tabular.Server())
                {
                    server.Connect(connectionString);
                    
                    var datasets = new List<object>();
                    
                    foreach (Microsoft.AnalysisServices.Tabular.Database database in server.Databases)
                    {
                        // Skip system databases that start with underscore
                        if (database.Name.StartsWith("_"))
                            continue;
                            
                        datasets.Add(new
                        {
                            id = database.ID,
                            name = database.Name,
                            displayName = !string.IsNullOrEmpty(database.Model?.Name) ? database.Model.Name : database.Name,
                            description = database.Model?.Description ?? "",
                            lastProcessed = database.LastProcessed,
                            lastUpdate = database.LastUpdate
                        });
                    }
                    
                    var response = new
                    {
                        success = true,
                        datasets = datasets,
                        timestamp = DateTime.UtcNow
                    };
                    
                    await WriteJsonResponse(context, response);
                }
            }
            catch (Exception ex)
            {
                await WriteErrorResponse(context, ex.Message);
            }
        }
    }

    public class PowerBIInstance
    {
        public string Name { get; set; }
        public int Port { get; set; }
        public string DisplayName { get; set; }
        public int Pid { get; set; }
    }

    public class ConnectRequest
    {
        public string ConnectionString { get; set; }
    }

    public class ExecuteRequest
    {
        public string ConnectionString { get; set; }
        public string Query { get; set; }
    }

    public class MetadataRequest
    {
        public string ConnectionString { get; set; }
    }

    public class AddMeasureRequest
    {
        public string ConnectionString { get; set; }
        public string MeasureName { get; set; }
        public string MeasureExpression { get; set; }
        public string TableName { get; set; }
    }

    public class QueryResult
    {
        public List<object> columns { get; set; }
        public List<Dictionary<string, object>> rows { get; set; }
    }

    public class Program
    {
        public static void Main(string[] args)
        {
            try
            {
                var host = CreateWebHostBuilder(args).Build();
                host.Run();
            }
            catch (Exception)
            {
                throw;
            }
        }

        public static IWebHostBuilder CreateWebHostBuilder(string[] args)
        {
            return new WebHostBuilder()
                .UseKestrel()
                .UseUrls("http://localhost:8080")
                .UseStartup<Startup>()
                .ConfigureLogging(logging =>
                {
                    // Minimize logging for production
                    logging.SetMinimumLevel(Microsoft.Extensions.Logging.LogLevel.Error);
                });
        }
    }
    public class AddCalculatedColumnRequest
    {
        public string ConnectionString { get; set; }
        public string TableName { get; set; }
        public string ColumnName { get; set; }
        public string ColumnExpression { get; set; }
    }

    public class AddCalculatedTableRequest
    {
        public string ConnectionString { get; set; }
        public string TableName { get; set; }
        public string TableExpression { get; set; }
    }

    public class ConnectWithTokenRequest
    {
        public string XmlaEndpoint { get; set; }
        public string AccessToken { get; set; }
    }

    public class GetWorkspaceDatasetsRequest
    {
        public string WorkspaceName { get; set; }
        public string AccessToken { get; set; }
    }
}