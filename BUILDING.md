# Building and testing

You need the .NET 9 SDK (and Node.js 20 or later for the website). On a machine with only a newer SDK, set `DOTNET_ROLL_FORWARD=Major`.

## The Helper

```
dotnet test src/WinRelease.Helper.Tests
dotnet test src/WinRelease.Core.Tests
dotnet publish src/WinRelease.Helper -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o out
```

`out\WinRelease.Helper.exe` is the program. Running it installs it for your user and starts it; see `README.md`.

## The website

```
cd web/packaging-console
npm ci
npm test
npm run build:mvp
```

`dist-mvp` is the static site. `npm run dev -- --mode mvp` serves it locally on port 5173, and it finds a Helper running on `127.0.0.1:5601`.

## To actually build an MSI you also need

The .NET SDK, the WiX tool (`dotnet tool install --global wix --version 7.0.0`) and its UI add-on
(`wix extension add --global WixToolset.UI.wixext/7.0.0 -acceptEula wix7`). WiX has its own terms (the Open Source Maintenance Fee for organisations with
US$10,000 or more in annual revenue): see docs.firegiant.com/wix/osmf. WinRelease does not include or redistribute WiX.
