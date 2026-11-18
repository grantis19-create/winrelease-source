using System.ComponentModel.DataAnnotations;

namespace WinRelease.Core.Manifest;

/// <summary>
/// The root of a parsed <c>winrelease.json</c> manifest. See CONTEXT.md for
/// the Project/Declared File/Harvested Files/Shortcut/UpgradeCode vocabulary
/// this schema maps onto.
/// </summary>
public sealed record WinReleaseManifest : IValidatableObject
{
    public int SchemaVersion { get; init; } = 1;

    public required Guid UpgradeCode { get; init; }

    public required string Name { get; init; }

    public required string Manufacturer { get; init; }

    /// <summary>Human-facing SemVer, e.g. "2.4.1-beta.1". See ADR 0006.</summary>
    public required string DisplayVersion { get; init; }

    /// <summary>
    /// MSI-compliant major.minor.patch. Derived from <see cref="DisplayVersion"/>
    /// via <see cref="VersionMapper"/> when omitted. See ADR 0006.
    /// </summary>
    public string? ProductVersion { get; init; }

    /// <summary>
    /// Where the product's own folder (INSTALLFOLDER) sits: a WiX bracketed root token plus an
    /// optional subpath (e.g. <c>"[ProgramFiles64Folder]Acme\App"</c>), or an equivalent literal
    /// Windows path (e.g. <c>"C:\Program Files\Acme\App"</c>) normalized the same way by
    /// <see cref="TargetDirectoryResolver"/>. Defaults to the bare <c>[ProgramFiles64Folder]</c>
    /// root - developers type or Browse their own subpath rather than being forced into a fixed
    /// Manufacturer-subfolder convention. Supersedes ADR 0037's InstallUnderManufacturerFolder
    /// boolean - see ADR 0038.
    /// </summary>
    public string TargetDirectory { get; init; } = "[ProgramFiles64Folder]";

    /// <summary>
    /// Pins the MSI ProductCode. Null (the default) means a new random ProductCode for every build
    /// (ADR 0120), which is what almost every package wants. Once set (via the Console's wand
    /// action), it stays fixed across builds/version bumps rather than auto-changing - see ADR 0038.
    /// </summary>
    public Guid? ProductCode { get; init; }

    /// <summary>
    /// The build architecture passed to <c>wix build -arch</c>. Defaults to X64. See ADR 0038.
    /// A single-select choice - ADR 0042's multi-select checkboxes (X64/Arm64 selectable
    /// together) were reverted by ADR 0056: <c>-arch</c> only ever drives one build, so the
    /// Console's "full selection" list never represented anything the compiler acted on beyond
    /// its first entry. Shipping true multi-arch output means separate builds per architecture,
    /// not a wider enum here - deferred until there's real demand for it.
    /// </summary>
    public PackageArchitecture Architecture { get; init; } = PackageArchitecture.X64;

    public ManifestFiles Files { get; init; } = new();

    /// <summary>Add/Remove Programs (Windows Installer "ARP") properties - publisher links, control-panel icon, and Windows Settings entry behavior. See ADR 0039.</summary>
    public AppInfo AppInfo { get; init; } = new();

    public List<Shortcut> Shortcuts { get; init; } = [];

    public List<RegistryEntry> Registry { get; init; } = [];

    /// <summary>
    /// COM classes registered by a declared file (a server DLL/EXE). Authored as WiX <c>Class</c>/<c>ProgId</c>
    /// under that file's own Component, so the registration installs and uninstalls with the file. Verified
    /// against wix 7.0.0 (ADR 0083): WiX v4+ compiles these into the MSI Registry table (CLSID\{id}\InprocServer32 =
    /// [#file], ProgID, VersionIndependentProgID, CurVer), not the legacy Class/ProgId tables.
    /// </summary>
    public List<ComClass> ComClasses { get; init; } = [];

    /// <summary>Type libraries registered by a declared file. Compiled to HKCR\TypeLib\{id}\major.minor keys (incl. the win64 key on a 64-bit package).</summary>
    public List<ComTypeLib> ComTypeLibs { get; init; } = [];

    /// <summary>System/user environment variables (PATH-style append included) - WiX's own Environment table. See ADR 0077.</summary>
    public List<EnvironmentVariableEntry> EnvironmentVariables { get; init; } = [];

    /// <summary>
    /// Extra MSI properties authored into the package's Property table (ADR 0053) - the install-behavior
    /// switches enterprise deployments care about (REBOOT, MSIRESTARTMANAGERCONTROL, ...). Public
    /// (UPPERCASE) names only, so IT can still override them on the msiexec command line. Properties
    /// WinRelease already authors from other fields (ALLUSERS, the ARP* set, ProductCode...) are
    /// rejected - use that field instead.
    /// </summary>
    public List<MsiProperty> Properties { get; init; } = [];

    public IntuneManifest? Intune { get; init; }

    public string ResolvedProductVersion =>
        ProductVersion ?? VersionMapper.DeriveProductVersion(DisplayVersion);

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        // Verified against wix 7.0.0 (ADR 0047): Package/@Name and @Manufacturer reject an empty or
        // whitespace-only value with WIX0006. Catch it here so a first compile doesn't open with a
        // compiler error.
        if (string.IsNullOrWhiteSpace(Name))
        {
            yield return new ValidationResult("name is required.", [nameof(Name)]);
        }

        if (string.IsNullOrWhiteSpace(Manufacturer))
        {
            yield return new ValidationResult("manufacturer is required (shown as the publisher in Add/Remove Programs).", [nameof(Manufacturer)]);
        }

        if (UpgradeCode == Guid.Empty)
        {
            yield return new ValidationResult(
                "upgradeCode must be a generated GUID, not an empty GUID.",
                [nameof(UpgradeCode)]);
        }

        // A pinned ProductCode (ADR 0038): the empty GUID is no identity at all, and a code equal to the UpgradeCode makes the product look like its own upgrade family (ADR 0122).
        if (ProductCode is { } pinnedProductCode)
        {
            if (pinnedProductCode == Guid.Empty)
            {
                yield return new ValidationResult("productCode must be a generated GUID, not an empty GUID (or leave it unpinned and WinRelease makes a random one).", [nameof(ProductCode)]);
            }
            else if (pinnedProductCode == UpgradeCode)
            {
                yield return new ValidationResult("productCode must differ from the upgradeCode: one identifies a build, the other the whole product family.", [nameof(ProductCode)]);
            }
        }

        if (Name.Length > 255 || Manufacturer.Length > 255)
        {
            yield return new ValidationResult("name and manufacturer must each be 255 characters or fewer.", [Name.Length > 255 ? nameof(Name) : nameof(Manufacturer)]);
        }

        if (DisplayVersion.Length > 64)
        {
            yield return new ValidationResult("displayVersion must be 64 characters or fewer.", [nameof(DisplayVersion)]);
        }

        if (TargetDirectoryResolver.TryParse(TargetDirectory, out _, out var targetSegments, Architecture) && targetSegments.Select(SourcePathRules.TraversalProblem).FirstOrDefault(p => p is not null) is { } targetProblem)
        {
            yield return new ValidationResult($"targetDirectory: {targetProblem}.", [nameof(TargetDirectory)]);
        }

        foreach (var harvest in Files.Harvest)
        {
            if (SourcePathRules.InstallPathProblem(harvest.InstallPath) is { } harvestProblem)
            {
                yield return new ValidationResult($"Harvest folder '{harvest.SourceFolder}': install path - {harvestProblem}.", ["files.harvest.installPath"]);
            }
        }

        foreach (var file in Files.Declared)
        {
            if (SourcePathRules.InstallPathProblem(file.InstallPath) is { } installProblem)
            {
                yield return new ValidationResult($"File '{file.Id}': install path '{file.InstallPath}' - {installProblem}.", ["files.declared.installPath"]);
            }

            // WiX refuses a file with no name (WIX0006, with a temp-folder path in the message): the install path must end in a file name.
            var leaf = (file.InstallPath ?? "").Replace('/', '\\');
            if (string.IsNullOrWhiteSpace(leaf) || leaf.EndsWith('\\') || leaf.TrimEnd().Length == 0)
            {
                yield return new ValidationResult($"File '{file.Id}': the install path must end in a file name, for example app.exe or sub\\app.exe.", ["files.declared.installPath"]);
            }

            var estimate = InstallPathLength.Estimate(this, file.Root, file.InstallPath ?? "");
            if (InstallPathLength.IsTooLong(estimate))
            {
                yield return new ValidationResult(
                    $"'{file.InstallPath}' would install to a path about {estimate.Length} characters long ({estimate}); Windows Installer can write at most {InstallPathLength.Max}. Shorten the folder names or the target directory.",
                    ["files.declared.installPath"]);
            }

            if (!SourcePathRules.IsSafeRelative(file.SourcePath))
            {
                yield return new ValidationResult(
                    $"sourcePath '{file.SourcePath}' must be a relative path inside the uploaded sources (no drive letter, leading slash, or '..').",
                    ["files.declared.sourcePath"]);
            }
        }

        foreach (var harvest in Files.Harvest)
        {
            if (!SourcePathRules.IsSafeRelative(harvest.SourceFolder))
            {
                yield return new ValidationResult(
                    $"sourceFolder '{harvest.SourceFolder}' must be a relative path inside the uploaded sources (no drive letter, leading slash, or '..').",
                    ["files.harvest.sourceFolder"]);
            }
        }

        var iconPaths = Shortcuts.Select(s => s.IconPath).Append(AppInfo.IconPath).Where(p => !string.IsNullOrEmpty(p));
        foreach (var iconPath in iconPaths)
        {
            if (!SourcePathRules.IsSafeRelative(iconPath))
            {
                yield return new ValidationResult(
                    $"iconPath '{iconPath}' must be a relative path inside the uploaded sources (no drive letter, leading slash, or '..').",
                    ["iconPath"]);
            }
        }

        var declaredIds = Files.Declared.Select(f => f.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var com in ComClasses)
        {
            if (com.ClassId == Guid.Empty)
            {
                yield return new ValidationResult("comClasses.classId must be a real GUID, not an empty GUID.", ["comClasses.classId"]);
            }

            if (!declaredIds.Contains(com.FileId))
            {
                yield return new ValidationResult($"comClasses.fileId '{com.FileId}' doesn't match any declared file.", ["comClasses.fileId"]);
            }

            if (com.VersionIndependentProgId is { Length: > 0 } && string.IsNullOrEmpty(com.ProgId))
            {
                yield return new ValidationResult("comClasses.versionIndependentProgId needs a versioned progId too.", ["comClasses.progId"]);
            }

            foreach (var progId in new[] { com.ProgId, com.VersionIndependentProgId }.Where(p => !string.IsNullOrEmpty(p)))
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(progId!, @"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$"))
                {
                    yield return new ValidationResult($"progId '{progId}' must look like Vendor.Component or Vendor.Component.1 (letters, digits, underscores, dot-separated).", ["comClasses.progId"]);
                }
            }

            if (com.ThreadingModel is not null && com.Context == ComServerContext.LocalServer32)
            {
                yield return new ValidationResult("comClasses.threadingModel only applies to InprocServer32 servers.", ["comClasses.threadingModel"]);
            }
        }

        foreach (var typeLib in ComTypeLibs)
        {
            if (typeLib.TypeLibId == Guid.Empty)
            {
                yield return new ValidationResult("comTypeLibs.typeLibId must be a real GUID, not an empty GUID.", ["comTypeLibs.typeLibId"]);
            }

            if (!declaredIds.Contains(typeLib.FileId))
            {
                yield return new ValidationResult($"comTypeLibs.fileId '{typeLib.FileId}' doesn't match any declared file.", ["comTypeLibs.fileId"]);
            }
        }

        // COM: one registration per CLSID and per ProgID (a duplicate otherwise surfaces as a raw WIX0091 about a temp path).
        foreach (var dup in ComClasses.GroupBy(c => c.ClassId).Where(g => g.Count() > 1))
        {
            yield return new ValidationResult($"comClasses: CLSID {{{dup.Key.ToString().ToUpperInvariant()}}} is registered {dup.Count()} times - keep one.", ["comClasses.classId"]);
        }

        var progIds = ComClasses.SelectMany(c => new[] { c.ProgId, c.VersionIndependentProgId }).Where(p => !string.IsNullOrEmpty(p));
        foreach (var dup in progIds.GroupBy(p => p!, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
        {
            yield return new ValidationResult($"comClasses: ProgID '{dup.Key}' is used {dup.Count()} times - each ProgID can belong to only one class.", ["comClasses.progId"]);
        }

        // Registry: a key is "Software\Vendor\App" under a chosen hive - not empty, not rooted with a backslash or a hive name,
        // and each (hive, key, value name) written once. Caught here in plain words; WiX would either fail with a
        // raw error (empty key, duplicates) or build a key Windows can't use (leading backslash, hive name in the key).
        var seenRegistry = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in Registry)
        {
            var where = $"{entry.Root.ToString().ToUpperInvariant()}\\{entry.Key}";
            if (string.IsNullOrWhiteSpace(entry.Key))
            {
                yield return new ValidationResult("registry: an entry has no key - give it a key path like Software\\Vendor\\App.", ["registry.key"]);
                continue;
            }

            if (entry.Key.StartsWith('\\') || entry.Key.EndsWith('\\') || entry.Key.Contains("\\\\"))
            {
                yield return new ValidationResult($"registry: key '{entry.Key}' must not start or end with a backslash or contain an empty level - write it as Software\\Vendor\\App.", ["registry.key"]);
            }
            else if (System.Text.RegularExpressions.Regex.IsMatch(entry.Key, @"^(HKEY_[A-Z_]+|HKLM|HKCU|HKCR|HKU)(\\|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                yield return new ValidationResult($"registry: key '{entry.Key}' includes the hive name - choose the hive in the Root field and leave it out of the key.", ["registry.key"]);
            }

            // Windows Installer writes a Registry row's whole key in one call and fails past about 255 characters (error 1402 / 1603); the MSI builds
            // but does not install. Measured on Windows 11 with real MSIs: a 250-character key installs, 274 fails. Windows itself also refuses a single
            // level (the name between backslashes) over 254 characters. Found by the VM run on T4-09 (defect 75): say so up front.
            if (entry.Key.Length > 255 || entry.Key.Split('\\').Any(level => level.Length > 254))
            {
                yield return new ValidationResult($"registry: key '{entry.Key.Substring(0, Math.Min(50, entry.Key.Length))}...' is {entry.Key.Length} characters long - Windows Installer can write a registry key of at most 255 characters (and one level at most 254).", ["registry.key"]);
            }

            // An x86 package has only the 32-bit view: "Software\X" and "Software\WOW6432Node\X" are the same key there (the generator drops the
            // WOW6432Node segment, ADR 0108), so both listed would build the same Registry row twice and wix would fail with a raw duplicate-id error.
            var effectiveKey = Architecture == PackageArchitecture.X86 && Compilation.Wow6432Redirect.TryResolve(entry.Root, entry.Key, out var resolvedKey) ? resolvedKey : entry.Key;
            var identity = $"{entry.Action}|{entry.Root}|{effectiveKey}|{(entry.Action == RegistryEntryAction.RemoveKey ? "" : entry.Name)}";
            if (!seenRegistry.Add(identity))
            {
                var x86Note = Architecture == PackageArchitecture.X86 && Registry.Any(e => e.Key.Contains("WOW6432Node", StringComparison.OrdinalIgnoreCase)) ? " An x86 package only has the 32-bit registry, so the WOW6432Node and plain keys are the same place." : "";
                yield return new ValidationResult($"registry: {where} {(entry.Name.Length > 0 ? $"value '{entry.Name}'" : "(default)")} is listed more than once ({entry.Action}) - keep one.{x86Note}", ["registry.key"]);
            }

            if (entry.Action == RegistryEntryAction.Write && entry.ValueType == RegistryValueType.Integer && MinimumRequirements.IntegerProblem(entry.Value) is { } integerProblem)
            {
                yield return new ValidationResult($"registry: {where} {(entry.Name.Length > 0 ? $"value '{entry.Name}'" : "(default)")} is an Integer, so its value {integerProblem}.", ["registry.value"]);
            }

            if (entry.Action == RegistryEntryAction.Write && entry.ValueType == RegistryValueType.Binary && MinimumRequirements.BinaryProblem(entry.Value) is { } binaryProblem)
            {
                yield return new ValidationResult($"registry: {where} {(entry.Name.Length > 0 ? $"value '{entry.Name}'" : "(default)")} is Binary, so its value {binaryProblem}.", ["registry.value"]);
            }

            if (AppInfo.InstallScope == InstallScope.PerUser && entry.Root == RegistryRoot.Hklm)
            {
                yield return new ValidationResult($"registry: {where} is under HKLM, but this is a per-user install - it can't write HKLM without elevation (MSI error 1406). Use HKCU, or switch to a per-machine install.", ["registry.root"]);
            }
        }

        // Not a hard error (ADR 0094): wix 7.0.0 builds 1.0, 1, 1.2.3.4, 300.0.0 and 1.0.0-beta, warning (WIX1148) only about values outside
        // Windows Installer's documented range. The Console shows the same advice as a note; the author decides.
        if (string.IsNullOrWhiteSpace(ResolvedProductVersion))
        {
            yield return new ValidationResult("productVersion can't be empty.", [nameof(ProductVersion)]);
        }

        else if (!MinimumRequirements.IsBuildableVersion(ResolvedProductVersion))
        {
            // wix 7.0.0 stops with WIX0108 for these, so "valid" here would only postpone the failure to the build (ADR 0122).
            yield return new ValidationResult(
                $"product version '{ResolvedProductVersion}' isn't a version Windows Installer can build. Use up to four numbers separated by dots, such as 1.0.0 or 1.2.3.4 (a -label such as 1.0.0-beta is allowed).",
                [ProductVersion is null ? nameof(DisplayVersion) : nameof(ProductVersion)]);
        }

        // Two files to the same place: Windows Installer keeps one of them, so one of the files silently never arrives.
        foreach (var group in Files.Declared
                     .Where(f => !string.IsNullOrWhiteSpace(f.InstallPath))
                     .GroupBy(f => (f.Root, Path: f.InstallPath.Replace('/', '\\').Trim('\\').ToLowerInvariant()))
                     .Where(g => g.Count() > 1))
        {
            yield return new ValidationResult(
                $"Files {string.Join(" and ", group.Select(f => $"'{f.Id}'"))} both install to '{group.First().InstallPath}'. A destination can hold only one file: change one of the install paths.",
                ["files.declared.installPath"]);
        }

        var seenProperties = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in Properties)
        {
            if (!MsiProperty.IsValidName(property.Id))
            {
                yield return new ValidationResult(
                    $"property '{property.Id}' isn't a valid public MSI property name (UPPERCASE letters, digits, '_' or '.', starting with a letter or '_').",
                    [nameof(Properties)]);
            }
            else if (MsiProperty.ReservedNames.Contains(property.Id))
            {
                yield return new ValidationResult(
                    $"property '{property.Id}' is already set by another field (install scope, App Info, or the package identity) - change it there instead.",
                    [nameof(Properties)]);
            }
            else if (!seenProperties.Add(property.Id))
            {
                yield return new ValidationResult($"property '{property.Id}' is listed more than once.", [nameof(Properties)]);
            }

            if (string.IsNullOrEmpty(property.Value) || property.Value.Any(char.IsControl))
            {
                yield return new ValidationResult(
                    $"property '{property.Id}' needs a non-empty value without line breaks or control characters.",
                    [nameof(Properties)]);
            }
        }

        // "Graceful Ingestion, Deferred Native Errors" pass: dropped the per-segment
        // DirectorySegmentRules.Validate check (illegal characters, trailing space/period,
        // reserved device names) that used to run here - it pre-emptively rejected values native
        // `wix.exe` doesn't reliably reject at compile time either (some of these are Windows
        // filesystem quirks that only ever surface, if at all, at real install time). Rule 1: let
        // native `wix build` be the sole evaluator of WiX-level path validity; this Console no
        // longer invents its own stricter rule set on top of it. `TargetDirectoryResolver.TryParse`
        // below is a different, still-necessary kind of check - not "is this a valid Windows path,"
        // but "does WxsGenerator even know which StandardDirectory to nest INSTALLFOLDER under" -
        // a structural requirement of this schema, not an extra WiX-level strictness layer.
        if (!TargetDirectoryResolver.TryParse(TargetDirectory, out _, out _, Architecture))
        {
            yield return new ValidationResult(
                $"targetDirectory '{TargetDirectory}' must start with a recognized WiX folder token (e.g. [ProgramFiles64Folder]) or a literal path under Program Files/Windows System32.",
                [nameof(TargetDirectory)]);
        }

        var declaredFileIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var file in Files.Declared)
        {
            if (!declaredFileIds.Add(file.Id))
            {
                yield return new ValidationResult(
                    $"File id '{file.Id}' is used more than once in Files & Folders - each file needs a unique id.",
                    [nameof(Files)]);
            }
        }

        foreach (var shortcut in Shortcuts)
        {
            // A shortcut added before it has a Name yet (e.g. "Add Shortcut" clicked with nothing
            // in Files & Folders to default a target from) would otherwise read as "Shortcut ''" -
            // this reads naturally either way instead.
            var shortcutLabel = string.IsNullOrEmpty(shortcut.Name) ? "A new shortcut" : $"Shortcut '{shortcut.Name}'";
            // The Name becomes a .lnk/.url file name: WiX rejects an empty or illegal one with a raw WIX0027/WIX0006
            // that points at a temp path, so say it here in the user's terms (found by UAT T3).
            if (string.IsNullOrWhiteSpace(shortcut.Name))
            {
                yield return new ValidationResult($"{shortcutLabel} needs a name - it becomes the shortcut's file name.", ["shortcuts.name"]);
            }
            else if (shortcut.Name.IndexOfAny(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) >= 0 || shortcut.Name.Any(char.IsControl) || shortcut.Name.EndsWith('.') || shortcut.Name.EndsWith(' '))
            {
                yield return new ValidationResult(
                    $"{shortcutLabel}: Windows can't use that as a file name. Remove any of \\ / : * ? \" < > | (and leading/trailing dots or spaces).",
                    ["shortcuts.name"]);
            }
            else if (shortcut.Name.Length > 200)
            {
                yield return new ValidationResult($"{shortcutLabel}: the name is {shortcut.Name.Length} characters; keep it under 200.", ["shortcuts.name"]);
            }

            var hasFileTarget = !string.IsNullOrEmpty(shortcut.TargetFileId);
            var hasPathTarget = !string.IsNullOrEmpty(shortcut.TargetPath);

            if (hasFileTarget == hasPathTarget)
            {
                yield return new ValidationResult(
                    hasFileTarget
                        ? $"{shortcutLabel} can't target both a declared file and a custom path/URL - pick one in the Target field."
                        : $"{shortcutLabel} needs a Target - either a declared file or a custom path/URL.",
                    [nameof(Shortcuts)]);
            }
            else if (hasPathTarget && Compilation.UrlShortcutFile.IsUrl(shortcut.TargetPath) && shortcut.TargetPath!.Any(char.IsControl))
            {
                // ADR 0052: a URL becomes the "URL=" line of a generated .url (INI-style) file - a line
                // break in it would inject further keys into that file.
                yield return new ValidationResult(
                    $"{shortcutLabel}: a URL target can't contain line breaks or control characters.",
                    [nameof(Shortcuts)]);
            }
            else if (hasPathTarget && !Compilation.UrlShortcutFile.IsUrl(shortcut.TargetPath) && !Compilation.ShortcutTarget.IsPropertyReference(shortcut.TargetPath)
                && !Compilation.ShortcutTarget.IsAbsolutePath(shortcut.TargetPath))
            {
                // Anything else (a bare file name, a relative path) builds and installs but creates no shortcut: MSI reads a Target with no
                // square brackets as a Feature name (verified with wix 7.0.0 + msiexec). Say so here instead of failing silently.
                yield return new ValidationResult(
                    $"{shortcutLabel}: the target '{shortcut.TargetPath}' isn't one WinRelease can use. Use a web address (https://...), a full path that starts with a drive letter or a network share, or a [Property] path such as [INSTALLFOLDER] followed by the file name.",
                    [nameof(Shortcuts)]);
            }
            else if (hasFileTarget && !declaredFileIds.Contains(shortcut.TargetFileId!))
            {
                yield return new ValidationResult(
                    $"{shortcutLabel} targets file '{shortcut.TargetFileId}', which is not declared in Files & Folders.",
                    [nameof(Shortcuts)]);
            }

            if (shortcut.Advertise && !hasFileTarget)
            {
                // Verified against the real `wix` CLI (WIX0035): Advertise="yes" and an explicit
                // Target attribute are mutually exclusive, and a non-file target always needs one.
                // WxsGenerator defensively forces Advertise off here regardless, but surface it as a
                // real validation error too - "I turned this on and nothing happened" is worse than
                // a clear message explaining why it can't apply to a Custom target.
                yield return new ValidationResult(
                    $"{shortcutLabel} is Advertised, but that only works for a declared-file Target - switch its Target back to a declared file, or turn Advertised off.",
                    [nameof(Shortcuts)]);
            }
        }

        var seenVariables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var variable in EnvironmentVariables)
        {
            if (string.IsNullOrWhiteSpace(variable.Name))
            {
                yield return new ValidationResult("An environment variable needs a name.", [nameof(EnvironmentVariables)]);
                continue;
            }

            // Windows environment names can't contain '=' or control characters (found by UAT T5).
            if (variable.Name.Contains('=') || variable.Name.Any(char.IsControl))
            {
                yield return new ValidationResult($"Environment variable name '{variable.Name}' can't contain '=' or control characters - Windows would not accept it.", [nameof(EnvironmentVariables)]);
            }

            if (!seenVariables.Add($"{variable.Action}|{variable.System}|{variable.Name}"))
            {
                yield return new ValidationResult($"Environment variable '{variable.Name}' ({(variable.System ? "system" : "user")}, {variable.Action}) is listed more than once - keep one.", [nameof(EnvironmentVariables)]);
            }

            if (variable.Part != EnvironmentVariablePart.All && variable.Action != EnvironmentVariableAction.Create && string.IsNullOrEmpty(variable.Separator))
            {
                yield return new ValidationResult($"Environment variable '{variable.Name}' adds to an existing value (first/last) so it needs a separator such as ';'.", [nameof(EnvironmentVariables)]);
            }

            if (variable.System && AppInfo.InstallScope == InstallScope.PerUser)
            {
                yield return new ValidationResult($"Environment variable '{variable.Name}' is machine-wide (system), but this is a per-user install - it can't write the system environment without elevation. Make it a user variable, or switch to a per-machine install.", [nameof(EnvironmentVariables)]);
            }
        }

        // A 32-bit (x86) package has no 64-bit folders: ICE80 rejects a 32-bit component in a 64-bit directory.
        if (Architecture == PackageArchitecture.X86)
        {
            var sixtyFourBit = new[] { InstallRoot.ProgramFiles64Folder, InstallRoot.CommonFiles64Folder, InstallRoot.System64Folder };
            foreach (var file in Files.Declared.Where(f => sixtyFourBit.Contains(f.Root)))
            {
                yield return new ValidationResult($"File '{file.Id}' installs to a 64-bit folder ({file.Root}), but this is an x86 package. Use the 32-bit folder, or build for x64.", ["files.declared.root"]);
            }

            foreach (var harvest in Files.Harvest.Where(h => sixtyFourBit.Contains(h.Root)))
            {
                yield return new ValidationResult($"Folder '{harvest.SourceFolder}' installs to a 64-bit folder ({harvest.Root}), but this is an x86 package. Use the 32-bit folder, or build for x64.", ["files.harvest.root"]);
            }

            if (TargetDirectoryResolver.TryParse(TargetDirectory, out var targetRootId, out _, Architecture) && targetRootId is "ProgramFiles64Folder" or "CommonFiles64Folder" or "System64Folder")
            {
                yield return new ValidationResult($"Target directory is under {targetRootId}, a 64-bit folder, but this is an x86 package. Use [ProgramFilesFolder], or build for x64.", [nameof(TargetDirectory)]);
            }
        }

        if (Intune?.Requirements?.MinimumOSVersion is { Length: > 0 } minimumOsVersion
            && !Version.TryParse(minimumOsVersion, out _))
        {
            yield return new ValidationResult(
                $"Minimum OS Version '{minimumOsVersion}' isn't a valid Windows build number (e.g. '10.0.19041').",
                [nameof(Intune)]);
        }
    }
}

/// <summary>
/// Add/Remove Programs ("ARP") properties - all optional/default-off, mapped straight onto the
/// standard MSI properties Windows' Settings/Control Panel "Installed Apps" entry reads (see the
/// per-field WiX-property mapping on <see cref="Compilation.WxsGenerator"/>). See ADR 0039.
/// </summary>
public sealed record AppInfo
{
    /// <summary>WiX/MSI property: ARPHELPLINK.</summary>
    public string? SupportUrl { get; init; }

    /// <summary>WiX/MSI property: ARPURLUPDATEINFO.</summary>
    public string? UpdateUrl { get; init; }

    /// <summary>WiX/MSI property: ARPURLINFOABOUT.</summary>
    public string? AboutUrl { get; init; }

    /// <summary>WiX/MSI property: ARPHELPTELEPHONE.</summary>
    public string? SupportPhone { get; init; }

    /// <summary>WiX/MSI property: ARPCONTACT.</summary>
    public string? Contact { get; init; }

    /// <summary>WiX/MSI property: ARPCOMMENTS.</summary>
    public string? Comments { get; init; }

    /// <summary>
    /// ADR 0113: when on (the default), the MSI says it was packaged with WinRelease and where to get it, in its Summary Information
    /// Comments and, when <see cref="Comments"/> is empty, in the Add/Remove Programs comments. Nothing is shown during install.
    /// </summary>
    public bool PackagedWithCredit { get; init; } = true;

    /// <summary>
    /// Path (relative to the build's source root) to an .ico/.exe to use as the Add/Remove Programs
    /// entry's icon (WiX/MSI property: ARPPRODUCTICON). Ignored when <see cref="AutoExtractIcon"/>
    /// is set - see that property.
    /// </summary>
    public string? IconPath { get; init; }

    /// <summary>
    /// When set, ARPPRODUCTICON is resolved from the first declared file whose SourcePath ends in
    /// ".exe" instead of <see cref="IconPath"/> - there's no persisted "primary executable" concept
    /// in the manifest (the Console's primaryFileId is deliberately session-local, ADR 0033), so
    /// this is a deterministic best-effort default, not a real "primary file" reference.
    /// </summary>
    public bool AutoExtractIcon { get; init; }

    /// <summary>
    /// Drives the compiled package's real <c>Package/@Scope</c> attribute (see
    /// <see cref="Compilation.WxsGenerator"/>) - promoted from UI-only to functional per the
    /// "Graceful Ingestion" pass: a brand-new manifest defaults to <see cref="InstallScope.PerMachine"/>
    /// (unchanged default), but an imported source's real declared scope is now preserved rather
    /// than silently overridden (ADR 0005 no longer forces per-machine unconditionally - see the
    /// "Graceful Ingestion, Deferred Native Errors" pass). The Console's manual toggle stays
    /// disabled for Per-User for now - this field is currently only ever set to PerUser by import,
    /// not by hand-authoring a new manifest.
    /// </summary>
    public InstallScope InstallScope { get; init; } = InstallScope.PerMachine;

    /// <summary>WiX/MSI property: ARPNOMODIFY - hides the "Modify" button/action.</summary>
    public bool DisableModify { get; init; }

    /// <summary>WiX/MSI property: ARPNOREPAIR - hides the "Repair" action.</summary>
    public bool DisableRepair { get; init; }

    /// <summary>WiX/MSI property: ARPNOREMOVE - hides the "Uninstall"/"Remove" action.</summary>
    public bool DisableRemove { get; init; }

    /// <summary>WiX/MSI property: ARPSYSTEMCOMPONENT - hides the product entirely from Windows' Installed Apps list.</summary>
    public bool HideFromControlPanel { get; init; }

    /// <summary>
    /// Adds WiX's stock install wizard (WixUI_InstallDir without the licence page: Welcome, Install folder, Ready, Progress, Finish, plus
    /// maintenance screens). On by default (ADR 0098); silent installs (/qn) never show it. Off gives the bare progress bar.
    /// </summary>
    public bool InstallWizard { get; init; } = true;
}

/// <summary>See <see cref="AppInfo.InstallScope"/> - UI-only, doesn't change what <see cref="Compilation.WxsGenerator"/> compiles yet. See ADR 0005/0039.</summary>
public enum InstallScope
{
    PerMachine,
    PerUser,
}

public sealed record ManifestFiles
{
    /// <summary>Explicit source + install destination. Required for anything a Shortcut or registry entry needs to reference. See ADR 0008.</summary>
    public List<DeclaredFile> Declared { get; init; } = [];

    /// <summary>Bulk assets pulled from a source folder at build time. See ADR 0008.</summary>
    public List<HarvestFolder> Harvest { get; init; } = [];
}

public sealed record DeclaredFile
{
    public required string Id { get; init; }
    public required string SourcePath { get; init; }
    public required string InstallPath { get; init; }

    /// <summary>Top-level install destination. See ADR 0033.</summary>
    public InstallRoot Root { get; init; } = InstallRoot.InstallFolder;

    /// <summary>WiX/MSI <c>File/@ReadOnly</c>. Defaults to false (every file before this field existed was authored without it, WiX's own default).</summary>
    public bool ReadOnly { get; init; }

    /// <summary>WiX/MSI <c>File/@Hidden</c>. Defaults to false, same reasoning as <see cref="ReadOnly"/>.</summary>
    public bool Hidden { get; init; }
}

public sealed record HarvestFolder
{
    public required string SourceFolder { get; init; }
    public required string InstallPath { get; init; }

    /// <summary>Top-level install destination. See ADR 0033.</summary>
    public InstallRoot Root { get; init; } = InstallRoot.InstallFolder;
}

/// <summary>
/// Where a Declared File/Harvest Folder's InstallPath is rooted. See ADR
/// 0033 - <see cref="InstallFolder"/> is the product's own directory,
/// nested wherever <see cref="WinReleaseManifest.TargetDirectory"/> resolves
/// to (ADR 0038); the others are raw WiX standard directories, placed loose
/// at that root rather than nested under the product's own folder.
/// <see cref="AppDataFolder"/>/<see cref="LocalAppDataFolder"/> resolve to
/// the *installing* user's profile under this product's per-machine-only
/// install scope (ADR 0005) - not each end-user's - a deliberate, documented
/// tradeoff, not an oversight.
/// </summary>
public enum InstallRoot
{
    InstallFolder,
    CommonFilesFolder,
    SystemFolder,
    AppDataFolder,
    LocalAppDataFolder,
    ProgramFiles64Folder,
    ProgramFilesFolder,
    CommonFiles64Folder,
    /// <summary>
    /// <c>%ProgramData%</c> (<c>C:\ProgramData</c>) - shared, per-machine application data, unlike
    /// <see cref="AppDataFolder"/>/<see cref="LocalAppDataFolder"/> which land in the installing
    /// user's own profile. See the Console's "Directory Naming Alignment" pass.
    /// </summary>
    CommonAppDataFolder,
    /// <summary>
    /// The real, non-redirected <c>%WinDir%\System32</c> for a 64-bit component - distinct from
    /// <see cref="SystemFolder"/>, which is the *same* WiX/MSI property name Windows itself
    /// redirects to <c>%WinDir%\SysWOW64</c> for a 32-bit process running under WOW64 on a 64-bit
    /// OS. Only meaningful (and only shown in the Console) for an x64/arm64 build - see the
    /// "Dynamic System Folder Mapping" pass.
    /// </summary>
    System64Folder,
}

/// <summary>The build architecture passed to <c>wix build -arch</c>. See ADR 0038.</summary>
public enum PackageArchitecture
{
    X64,
    X86,
    Arm64,
}

public sealed record Shortcut
{
    public required string Name { get; init; }

    /// <summary>
    /// Must match the <see cref="DeclaredFile.Id"/> of a file declared in
    /// files.declared. Exactly one of <see cref="TargetFileId"/>/<see cref="TargetPath"/>
    /// must be set - see ADR 0035.
    /// </summary>
    public string? TargetFileId { get; init; }

    /// <summary>
    /// A raw WiX Shortcut <c>Target</c> expression (a URL, a literal path,
    /// or a <c>[Property]</c>-prefixed path) for a shortcut that isn't tied
    /// to a declared file - e.g. a file inside a Harvest Folder (whose
    /// individual files aren't known until build time, so they can never
    /// have a <see cref="DeclaredFile.Id"/> to target), or an external URL.
    /// Exactly one of <see cref="TargetFileId"/>/<see cref="TargetPath"/>
    /// must be set - see ADR 0035.
    /// </summary>
    public string? TargetPath { get; init; }

    /// <summary>
    /// Where the .lnk itself lives. One of the <see cref="ShortcutLocation"/> convenience constants
    /// (the three real Windows "shell" shortcut folders - Desktop, Start Menu, Startup - not places
    /// a normal file would ever install to), a raw WiX Directory Id typed by hand, or the Console's
    /// own <c>wr:dir:{root}:{relativePath}</c> sentinel pointing anywhere in the project's own
    /// install-directory tree - the exact same scheme <see cref="WorkingDirectory"/> already uses.
    /// A free string on purpose (not a closed enum): real packaging tools let a shortcut go anywhere
    /// in the install tree, not just Desktop/Start Menu/Startup.
    /// </summary>
    public required string Location { get; init; }

    /// <summary>
    /// Defaults to INSTALLFOLDER when omitted. Either a raw WiX Directory Id,
    /// or the Console's own <c>wr:dir:{root}:{relativePath}</c> sentinel
    /// (resolved by <see cref="Compilation.WxsGenerator"/> to the exact same
    /// deterministic Id a real folder under that root/path would get) - see
    /// ADR 0033 and ADR 0035. Always a plain string either way: freely
    /// overwritable by hand, never enforced.
    /// </summary>
    public string? WorkingDirectory { get; init; }

    public string? Arguments { get; init; }

    public string? Description { get; init; }

    /// <summary>Path (relative to the build's source root) to an .ico/.exe to use as the shortcut's icon, instead of the target file's own. See ADR 0033.</summary>
    public string? IconPath { get; init; }

    /// <summary>
    /// The launched window's initial state (WiX's <c>Shortcut/@Show</c>). Defaults to Normal, which
    /// <see cref="Compilation.WxsGenerator"/> leaves unauthored entirely rather than writing
    /// <c>Show="normal"</c> explicitly - WiX's own default, so there's nothing to say. See ADR 0063.
    /// </summary>
    public ShortcutWindowStyle WindowStyle { get; init; } = ShortcutWindowStyle.Normal;

    /// <summary>
    /// WiX's <c>Shortcut/@Advertise</c> - lets the shortcut trigger MSI's install-on-demand/self-
    /// repair instead of launching the target path directly. Defaults to false (every shortcut
    /// before this field existed was non-advertised). Only meaningful for a declared-file target:
    /// verified against the real `wix` CLI (WIX0035) that <c>Advertise="yes"</c> and an explicit
    /// <c>Target</c> attribute are flatly incompatible, and a TargetPath-based shortcut always needs
    /// an explicit Target - see <see cref="Compilation.WxsGenerator"/>, which forces this false for
    /// any shortcut that isn't TargetFileId-based regardless of what's stored here.
    /// </summary>
    public bool Advertise { get; init; }
}

/// <summary>
/// Convenience constants for <see cref="Shortcut.Location"/>'s real Windows shell shortcut folders -
/// the exact WiX StandardDirectory Ids, so a caller can write <c>ShortcutLocation.DesktopFolder</c>
/// instead of the magic string. Deliberately not a closed enum: <see cref="Shortcut.Location"/> also
/// accepts any other WiX Directory reference. Desktop/ProgramMenu/Startup plus five more - Personal
/// (Documents), Favorites, Fonts, SendTo, Template - chosen as the ones that actually show up as
/// real shortcut targets in Advanced Installer's own location list, not WiX's full ~25-entry
/// StandardDirectory set (NetHood/PrintHood/AdminTools/etc. - nobody targets a shortcut there). All
/// eight verified against the real `wix` CLI as valid StandardDirectory Ids before being added here.
/// </summary>
public static class ShortcutLocation
{
    public const string DesktopFolder = "DesktopFolder";
    public const string ProgramMenuFolder = "ProgramMenuFolder";
    public const string StartupFolder = "StartupFolder";
    /// <summary>WiX's own (legacy MSI) Id for the current user's Documents folder.</summary>
    public const string PersonalFolder = "PersonalFolder";
    public const string FavoritesFolder = "FavoritesFolder";
    public const string FontsFolder = "FontsFolder";
    public const string SendToFolder = "SendToFolder";
    /// <summary>Singular, matching WiX's own Id spelling exactly - not "TemplatesFolder".</summary>
    public const string TemplateFolder = "TemplateFolder";
}

/// <summary>
/// WiX's own three legal <c>Shortcut/@Show</c> values (verified against wix 7.0.0 - anything else
/// is rejected at compile time with WIX0021), lowercased when authored. See ADR 0063.
/// </summary>
public enum ShortcutWindowStyle
{
    Normal,
    Minimized,
    Maximized,
}

/// <summary>One authored MSI property (ADR 0053). See <see cref="WinReleaseManifest.Properties"/>.</summary>
public sealed record MsiProperty
{
    public required string Id { get; init; }

    public required string Value { get; init; }

    /// <summary>Public properties are UPPERCASE - that is what lets msiexec's command line override them.</summary>
    public static bool IsValidName(string? id) =>
        id is { Length: > 0 and <= 72 } && System.Text.RegularExpressions.Regex.IsMatch(id, @"^[A-Z_][A-Z0-9_.]*$");

    /// <summary>Properties authored from other manifest fields; setting them here would collide (e.g. WIX0091 for ALLUSERS).</summary>
    public static readonly IReadOnlySet<string> ReservedNames = new HashSet<string>(StringComparer.Ordinal)
    {
        "ALLUSERS", "PRODUCTCODE", "UPGRADECODE", "PRODUCTVERSION", "PRODUCTNAME", "MANUFACTURER", "PRODUCTLANGUAGE",
        "INSTALLFOLDER", "TARGETDIR", "MSIINSTALLPERUSER",
        "ARPHELPLINK", "ARPURLUPDATEINFO", "ARPURLINFOABOUT", "ARPHELPTELEPHONE", "ARPCONTACT", "ARPCOMMENTS",
        "ARPPRODUCTICON", "ARPNOMODIFY", "ARPNOREPAIR", "ARPNOREMOVE", "ARPSYSTEMCOMPONENT",
    };
}

/// <summary>A COM class a declared file registers. See <see cref="WinReleaseManifest.ComClasses"/>.</summary>
public sealed record ComClass
{
    /// <summary>CLSID.</summary>
    public required Guid ClassId { get; init; }

    /// <summary>The <see cref="DeclaredFile.Id"/> of the server file this class lives in.</summary>
    public required string FileId { get; init; }

    public ComServerContext Context { get; init; } = ComServerContext.InprocServer32;

    /// <summary>Only meaningful for <see cref="ComServerContext.InprocServer32"/>; omitted when null.</summary>
    public ComThreadingModel? ThreadingModel { get; init; }

    public string? Description { get; init; }

    /// <summary>Versioned ProgID, e.g. <c>Acme.Widget.1</c>. Required when <see cref="VersionIndependentProgId"/> is set.</summary>
    public string? ProgId { get; init; }

    /// <summary>Version-independent ProgID, e.g. <c>Acme.Widget</c> - gets a CurVer pointing at <see cref="ProgId"/>.</summary>
    public string? VersionIndependentProgId { get; init; }
}

public enum ComServerContext
{
    InprocServer32,
    LocalServer32,
}

public enum ComThreadingModel
{
    Apartment,
    Both,
    Free,
    Neutral,
}

/// <summary>A type library a declared file registers. See <see cref="WinReleaseManifest.ComTypeLibs"/>.</summary>
public sealed record ComTypeLib
{
    public required Guid TypeLibId { get; init; }

    public required string FileId { get; init; }

    public string? Description { get; init; }

    /// <summary>LCID; 0 = neutral.</summary>
    public int Language { get; init; }

    public int MajorVersion { get; init; } = 1;

    public int MinorVersion { get; init; }
}

public sealed record RegistryEntry
{
    public required RegistryRoot Root { get; init; }
    public required string Key { get; init; }

    /// <summary>Empty string represents the key's default (unnamed) value. Ignored for <see cref="RegistryEntryAction.RemoveKey"/> - the whole key goes, not one value.</summary>
    public required string Name { get; init; }

    /// <summary>String form of the value; Integer/Binary/MultiString are still transmitted as text (Binary as hex, MultiString newline-separated). Ignored for anything other than <see cref="RegistryEntryAction.Write"/>.</summary>
    public string Value { get; init; } = "";

    /// <summary>Ignored for anything other than <see cref="RegistryEntryAction.Write"/>.</summary>
    public RegistryValueType ValueType { get; init; } = RegistryValueType.String;

    /// <summary>
    /// Defaults to Write (every entry before this field existed meant "author this value") - see
    /// <see cref="RegistryEntryAction"/> for what RemoveValue/RemoveKey mean and how they differ
    /// from Write. Mirrors Advanced Installer/Master Packager's own "remove this on
    /// install/uninstall" entries, not something authoring a value already does automatically
    /// (an MSI-authored Write value IS already removed on uninstall by the Windows Installer engine
    /// itself with no extra authoring - RemoveValue/RemoveKey exist for cleaning up registry content
    /// the installer itself never wrote, e.g. a legacy/competitor key).
    /// </summary>
    public RegistryEntryAction Action { get; init; } = RegistryEntryAction.Write;

    /// <summary>
    /// RemoveKey only (ignored otherwise): false (default) removes the key when this product is
    /// installed - the common "clean up before I write mine" case; true defers removal to when this
    /// product is uninstalled instead. Verified against the real `wix` CLI (WIX0021): WiX's
    /// RemoveRegistryKey/@Action accepts only "removeOnInstall"/"removeOnUninstall", always
    /// required, no bare "remove"/default - RemoveRegistryValue has no equivalent timing choice at
    /// all (always install-time), which is why this flag only applies to RemoveKey.
    /// </summary>
    public bool RemoveOnUninstall { get; init; }
}

/// <summary>
/// What a Registry entry does. Write authors the value (ADR 0033's original, only behavior).
/// RemoveValue/RemoveKey clean up registry content this product doesn't own - see
/// <see cref="Compilation.WxsGenerator"/>'s RemoveRegistryValue/RemoveRegistryKey handling.
/// </summary>
public enum RegistryEntryAction
{
    Write,
    RemoveValue,
    RemoveKey,
}

public enum RegistryRoot
{
    Hklm,
    Hkcu,
    Hkcr,
    Hku,
}

/// <summary>
/// One WiX/MSI Environment-table entry (ADR 0077). Verified against the real `wix` CLI before any
/// of this was authored: Environment's attribute names/legal values below (Action: create/set/remove;
/// Part: all/first/last; System default "no" = per-user HKCU, "yes" = per-machine HKLM; Permanent
/// default "no" = Windows Installer removes it again on uninstall) are the compiler's own, not
/// guessed. Unlike RegistryEntry/DeclaredFile, there's no "ignored for other actions" field here -
/// every attribute applies to every Action the same way a real Environment element's do.
/// </summary>
public sealed record EnvironmentVariableEntry
{
    public required string Name { get; init; }

    /// <summary>Ignored (and omittable) for <see cref="EnvironmentVariableAction.Remove"/> - verified against the real `wix` CLI, which defaults an absent Value to empty rather than requiring one.</summary>
    public string Value { get; init; } = "";

    /// <summary>Set always overwrites; Create only writes if the variable doesn't already exist; Remove deletes it. Defaults to Set - every entry before this field existed meant "author this value".</summary>
    public EnvironmentVariableAction Action { get; init; } = EnvironmentVariableAction.Set;

    /// <summary>All replaces the variable outright (the common case); First/Last prepend/append Value using Separator - the PATH-style "add my folder" case. Defaults to All.</summary>
    public EnvironmentVariablePart Part { get; init; } = EnvironmentVariablePart.All;

    /// <summary>WiX/MSI Environment/@System: true writes to the machine-wide environment (HKLM, needs the install itself to be per-machine); false (default) writes to the current user's own (HKCU).</summary>
    public bool System { get; init; }

    /// <summary>WiX/MSI Environment/@Permanent: true leaves the value (or appended segment) behind after uninstall; false (default) lets Windows Installer clean it back up, same as a registry Write value.</summary>
    public bool Permanent { get; init; }

    /// <summary>WiX/MSI Environment/@Separator - only meaningful for Part First/Last. Defaults to ";", the universal Windows PATH-style separator.</summary>
    public string Separator { get; init; } = ";";
}

/// <summary>What an Environment Variable entry does to the named variable. See <see cref="EnvironmentVariableEntry"/>.</summary>
public enum EnvironmentVariableAction
{
    Set,
    Create,
    Remove,
}

/// <summary>How Value combines with whatever the variable already holds. See <see cref="EnvironmentVariableEntry"/>.</summary>
public enum EnvironmentVariablePart
{
    All,
    First,
    Last,
}

public enum RegistryValueType
{
    String,
    ExpandString,
    Integer,
    MultiString,
    Binary,
}

/// <summary>
/// Requirement constraints consumed by WinRelease.Intune when wrapping the
/// build into an .intunewin package (Ticket 04). Detection is intentionally
/// not modeled here: every WinRelease build produces an MSI Artifact Format,
/// so Intune detection defaults to that MSI's ProductCode with no manifest
/// authoring required.
/// </summary>
public sealed record IntuneManifest
{
    public IntuneRequirements? Requirements { get; init; }
}

public sealed record IntuneRequirements
{
    /// <summary>e.g. "10.0.19041". Validated as a well-formed version string, not checked against a known-OS list.</summary>
    public string? MinimumOSVersion { get; init; }

    public IntuneArchitecture? Architecture { get; init; }
}

public enum IntuneArchitecture
{
    X86,
    X64,
    Arm64,
}

public static class VersionMapper
{
    /// <summary>
    /// Derives an MSI-compliant ProductVersion (major.minor.patch) from a SemVer
    /// DisplayVersion, stripping any prerelease (-) or build metadata (+) suffix.
    /// </summary>
    public static string DeriveProductVersion(string displayVersion) =>
        displayVersion.Split('-', '+')[0];

    public static bool IsWellFormedProductVersion(string productVersion)
    {
        var segments = productVersion.Split('.');
        if (segments.Length != 3)
        {
            return false;
        }

        // Windows Installer's own limits (verified: wix 7.0.0 warns WIX1148 "unpredictable and undefined"
        // beyond them): major < 256, minor < 256, build < 65536.
        int[] maximums = [255, 255, 65535];
        for (var i = 0; i < segments.Length; i++)
        {
            if (!int.TryParse(segments[i], System.Globalization.NumberStyles.None, null, out var value) || value > maximums[i])
            {
                return false;
            }
        }

        return true;
    }
}
