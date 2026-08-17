# ---- Stage 1: build the React (Vite) frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: build and publish the .NET backend ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /backend
COPY backend/Chokh.Api/*.csproj ./
RUN dotnet restore
COPY backend/Chokh.Api/ ./
RUN dotnet publish -c Release -o /app/publish --no-restore

# ---- Stage 3: final runtime image ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=backend-build /app/publish ./
COPY --from=frontend-build /frontend/dist ./wwwroot

ENV PORT=8080
# ASP.NET Core watches appsettings.json for changes by default (for config hot-reload), which
# needs an inotify instance. Render's containers have a very low inotify limit, so this
# crashes the app on boot with "The configured user limit (128) on the number of inotify
# instances has been reached" before it ever starts listening. Hot-reload is dev-only anyway
# — disable it so the file watcher (and its inotify usage) is never created.
ENV DOTNET_hostBuilder__reloadConfigOnChange=false
EXPOSE 8080

ENTRYPOINT ["dotnet", "Chokh.Api.dll"]
