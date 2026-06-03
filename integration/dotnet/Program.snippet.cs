// ============================================================================
// Program.snippet.cs  —  Fragmento para Program.cs del repo web-services.
// Copia estas lineas para registrar el ACL, SignalR y CORS.
// ============================================================================
//
// using SmartPark.DigitalTwinSync;
//
// var builder = WebApplication.CreateBuilder(args);
//
// builder.Services.AddControllers();
// builder.Services.AddSignalR();
//
// // --- Anti-Corruption Layer de Azure Digital Twins ---
// builder.Services.Configure<AdtOptions>(builder.Configuration.GetSection("Adt"));
// builder.Services.AddSingleton<IDigitalTwinGateway, AzureDigitalTwinsGateway>();
//
// // CORS para la Web App Angular y PowerApps
// builder.Services.AddCors(o => o.AddPolicy("smartpark", p => p
//     .WithOrigins("https://<tu-web-app>.azurestaticapps.net", "http://localhost:4200")
//     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
//
// var app = builder.Build();
// app.UseCors("smartpark");
// app.MapControllers();
// app.MapHub<AlertsHub>("/hubs/alerts");
// app.Run();
//
// ----------------------------------------------------------------------------
// appsettings.json:
// {
//   "Adt": { "HostName": "adt-smartpark.api.eastus2.digitaltwins.azure.net" }
// }
//
// En Azure App Service: habilita la Managed Identity del App Service y asignale
// el rol "Azure Digital Twins Data Reader" (o Data Owner si tambien escribe)
// sobre la instancia ADT. DefaultAzureCredential la usa automaticamente, sin
// claves ni secretos.
// ============================================================================
