# Verifying a Helper download

1. Download `WinRelease.Helper.exe` from the Releases page of the project's GitHub releases repository.
2. In PowerShell, in the folder you saved it to:

   ```
   Get-FileHash .\WinRelease.Helper.exe -Algorithm SHA256
   ```

3. Compare the result with the SHA-256 in the release notes **and** on the website (Settings). All three must match. If they do not, do not run it.
4. Early releases are not code-signed, so Windows may show "Windows protected your PC". Once a release is signed, check the publisher in the file's Properties > Digital Signatures
   (the release notes say whether it is signed).
5. To see what it does, read the source here, build it (`BUILDING.md`) and run the tests.

You can also see its network behaviour yourself: it listens on `127.0.0.1:5601` only (`netstat -ano | findstr 5601`), and it has no outbound connections.
