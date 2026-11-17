using System.Text;
using System.Xml.Linq;
using WinRelease.Core.Manifest;

namespace WinRelease.Core.Compilation;

/// <summary>
/// Builds WiX v5 XML directly from a parsed <see cref="WinReleaseManifest"/> -
/// no hand-authored .wxs, no WixToolset.Sdk MSBuild project (ADR 0022
/// supersedes ADR 0009 on that point; compiled headlessly via `wix build`,
/// see <see cref="WixCompiler"/>).
/// </summary>
public static class WxsGenerator
{
    public static readonly XNamespace Namespace = "http://wixtoolset.org/schemas/v4/wxs";
    public static readonly XNamespace UiNamespace = "http://wixtoolset.org/schemas/v4/wxs/ui";

    private static readonly InstallRoot[] OptionalRoots =
    [
        InstallRoot.CommonFilesFolder,
        InstallRoot.SystemFolder,
        InstallRoot.AppDataFolder,
        InstallRoot.LocalAppDataFolder,
        InstallRoot.ProgramFiles64Folder,
        InstallRoot.ProgramFilesFolder,
        InstallRoot.CommonFiles64Folder,
        InstallRoot.CommonAppDataFolder,
        InstallRoot.System64Folder,
    ];

    /// <summary>True when one ANSI code page (1252 included) can hold all of the text.</summary>
    public static bool FitsAnsi(params string[] texts) => SummaryCodepage(texts) is not null || FitsCodepage(1252, texts);

    private static bool FitsCodepage(int codepage, string[] texts)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var encoding = System.Text.Encoding.GetEncoding(codepage, System.Text.EncoderFallback.ExceptionFallback, System.Text.DecoderFallback.ExceptionFallback);
        try
        {
            foreach (var text in texts)
            {
                encoding.GetBytes(text);
            }

            return true;
        }
        catch (System.Text.EncoderFallbackException)
        {
            return false;
        }
    }

    /// <summary>The text with every character code page 1252 lacks replaced by ?.</summary>
    public static string AnsiSafe(string text)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var encoding = System.Text.Encoding.GetEncoding(1252, new System.Text.EncoderReplacementFallback("?"), System.Text.DecoderFallback.ExceptionFallback);
        return encoding.GetString(encoding.GetBytes(text));
    }

    private static readonly int[] AnsiCodepages = [1252, 1250, 1251, 1253, 1254, 1255, 1256, 1257, 1258, 874, 932, 936, 949, 950];

    /// <summary>The first ANSI code page that can hold every string, or null when 1252 already does (no change) or no single page does (left as it is).</summary>
    public static int? SummaryCodepage(params string[] texts)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance); // .NET only knows UTF-8/UTF-16/ASCII until this is registered
        foreach (var codepage in AnsiCodepages)
        {
            var encoding = System.Text.Encoding.GetEncoding(codepage, System.Text.EncoderFallback.ExceptionFallback, System.Text.DecoderFallback.ExceptionFallback);
            try
            {
                foreach (var text in texts)
                {
                    encoding.GetBytes(text);
                }

                return codepage == 1252 ? null : codepage;
            }
            catch (System.Text.EncoderFallbackException)
            {
            }
        }

        return null;
    }

    /// <summary>ADR 0113: the one line that says what made an MSI and where to get it, for people who find it and for businesses that need more than a basic MSI.</summary>
    public static string CreditText(string? toolVersion = null) =>
        $"Created with WinRelease{(string.IsNullOrEmpty(toolVersion ?? ToolVersion.Current) ? "" : " " + (toolVersion ?? ToolVersion.Current))}, a free MSI builder: https://winrelease.geappsolutions.com. Need more than a basic MSI? https://geappsolutions.com";

    /// <summary>wix's own Summary Information Comments sentence, which QA checks look for.</summary>
    public static string StandardComments(string productName) =>
        $"This installer database contains the logic and data required to install {productName}.";

    /// <summary>The Summary Information Comments with the credit: wix's own sentence kept, then <see cref="CreditText"/>.</summary>
    public static string SummaryComments(string productName) => $"{StandardComments(productName)} {CreditText()}";

    /// <param name="manifest">The parsed, validated manifest.</param>
    /// <param name="sourceRoot">Base directory that every relative sourcePath/sourceFolder in the manifest resolves against.</param>
    /// <param name="generatedRoot">Where build-time generated files (URL shortcuts' .url files, ADR 0052) live; defaults to a subfolder of <paramref name="sourceRoot"/>. <see cref="WixCompiler"/> passes its own temp directory.</param>
    public static XDocument Generate(WinReleaseManifest manifest, string sourceRoot, string? generatedRoot = null)
    {
        var trees = new Dictionary<InstallRoot, DirectoryNode>();

        DirectoryNode TreeFor(InstallRoot installRoot) =>
            trees.TryGetValue(installRoot, out var node) ? node : trees[installRoot] = new DirectoryNode();

        // Desktop/Start Menu/Startup aren't InstallRoots (nothing ever installs a regular file
        // there), so a Shortcut Location/WorkingDirectory sentinel pointing into one of them - e.g.
        // a Start Menu "program group" subfolder - gets its own small tree, separate from `trees`
        // above. Keyed by the real StandardDirectory Id ("ProgramMenuFolder" etc.) directly, since
        // that's also what BuildDirectoryChildren needs below.
        var shellFolderTrees = new Dictionary<string, DirectoryNode>(StringComparer.Ordinal);

        DirectoryNode ShellFolderTreeFor(string standardDirectoryId) =>
            shellFolderTrees.TryGetValue(standardDirectoryId, out var node) ? node : shellFolderTrees[standardDirectoryId] = new DirectoryNode();

        // A Shortcut's Location/WorkingDirectory can point anywhere in the install tree (or, for
        // Location, a Start Menu program-group subfolder) via the wr:dir: sentinel, including a
        // root/subfolder nothing else ever declares a file into (e.g. a shortcut's Location set to
        // "AppData (Roaming)" in a project with no AppData files at all). Touch that exact chain
        // now, before the optional-roots pass below decides what's "used" - otherwise
        // AttachShortcuts would reference a Directory Id that was never emitted anywhere, and
        // `wix build` fails on the dangling reference.
        var explicitlyUsedRoots = new HashSet<InstallRoot>();
        var explicitlyUsedShellFolders = new HashSet<string>(StringComparer.Ordinal);
        foreach (var shortcut in manifest.Shortcuts)
        {
            TouchDirectoryReference(TreeFor, ShellFolderTreeFor, explicitlyUsedRoots, explicitlyUsedShellFolders, EffectiveShortcutLocation(shortcut.Location));
            TouchDirectoryReference(TreeFor, ShellFolderTreeFor, explicitlyUsedRoots, explicitlyUsedShellFolders, shortcut.WorkingDirectory);
        }

        // Collected first, placed after: a file's Component GUID seed and WiX Id can only be settled once every
        // file is known (ADR 0084) - two harvest folders can hold the same relative path, and different
        // seeds can sanitize to the same Id or run past MSI's 72-character key limit.
        var pending = new List<(InstallRoot Root, string InstallPath, PlacedFile File)>();

        foreach (var file in manifest.Files.Declared)
        {
            pending.Add((file.Root, file.InstallPath.Replace('\\', '/'), new PlacedFile(Path.Combine(sourceRoot, file.SourcePath), file.Id, IsDeclared: true, ReadOnly: file.ReadOnly, Hidden: file.Hidden)));
        }

        foreach (var harvest in manifest.Files.Harvest)
        {
            var harvestSource = Path.Combine(sourceRoot, harvest.SourceFolder);
            foreach (var sourcePath in Directory.EnumerateFiles(harvestSource, "*", SearchOption.AllDirectories))
            {
                // ADR 0010: a Harvested File's Component GUID seed is its path relative to the harvest root.
                var relativePath = Path.GetRelativePath(harvestSource, sourcePath).Replace('\\', '/');
                var installPath = harvest.InstallPath.Length == 0 ? relativePath : $"{harvest.InstallPath}/{relativePath}";

                pending.Add((harvest.Root, installPath, new PlacedFile(sourcePath, relativePath, IsDeclared: false)));
            }
        }

        foreach (var (root, installPath, file) in AssignStableIds(pending))
        {
            // ICE80: a 64-bit package installing into a 32-bit location (Program Files (x86), Common Files (x86),
            // SysWOW64) must mark the Component as 32-bit.
            var always32 = manifest.Architecture != PackageArchitecture.X86 && root is InstallRoot.ProgramFilesFolder or InstallRoot.CommonFilesFolder or InstallRoot.SystemFolder;
            // ICE38: a file under the user profile (AppData/LocalAppData, or an install folder that sits there) needs
            // an HKCU registry KeyPath rather than the file itself (ADR 0085).
            var inProfile = root is InstallRoot.AppDataFolder or InstallRoot.LocalAppDataFolder
                || (root == InstallRoot.InstallFolder && TargetDirectoryResolver.TryParse(manifest.TargetDirectory, out var profileRootId, out _, manifest.Architecture) && profileRootId is "AppDataFolder" or "LocalAppDataFolder");
            Place(TreeFor(root), installPath, file with { Always32Bit = always32, InUserProfile = inProfile });
        }

        var declaredFileElements = new Dictionary<string, XElement>(StringComparer.Ordinal);

        // ADR 0038: the product's own folder (INSTALLFOLDER) sits wherever manifest.TargetDirectory
        // resolves to - a developer-chosen root + subpath, not a fixed Manufacturer-subfolder
        // convention (supersedes ADR 0037's InstallUnderManufacturerFolder boolean).
        if (!TargetDirectoryResolver.TryParse(manifest.TargetDirectory, out var targetRootId, out var targetSegments, manifest.Architecture))
        {
            // WinReleaseManifest.Validate() rejects this before compilation is ever reached -
            // fall back to the v1 default rather than throw, so a hand-built manifest that skips
            // validation (tests, WxsImporter) still produces something buildable.
            targetRootId = "ProgramFiles64Folder";
            targetSegments = [];
        }

        // Grouped by the actual WiX StandardDirectory Id rather than by InstallRoot, since a
        // developer's chosen Target Directory root (e.g. [ProgramFiles64Folder]) can coincide with
        // one of the raw "loose files at this root" InstallRoot options below - both then become
        // sibling children of the same single <StandardDirectory>, not two conflicting elements
        // with the same Id.
        var rootChildren = new Dictionary<string, List<XElement>>(StringComparer.Ordinal);
        var rootOrder = new List<string>();

        List<XElement> ChildrenFor(string rootId)
        {
            if (!rootChildren.TryGetValue(rootId, out var list))
            {
                list = [];
                rootChildren[rootId] = list;
                rootOrder.Add(rootId);
            }

            return list;
        }

        // InstallFolder is always emitted, even empty - it's the product's own directory. Always
        // seeded as "INSTALLFOLDER" regardless of where TargetDirectory nests it, so subfolder
        // DirectoryIds (and the wr:dir: sentinel/Shortcut/Registry defaults that assume
        // "INSTALLFOLDER" exists) stay stable across a Target Directory change.
        if (targetSegments.Length > 0 && Enum.TryParse<InstallRoot>(targetRootId, out var targetRoot) && targetRoot != InstallRoot.InstallFolder)
        {
            // ADR 0090: the product folder lives inside this standard folder, and loose files can be placed in the same standard folder
            // (e.g. [ProgramFiles64Folder]Acme\App as the install folder AND a file at programFiles64Folder/Acme/x) - the two used to emit
            // the same "Acme" Directory twice (WIX0091). Merge: walk the raw tree down the target path, mark the last node as INSTALLFOLDER
            // (its raw contents join the install tree) and emit everything from the one tree.
            var node = TreeFor(targetRoot);
            foreach (var segment in targetSegments)
            {
                if (!node.Children.TryGetValue(segment, out var next))
                {
                    next = new DirectoryNode();
                    node.Children[segment] = next;
                }

                node = next;
            }

            var installTree = TreeFor(InstallRoot.InstallFolder);
            MergeInto(installTree, node);
            node.Files.Clear();
            node.Children.Clear();
            node.InstallTree = installTree;
        }
        else
        {
            ChildrenFor(targetRootId).Add(BuildInstallFolderChain(manifest.UpgradeCode, targetRootId, targetSegments, TreeFor(InstallRoot.InstallFolder), declaredFileElements));
        }

        // ADR 0033/0038: every other root only appears when something actually targets it -
        // unlike InstallFolder, there's no reason to declare an empty CommonFilesFolder/
        // SystemFolder/AppDataFolder/LocalAppDataFolder/ProgramFiles64Folder/etc.
        foreach (var installRoot in OptionalRoots)
        {
            var tree = TreeFor(installRoot);
            if (tree.Files.Count == 0 && tree.Children.Count == 0 && !explicitlyUsedRoots.Contains(installRoot))
            {
                continue;
            }

            var directoryId = StandardDirectoryId(installRoot);
            ChildrenFor(directoryId).AddRange(BuildDirectoryChildren(manifest.UpgradeCode, directoryId, tree, "", declaredFileElements));
        }

        var standardDirectories = rootOrder
            .Select(id => new XElement(Namespace + "StandardDirectory", new XAttribute("Id", id), rootChildren[id]))
            .ToList();

        AttachComRegistrations(manifest, declaredFileElements);

        var shortcutOnlyComponents = new List<XElement>();
        if (BuildProfileCleanupComponent(manifest.UpgradeCode, standardDirectories) is { } profileCleanup)
        {
            shortcutOnlyComponents.Add(profileCleanup);
        }

        var shortcutTargetProperties = new List<XElement>();
        var icons = AttachShortcuts(manifest, sourceRoot, generatedRoot ?? Path.Combine(sourceRoot, ".winrelease-generated"), declaredFileElements, shortcutOnlyComponents, shortcutTargetProperties);

        var arpProperties = BuildArpProperties(manifest.AppInfo);
        var (arpIcon, arpIconProperty) = BuildArpIcon(manifest, sourceRoot, generatedRoot ?? Path.Combine(sourceRoot, ".winrelease-generated"));
        if (arpIcon is not null)
        {
            icons.Add(arpIcon);
            arpProperties.Add(arpIconProperty!);
        }

        // Emitted only when actually used (same "no empty optional root" rule as the InstallRoot
        // pass above) - either as the flat preset (no subfolder) or, now, with real nested
        // <Directory> children when a Shortcut's Location sentinel put a Start Menu program group
        // (or, for parity, a Desktop/Startup subfolder - WiX itself has no restriction against it,
        // even though no real installer convention uses one) under it.
        foreach (var shellFolderId in ShellFolderStandardDirectoryIds)
        {
            var presetUsed = manifest.Shortcuts.Any(s => EffectiveShortcutLocation(s.Location) == shellFolderId);
            if (!presetUsed && !explicitlyUsedShellFolders.Contains(shellFolderId))
            {
                continue;
            }

            var children = BuildDirectoryChildren(manifest.UpgradeCode, shellFolderId, ShellFolderTreeFor(shellFolderId), "", declaredFileElements);
            standardDirectories.Add(new XElement(Namespace + "StandardDirectory", new XAttribute("Id", shellFolderId), children));
        }

        var registryComponents = BuildRegistryComponents(manifest);

        var environmentComponents = manifest.EnvironmentVariables
            .Select(entry => BuildEnvironmentComponent(manifest.UpgradeCode, entry))
            .ToList();

        var componentIds = standardDirectories
            .SelectMany(d => d.Descendants(Namespace + "Component"))
            .Select(c => c.Attribute("Id")!.Value)
            .Concat(registryComponents.Select(c => c.Attribute("Id")!.Value))
            .Concat(shortcutOnlyComponents.Select(c => c.Attribute("Id")!.Value))
            .Concat(environmentComponents.Select(c => c.Attribute("Id")!.Value));

        var package = new XElement(Namespace + "Package",
            new XAttribute("Name", manifest.Name),
            new XAttribute("Manufacturer", manifest.Manufacturer),
            new XAttribute("Version", manifest.ResolvedProductVersion),
            new XAttribute("UpgradeCode", manifest.UpgradeCode.ToString("B").ToUpperInvariant()),
            // ADR 0027: pinned rather than left to WiX's per-build auto-generation, so
            // WinRelease.Intune can compute the same ProductCode from the manifest alone.
            new XAttribute("ProductCode", ProductCode.For(manifest).ToString("B").ToUpperInvariant()),
            // ADR 0005 default (per-machine) still holds for a brand-new manifest, but
            // AppInfo.InstallScope now actually drives this - promoted from UI-only to functional
            // by the "Graceful Ingestion" pass, specifically so an imported per-user source's real
            // scope is preserved rather than silently forced per-machine. NOT also emitting an
            // explicit <Property Id="ALLUSERS" Value="1"/> for the per-machine case was a
            // deliberate correction, not an oversight: WiX v5 itself defines that Property symbol
            // internally from this Scope attribute during bind, so an explicit one collides with
            // it (confirmed against the real `wix build` CLI - WIX0091 "Duplicate Property with
            // identifier 'ALLUSERS' found", not assumed).
            new XAttribute("Scope", manifest.AppInfo.InstallScope == InstallScope.PerUser ? "perUser" : "perMachine"),
            // [ProductName] is a standard MSI property, resolved by the installer itself at
            // runtime from the Package/@Name above - not manually interpolated here, so the
            // message can never drift out of sync with whatever ProductName actually resolves to.
            new XElement(Namespace + "MajorUpgrade",
                new XAttribute("DowngradeErrorMessage", "A newer version of [ProductName] is already installed.")),
            // Always embed the cabinet - a single self-contained .msi with no external .cab
            // dependency to lose track of. See the "Always embed the cabinet" pass.
            new XElement(Namespace + "MediaTemplate", new XAttribute("EmbedCab", "yes"), new XAttribute("CompressionLevel", "high")),
            // ADR 0113: Summary Information Comments (SummaryInformation/@Comments; @Description is the Subject - checked in a built MSI).
            manifest.AppInfo.PackagedWithCredit ? new XElement(Namespace + "SummaryInformation", new XAttribute("Comments", SummaryComments(manifest.Name))) : null,
            arpProperties,
            // ADR 0053: curated install-behavior properties (REBOOT, MSIRESTARTMANAGERCONTROL, ...).
            manifest.Properties.Select(p => new XElement(Namespace + "Property", new XAttribute("Id", p.Id), new XAttribute("Value", p.Value))),
            shortcutTargetProperties,
            standardDirectories,
            icons,
            registryComponents,
            environmentComponents,
            shortcutOnlyComponents,
            new XElement(Namespace + "Feature", // auto-synthesized so manifest authors never define WiX Features
                new XAttribute("Id", "MainFeature"),
                new XAttribute("Title", "Default Feature"),
                new XAttribute("Level", "1"),
                componentIds.Select(id => new XElement(Namespace + "ComponentRef", new XAttribute("Id", id)))));

        // A package that delivers no files (registry values, environment variables, shortcuts to existing programs) would get no Media table
        // from MediaTemplate, and Windows Installer then fails the install with error 2607 ("Media table not found or empty"; verified with
        // wix 7.0.0 + msiexec). An explicit Media row fixes it and costs nothing.
        if (!package.Descendants(Namespace + "File").Any())
        {
            package.Element(Namespace + "MediaTemplate")?.ReplaceWith(new XElement(Namespace + "Media", new XAttribute("Id", "1")));
        }

        var wixRoot = new XElement(Namespace + "Wix", package);
        if (manifest.AppInfo.InstallWizard)
        {
            // ADR 0098: WiX's stock WixUI_InstallDir wizard, minus its licence page (the extension's licence text is a placeholder).
            // Welcome goes straight to the install-folder page and back; the later-ordered NewDialog wins over the stock one.
            wixRoot.Add(new XAttribute(XNamespace.Xmlns + "ui", UiNamespace.NamespaceName));
            package.Add(
                new XElement(Namespace + "Property", new XAttribute("Id", "WIXUI_INSTALLDIR"), new XAttribute("Value", "INSTALLFOLDER")),
                new XElement(UiNamespace + "WixUI", new XAttribute("Id", "WixUI_InstallDir")),
                new XElement(Namespace + "UI",
                    new XElement(Namespace + "Publish",
                        new XAttribute("Dialog", "WelcomeDlg"), new XAttribute("Control", "Next"), new XAttribute("Event", "NewDialog"),
                        new XAttribute("Value", "InstallDirDlg"), new XAttribute("Order", "4"), new XAttribute("Condition", "NOT Installed")),
                    new XElement(Namespace + "Publish",
                        new XAttribute("Dialog", "InstallDirDlg"), new XAttribute("Control", "Back"), new XAttribute("Event", "NewDialog"),
                        new XAttribute("Value", "WelcomeDlg"), new XAttribute("Order", "4"))));
        }

        // The Summary Information has its own code page and it must be an ANSI one (wix: WIX0349 for 65001). Left at 1252, a Japanese product name came
        // out as DEL characters in the file's Subject and Comments (found by the QA1 checks, 2026-10-29); use the first ANSI page that holds all the text.
        // With the credit off the Comments stay wix's own sentence, so the opt-out holds in the fallback below too.
        var commentsText = manifest.AppInfo.PackagedWithCredit ? SummaryComments(manifest.Name) : StandardComments(manifest.Name);
        var summaryTexts = new[] { manifest.Name, manifest.Manufacturer, commentsText };
        var summary = package.Element(Namespace + "SummaryInformation");
        void SetSummary(string attribute, string value)
        {
            summary ??= new XElement(Namespace + "SummaryInformation");
            summary.SetAttributeValue(attribute, value);
            if (summary.Parent is null)
            {
                package.Add(summary);
            }
        }

        if (SummaryCodepage(summaryTexts) is { } summaryCodepage)
        {
            SetSummary("Codepage", summaryCodepage.ToString());
        }
        else if (!FitsAnsi(summaryTexts))
        {
            // No single ANSI page holds the text (emoji, or Japanese mixed with Cyrillic): show what can be shown, with ? for the rest, instead of DEL characters.
            SetSummary("Description", AnsiSafe(manifest.Name));
            SetSummary("Manufacturer", AnsiSafe(manifest.Manufacturer));
            SetSummary("Comments", AnsiSafe(commentsText));
        }

        var document = new XDocument(wixRoot);
        NeutralisePreprocessor(document);
        if (!FitsWesternCodepage(document))
        {
            package.Add(new XAttribute("Codepage", "65001"));
        }
        return document;
    }

    /// <summary>
    /// WiX 7 writes the MSI in code page 1252 unless told otherwise, and fails the build (WIX0311) on any character 1252 lacks: Chinese,
    /// Greek, Cyrillic, emoji, even some typographic quotes (found by UAT 2026-10-28, verified with wix 7.0.0). Packages that fit keep
    /// 1252, so their MSIs stay byte-identical; anything else is written as UTF-8 (65001), which wix 7.0.0 builds cleanly.
    /// </summary>
    private static bool FitsWesternCodepage(XDocument document)
    {
        // .NET only ships UTF-8/UTF-16/Latin-1 by default; the Windows code pages come from this provider (part of the shared framework).
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var western = Encoding.GetEncoding(1252, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
        var values = document.Descendants().SelectMany(e => e.Attributes()).Where(a => !a.IsNamespaceDeclaration).Select(a => a.Value)
            .Concat(document.DescendantNodes().OfType<XText>().Select(t => t.Value));
        foreach (var value in values)
        {
            try
            {
                western.GetByteCount(value);
            }
            catch (EncoderFallbackException)
            {
                return false;
            }
        }

        return true;
    }

    private static string StandardDirectoryId(InstallRoot root) => root switch
    {
        InstallRoot.InstallFolder => "INSTALLFOLDER",
        InstallRoot.CommonFilesFolder => "CommonFilesFolder",
        InstallRoot.SystemFolder => "SystemFolder",
        InstallRoot.AppDataFolder => "AppDataFolder",
        InstallRoot.LocalAppDataFolder => "LocalAppDataFolder",
        InstallRoot.ProgramFiles64Folder => "ProgramFiles64Folder",
        InstallRoot.ProgramFilesFolder => "ProgramFilesFolder",
        InstallRoot.CommonFiles64Folder => "CommonFiles64Folder",
        InstallRoot.CommonAppDataFolder => "CommonAppDataFolder",
        InstallRoot.System64Folder => "System64Folder",
        _ => throw new ArgumentOutOfRangeException(nameof(root), root, "Unknown install root."),
    };

    /// <summary>
    /// Builds the Directory chain nesting INSTALLFOLDER at <paramref name="segments"/> deep under
    /// <paramref name="rootId"/>'s StandardDirectory - the product's own folder, wherever
    /// manifest.TargetDirectory points it. No subpath (a bare root token) puts INSTALLFOLDER
    /// directly at the root with <c>Name="."</c>, the standard WiX/MSI convention for "this
    /// directory has the same path as its parent." See ADR 0038.
    /// </summary>
    private static XElement BuildInstallFolderChain(
        Guid upgradeCode, string rootId, string[] segments, DirectoryNode installTree, Dictionary<string, XElement> declaredFileElements)
    {
        if (segments.Length == 0)
        {
            return new XElement(Namespace + "Directory",
                new XAttribute("Id", "INSTALLFOLDER"),
                new XAttribute("Name", "."),
                BuildDirectoryChildren(upgradeCode, "INSTALLFOLDER", installTree, "", declaredFileElements));
        }

        XElement BuildLevel(int index, string relativePath)
        {
            var segment = segments[index];
            var isLast = index == segments.Length - 1;
            var newRelativePath = relativePath.Length == 0 ? segment : $"{relativePath}/{segment}";

            return new XElement(Namespace + "Directory",
                new XAttribute("Id", isLast ? "INSTALLFOLDER" : DirectoryId(upgradeCode, rootId, newRelativePath)),
                new XAttribute("Name", segment),
                isLast
                    ? BuildDirectoryChildren(upgradeCode, "INSTALLFOLDER", installTree, "", declaredFileElements)
                    : new object[] { BuildLevel(index + 1, newRelativePath) });
        }

        return BuildLevel(0, "");
    }

    /// <summary>
    /// The WiX preprocessor expands <c>$(env.NAME)</c>, <c>$(sys.CURRENTDIR)</c>, <c>$(var.X)</c> and <c>!(loc.X)</c> inside any
    /// attribute value at *compile time on the build host*. Manifest text is untrusted: a product name of
    /// <c>$(env.USERNAME)</c> (or any secret in the host's environment) would be baked into the MSI the caller downloads
    /// (found by UAT T7). Every value is escaped (<see cref="WixPreprocessorText"/>: the whole <c>$</c>/<c>!</c> run is doubled, so
    /// <c>$$(env.X)</c> cannot become <c>$$$(env.X)</c>, which wix still expands) - so it is carried verbatim.
    /// </summary>
    private static void NeutralisePreprocessor(XDocument document)
    {
        foreach (var attribute in document.Descendants().SelectMany(e => e.Attributes()).Where(a => !a.IsNamespaceDeclaration))
        {
            attribute.Value = WixPreprocessorText.Escape(attribute.Value);
        }

        foreach (var text in document.DescendantNodes().OfType<XText>())
        {
            text.Value = WixPreprocessorText.Escape(text.Value);
        }
    }

    /// <summary>MSI's File/Component primary keys are 72 characters at most (ICE03).</summary>
    private const int MaxMsiIdentifierLength = 72;

    /// <summary>
    /// Settles each file's Component GUID seed and WiX Id (ADR 0084). Nothing that built before changes:
    /// a seed/Id is only altered where the old scheme could not have produced a valid package - a duplicate
    /// seed across harvest folders (duplicate File/Component Id, WIX0091), two seeds that sanitize to the same
    /// Id (<c>lib/a.dll</c> vs <c>lib_a.dll</c>), or an Id over MSI's 72-character key limit.
    /// </summary>
    private static List<(InstallRoot Root, string InstallPath, PlacedFile File)> AssignStableIds(List<(InstallRoot Root, string InstallPath, PlacedFile File)> pending)
    {
        var duplicateSeeds = pending.GroupBy(p => p.File.GuidSeed, StringComparer.Ordinal).Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet(StringComparer.Ordinal);

        // A harvested file whose relative path clashes keeps its identity from where it installs instead.
        var seeded = pending.Select(p => !p.File.IsDeclared && duplicateSeeds.Contains(p.File.GuidSeed)
            ? p with { File = p.File with { GuidSeed = $"{p.Root}:{p.InstallPath}" } }
            : p).ToList();

        var needsSuffix = seeded
            .GroupBy(p => WixId.Sanitize(p.File.GuidSeed), StringComparer.Ordinal)
            .Where(g => g.Count() > 1 || g.Key.Length > MaxMsiIdentifierLength)
            .SelectMany(g => g.Select(p => p.File.GuidSeed))
            .ToHashSet(StringComparer.Ordinal);

        return seeded.Select(p =>
        {
            var plain = WixId.Sanitize(p.File.GuidSeed);
            if (!needsSuffix.Contains(p.File.GuidSeed))
            {
                return p;
            }

            var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(p.File.GuidSeed)))[..8].ToLowerInvariant();
            var stem = plain.Length > MaxMsiIdentifierLength - 9 ? plain[..(MaxMsiIdentifierLength - 9)] : plain;
            return p with { File = p.File with { FileId = $"{stem}_{hash}" } };
        }).ToList();
    }

    private static void Place(DirectoryNode root, string installPath, PlacedFile file)
    {
        var segments = installPath.Split('/');
        var node = root;
        for (var i = 0; i < segments.Length - 1; i++)
        {
            if (!node.Children.TryGetValue(segments[i], out var child))
            {
                child = new DirectoryNode();
                node.Children[segments[i]] = child;
            }

            node = child;
        }

        node.Files.Add(file with { Name = segments[^1] });
    }

    private static IEnumerable<XElement> BuildDirectoryChildren(
        Guid upgradeCode, string rootId, DirectoryNode node, string relativePath, Dictionary<string, XElement> declaredFileElements)
    {
        foreach (var file in node.Files)
        {
            yield return BuildComponent(upgradeCode, file, declaredFileElements);
        }

        foreach (var (name, child) in node.Children)
        {
            var childPath = relativePath.Length == 0 ? name : $"{relativePath}/{name}";

            if (child.InstallTree is { } installTree)
            {
                yield return new XElement(Namespace + "Directory",
                    new XAttribute("Id", "INSTALLFOLDER"),
                    new XAttribute("Name", name),
                    BuildDirectoryChildren(upgradeCode, "INSTALLFOLDER", installTree, "", declaredFileElements));
                continue;
            }

            yield return new XElement(Namespace + "Directory",
                new XAttribute("Id", DirectoryId(upgradeCode, rootId, childPath)),
                new XAttribute("Name", name),
                BuildDirectoryChildren(upgradeCode, rootId, child, childPath, declaredFileElements));
        }
    }

    /// <summary>The per-user registry value a user-profile Component is keyed on (ICE38/ICE43 want HKCU, never the file or HKLM).</summary>
    private static XElement UserProfileKeyPath(Guid upgradeCode, string area, string componentId) =>
        new(Namespace + "RegistryValue",
            new XAttribute("Root", "HKCU"),
            new XAttribute("Key", $@"Software\WinRelease\{upgradeCode:N}\{area}"),
            new XAttribute("Name", componentId),
            new XAttribute("Value", "1"),
            new XAttribute("Type", "integer"),
            new XAttribute("KeyPath", "yes"));

    /// <summary>
    /// ICE64: every folder this package creates under AppData/LocalAppData (including an install folder that
    /// lives there) is listed for removal on uninstall, deepest first, in one always-installed Component keyed on
    /// an HKCU marker. RemoveFolder only deletes a folder that is empty, so a shared parent like
    /// <c>LocalAppData\Programs</c> is never harmed. Null when the package creates nothing under the profile.
    /// </summary>
    private static XElement? BuildProfileCleanupComponent(Guid upgradeCode, IEnumerable<XElement> standardDirectories)
    {
        var directoryIds = standardDirectories
            .Where(d => d.Attribute("Id")!.Value is "AppDataFolder" or "LocalAppDataFolder")
            .SelectMany(d => d.Descendants(Namespace + "Directory"))
            .Select(d => d.Attribute("Id")!.Value)
            .Reverse()
            .ToList();

        if (directoryIds.Count == 0)
        {
            return null;
        }

        var guid = Uuidv5.Generate(upgradeCode, "profile-cleanup");
        var id = "ProfileCleanup_" + guid.ToString("N");
        return new XElement(Namespace + "Component",
            new XAttribute("Id", id),
            new XAttribute("Directory", "INSTALLFOLDER"),
            new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
            RemoveFolders(id, directoryIds),
            UserProfileKeyPath(upgradeCode, "Cleanup", id));
    }

    private static XElement BuildComponent(Guid upgradeCode, PlacedFile file, Dictionary<string, XElement> declaredFileElements)
    {
        var guid = ComponentGuid.For(upgradeCode, file.GuidSeed);
        var wixId = file.FileId ?? WixId.Sanitize(file.GuidSeed);

        var fileElement = new XElement(Namespace + "File",
            new XAttribute("Id", wixId),
            new XAttribute("Source", file.SourcePath),
            new XAttribute("Name", file.Name),
            // Omitted (not "no") when unset - WiX's own default either way, nothing to say.
            // Verified against the real `wix` CLI that both attributes compile as expected.
            file.ReadOnly ? new XAttribute("ReadOnly", "yes") : null,
            file.Hidden ? new XAttribute("Hidden", "yes") : null);

        if (file.IsDeclared)
        {
            declaredFileElements[file.GuidSeed] = fileElement;
        }

        if (file.InUserProfile)
        {
            fileElement.Add(new XAttribute("KeyPath", "no"));
        }

        return new XElement(Namespace + "Component",
            new XAttribute("Id", wixId),
            new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
            file.Always32Bit ? new XAttribute("Bitness", "always32") : null,
            fileElement,
            file.InUserProfile ? UserProfileKeyPath(upgradeCode, "Files", wixId) : null);
    }

    /// <summary>
    /// Nests each COM class / type library inside its server file's own &lt;File&gt; (one file per Component,
    /// so the registration is created and removed with exactly that file - the WiX best practice, no
    /// regsvr32/SelfReg). Verified against wix 7.0.0 (ADR 0083): the elements are accepted in the core
    /// namespace and compile to Registry-table rows keyed to [#fileId].
    /// </summary>
    private static void AttachComRegistrations(WinReleaseManifest manifest, Dictionary<string, XElement> declaredFileElements)
    {
        foreach (var com in manifest.ComClasses)
        {
            if (!declaredFileElements.TryGetValue(com.FileId, out var fileElement))
            {
                continue; // Validate() already rejects an unknown fileId.
            }

            var classElement = new XElement(Namespace + "Class",
                new XAttribute("Id", com.ClassId.ToString("B").ToUpperInvariant()),
                new XAttribute("Context", com.Context.ToString()),
                com.ThreadingModel is { } model ? new XAttribute("ThreadingModel", model.ToString().ToLowerInvariant()) : null,
                com.Description is { Length: > 0 } description ? new XAttribute("Description", description) : null);

            if (com.ProgId is { Length: > 0 } progId)
            {
                var progIdElement = new XElement(Namespace + "ProgId",
                    new XAttribute("Id", progId),
                    com.Description is { Length: > 0 } progDescription ? new XAttribute("Description", progDescription) : null);

                if (com.VersionIndependentProgId is { Length: > 0 } independent)
                {
                    // Nested ProgId = the version-independent one; WiX writes its CurVer pointing at the parent.
                    progIdElement.Add(new XElement(Namespace + "ProgId",
                        new XAttribute("Id", independent),
                        com.Description is { Length: > 0 } independentDescription ? new XAttribute("Description", independentDescription) : null));
                }

                classElement.Add(progIdElement);
            }

            fileElement.Add(classElement);
        }

        foreach (var typeLib in manifest.ComTypeLibs)
        {
            if (!declaredFileElements.TryGetValue(typeLib.FileId, out var fileElement))
            {
                continue;
            }

            fileElement.Add(new XElement(Namespace + "TypeLib",
                new XAttribute("Id", typeLib.TypeLibId.ToString("B").ToUpperInvariant()),
                typeLib.Description is { Length: > 0 } description ? new XAttribute("Description", description) : null,
                new XAttribute("Language", typeLib.Language),
                new XAttribute("MajorVersion", typeLib.MajorVersion),
                new XAttribute("MinorVersion", typeLib.MinorVersion)));
        }
    }

    /// <returns>Package-level &lt;Icon&gt; elements for any Shortcut with an IconPath - one per shortcut, referenced by the Shortcut's Icon attribute.</returns>
    /// <param name="shortcutOnlyComponents">
    /// Populated with one synthetic &lt;Component&gt; per TargetPath-based Shortcut (ADR 0035) -
    /// unlike a file-based Shortcut, it isn't nested inside an existing declared File's Component,
    /// so it needs its own Component (and KeyPath) to be installed/removed at all.
    /// </param>
    private static List<XElement> AttachShortcuts(
        WinReleaseManifest manifest, string sourceRoot, string generatedRoot, Dictionary<string, XElement> declaredFileElements, List<XElement> shortcutOnlyComponents, List<XElement> shortcutTargetProperties)
    {
        var icons = new List<XElement>();
        // Every Id/Guid below is seeded from idSeed+directoryId alone - two shortcuts that
        // legitimately target the same file/path into the same location (e.g. two Start Menu
        // shortcuts to the same .exe with different Arguments) would otherwise collide (WIX0091,
        // a real build failure this caught) rather than just looking identical. The first
        // occurrence of a given seed keeps its exact pre-existing Id/Guid unchanged - only a
        // 2nd/3rd/... duplicate gets a disambiguating suffix, so a manifest that never hits this
        // collision builds byte-identical Component Guids to before (no surprise upgrade-tracking
        // change for the overwhelmingly common case).
        var seenSeeds = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (var shortcut in manifest.Shortcuts)
        {
            var directoryId = ResolveDirectoryReference(manifest.UpgradeCode, EffectiveShortcutLocation(shortcut.Location));

            // Validated by WinReleaseManifest.Validate(): exactly one of these is non-empty.
            var idSeed = shortcut.TargetFileId is { Length: > 0 } targetFileId ? targetFileId : shortcut.TargetPath!;

            var dedupeKey = $"{idSeed}:{directoryId}";
            var occurrence = seenSeeds.GetValueOrDefault(dedupeKey);
            seenSeeds[dedupeKey] = occurrence + 1;
            // Only ever used to seed an Id/Guid below - never as a real WiX value (the Target
            // attribute, set further down, always uses the real idSeed/TargetPath, not this).
            var uniqueSeed = occurrence == 0 ? idSeed : $"{idSeed}#{occurrence}";

            // Advertise="yes" and an explicit Target attribute are mutually exclusive (verified
            // against the real `wix` CLI - WIX0035): only a declared-file target ever omits Target
            // (WiX infers it from File nesting), so Advertise is forced off for anything else
            // regardless of what the manifest says - defensive, not just relying on
            // WinReleaseManifest.Validate() to have caught it upstream.
            // ICE19: an advertised shortcut needs the target Component's KeyPath to be a file - a file under the user profile is keyed on an
            // HKCU registry value instead (ICE38), so it can't be advertised; the shortcut is written as an ordinary one (found by UAT T8).
            var advertise = shortcut.Advertise && shortcut.TargetFileId is { Length: > 0 } advertiseTarget
                && declaredFileElements.TryGetValue(advertiseTarget, out var advertiseFile) && advertiseFile.Attribute("KeyPath")?.Value != "no";

            var shortcutElement = new XElement(Namespace + "Shortcut",
                new XAttribute("Id", WixId.Sanitize($"{uniqueSeed}_{directoryId}")),
                new XAttribute("Directory", directoryId),
                new XAttribute("Name", shortcut.Name),
                new XAttribute("WorkingDirectory", ResolveWorkingDirectoryId(manifest.UpgradeCode, shortcut.WorkingDirectory)),
                new XAttribute("Advertise", advertise ? "yes" : "no"));

            if (shortcut.WindowStyle != ShortcutWindowStyle.Normal)
            {
                shortcutElement.Add(new XAttribute("Show", shortcut.WindowStyle.ToString().ToLowerInvariant()));
            }

            if (shortcut.Arguments is { Length: > 0 } arguments)
            {
                shortcutElement.Add(new XAttribute("Arguments", arguments));
            }

            if (shortcut.Description is { Length: > 0 } description)
            {
                shortcutElement.Add(new XAttribute("Description", description));
            }

            if (shortcut.IconPath is { Length: > 0 } iconPath)
            {
                var iconId = "Icon_" + Uuidv5.Generate(manifest.UpgradeCode, $"icon:{uniqueSeed}:{directoryId}").ToString("N");
                icons.Add(new XElement(Namespace + "Icon",
                    new XAttribute("Id", iconId),
                    new XAttribute("SourceFile", IconSourceFile(sourceRoot, iconPath, generatedRoot))));
                shortcutElement.Add(new XAttribute("Icon", iconId));
            }

            if (shortcut.TargetFileId is { Length: > 0 } fileId && advertise)
            {
                // Advertised: nesting inside the File's own Component is how WiX infers the target (install-on-demand
                // through the feature), and ICE43 allows a file KeyPath for an advertised shortcut.
                var targetFile = declaredFileElements[fileId];
                targetFile.Add(shortcutElement);

                // ICE64: an advertised shortcut lives in the file's own Component, so that Component also cleans up the program-group
                // folder(s) the shortcut was placed in (the non-advertised ones do it in their own Component) - found by UAT T8.
                var owner = targetFile.Parent!;
                var ownerId = owner.Attribute("Id")!.Value;
                var existing = owner.Elements(Namespace + "RemoveFolder").Select(r => r.Attribute("Directory")!.Value).ToHashSet(StringComparer.Ordinal);
                foreach (var cleanup in RemoveFolders(ownerId, UserProfileCleanupFolders(manifest.UpgradeCode, EffectiveShortcutLocation(shortcut.Location)).Where(d => !existing.Contains(d))))
                {
                    owner.Add(cleanup);
                }
            }
            else if (shortcut.TargetFileId is { Length: > 0 } nonAdvertisedFileId)
            {
                // ADR 0085: a non-advertised shortcut in a user-profile folder must not live in the file's own
                // Component (ICE43/ICE57 - the KeyPath has to be a per-user registry value). It gets its own
                // Component keyed on an HKCU marker, pointing at the file with an explicit [#Id] target.
                shortcutElement.Add(new XAttribute("Target", $"[#{declaredFileElements[nonAdvertisedFileId].Attribute("Id")!.Value}]"));
                shortcutOnlyComponents.Add(BuildShortcutOnlyComponent(manifest.UpgradeCode, uniqueSeed, shortcut.Location, shortcutElement, UserProfileCleanupFolders(manifest.UpgradeCode, EffectiveShortcutLocation(shortcut.Location))));
            }
            else if (UrlShortcutFile.IsUrl(shortcut.TargetPath))
            {
                // ADR 0052: MSI's Shortcut table can't target a URL (CreateShortcuts silently skips it), so a
                // URL shortcut is a generated .url file installed into the location folder instead - not a
                // <Shortcut> at all. Description/Arguments/WorkingDirectory/Icon don't apply to a .url file.
                shortcutOnlyComponents.Add(BuildUrlShortcutComponent(manifest, shortcut, directoryId, generatedRoot, uniqueSeed, UserProfileCleanupFolders(manifest.UpgradeCode, EffectiveShortcutLocation(shortcut.Location))));
            }
            else
            {
                // ADR 0035: no declared File to nest inside (a URL, or a path inside a Harvest
                // Folder WiX can't know about until it scans the folder at build time) - the
                // Target is explicit, and the Shortcut needs its own Component to belong to.
                // idSeed == shortcut.TargetPath in this branch (validated non-empty by WinReleaseManifest.Validate()).
                // A literal path (C:\Tools\app.exe) can't be a Target as typed: MSI reads a Target with no square
                // brackets as a Feature name, finds none, and CreateShortcuts silently makes nothing (verified with wix 7.0.0 + msiexec: build
                // and install both succeed). A [Property] reference is formatted as a path, so the path goes into a private Property.
                var target = idSeed;
                if (ShortcutTarget.IsAbsolutePath(idSeed))
                {
                    var propertyId = ShortcutTarget.PropertyIdFor(manifest.UpgradeCode, idSeed);
                    if (shortcutTargetProperties.All(p => p.Attribute("Id")!.Value != propertyId))
                    {
                        shortcutTargetProperties.Add(new XElement(Namespace + "Property", new XAttribute("Id", propertyId), new XAttribute("Value", idSeed)));
                    }

                    target = $"[{propertyId}]";
                }

                shortcutElement.Add(new XAttribute("Target", target));
                shortcutOnlyComponents.Add(BuildShortcutOnlyComponent(manifest.UpgradeCode, uniqueSeed, shortcut.Location, shortcutElement, UserProfileCleanupFolders(manifest.UpgradeCode, EffectiveShortcutLocation(shortcut.Location))));
            }
        }

        return icons;
    }

    private static XElement BuildUrlShortcutComponent(WinReleaseManifest manifest, Shortcut shortcut, string directoryId, string generatedRoot, string uniqueSeed, IReadOnlyList<string> cleanupDirectories)
    {
        var target = shortcut.TargetPath!;
        // The physical .url file itself is already correctly deduped by target+location
        // (UrlShortcutFile.For()'s DistinctBy - two shortcuts to the same URL share one file, same
        // content either way), so GeneratedFileName below still uses the real target. Only the
        // Component/File wrapping it needs uniqueSeed - without it, two shortcuts sharing a target+
        // location would get two Components with the identical Id/Guid (WIX0091).
        var guid = Uuidv5.Generate(manifest.UpgradeCode, $"url-component:{uniqueSeed}:{shortcut.Location}");
        var wixId = "Url_" + guid.ToString("N");

        return new XElement(Namespace + "Component",
            new XAttribute("Id", wixId),
            new XAttribute("Directory", directoryId),
            new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
            new XElement(Namespace + "File",
                new XAttribute("Id", "UrlFile_" + guid.ToString("N")),
                new XAttribute("Source", Path.Combine(generatedRoot, UrlShortcutFile.GeneratedFileName(manifest.UpgradeCode, target, shortcut.Location))),
                new XAttribute("Name", shortcut.Name + ".url")),
            // A component installing into the user's profile (Desktop/Start Menu) needs a registry KeyPath
            // (ICE38/43), the same marker approach as the other shortcut-only components.
            RemoveFolders(wixId, cleanupDirectories),
            new XElement(Namespace + "RegistryValue",
                new XAttribute("Root", "HKCU"), // ICE38/ICE43: a user-profile component's KeyPath must be under HKCU, per-machine package or not
                new XAttribute("Key", $@"Software\WinRelease\{manifest.UpgradeCode:N}\Shortcuts"),
                new XAttribute("Name", wixId),
                new XAttribute("Value", "1"),
                new XAttribute("Type", "integer"),
                new XAttribute("KeyPath", "yes")));
    }

    private static XElement BuildShortcutOnlyComponent(Guid upgradeCode, string uniqueSeed, string location, XElement shortcutElement, IReadOnlyList<string> cleanupDirectories)
    {
        var guid = Uuidv5.Generate(upgradeCode, $"shortcut-only:{uniqueSeed}:{location}");
        var wixId = "ScC_" + guid.ToString("N");

        return new XElement(Namespace + "Component",
            new XAttribute("Id", wixId),
            new XAttribute("Directory", "INSTALLFOLDER"),
            new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
            // Every Component needs exactly one KeyPath; this one owns no File to use as its
            // KeyPath, so it gets a synthetic marker instead - HKLM for a per-machine package, HKCU for a
            // per-user one (ADR 0051: a non-elevated install can't write HKLM, Error 1406, verified).
            RemoveFolders(wixId, cleanupDirectories),
            new XElement(Namespace + "RegistryValue",
                new XAttribute("Root", "HKCU"), // ICE38/ICE43: see BuildUrlShortcutComponent
                new XAttribute("Key", $@"Software\WinRelease\{upgradeCode:N}\Shortcuts"),
                new XAttribute("Name", wixId),
                new XAttribute("Value", "1"),
                new XAttribute("Type", "integer"),
                new XAttribute("KeyPath", "yes")),
            shortcutElement);
    }

    /// <summary>
    /// ICE64: every directory a package creates under the user profile (a Start Menu program group, a
    /// subfolder of AppData/LocalAppData) must be removed on uninstall, or the empty folders are left behind.
    /// Returns the directory Ids from the first level under the profile root down to the Location's own
    /// folder (empty when Location is a bare shell folder or sits outside the profile).
    /// </summary>
    private static List<string> UserProfileCleanupFolders(Guid upgradeCode, string location)
    {
        var kind = TryParseDirectorySentinel(location, out var shellFolderId, out var installRoot, out var relativePath);
        string rootId;
        if (kind == DirectoryRootKind.ShellFolder)
        {
            rootId = shellFolderId;
        }
        else if (kind == DirectoryRootKind.InstallRoot && installRoot is InstallRoot.AppDataFolder or InstallRoot.LocalAppDataFolder)
        {
            rootId = StandardDirectoryId(installRoot);
        }
        else
        {
            return [];
        }

        var segments = relativePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return Enumerable.Range(1, segments.Length).Select(count => DirectoryId(upgradeCode, rootId, string.Join('/', segments.Take(count)))).ToList();
    }

    /// <summary>One RemoveFolder per directory, with an Id unique to the owning component (several components may clean up the same shared folder).</summary>
    private static IEnumerable<XElement> RemoveFolders(string componentId, IEnumerable<string> directoryIds) =>
        directoryIds.Select(directoryId => new XElement(Namespace + "RemoveFolder",
            new XAttribute("Id", "rm_" + Uuidv5.Generate(Guid.Empty, $"{componentId}:{directoryId}").ToString("N")),
            new XAttribute("Directory", directoryId),
            new XAttribute("On", "uninstall")));

    private const string DirectorySentinelPrefix = "wr:dir:";

    /// <summary>
    /// The real Windows shell shortcut folders, in emission order - not InstallRoots (nothing ever
    /// installs a regular file there), but still valid <c>wr:dir:{root}:{relativePath}</c> sentinel
    /// roots so a Shortcut's Location can nest into a named subfolder under one (a Start Menu
    /// "program group", the one real convention; the rest get the same subfolder capability for
    /// free since WiX itself draws no distinction, even though no real installer uses it for those).
    /// Keyed by the sentinel's lowercase root token, valued by the real WiX StandardDirectory Id -
    /// see <see cref="ShortcutLocation"/> for why these eight specifically.
    /// </summary>
    private static readonly Dictionary<string, string> ShellFolderSentinelRoots = new(StringComparer.Ordinal)
    {
        ["desktopFolder"] = ShortcutLocation.DesktopFolder,
        ["programMenuFolder"] = ShortcutLocation.ProgramMenuFolder,
        ["startupFolder"] = ShortcutLocation.StartupFolder,
        ["personalFolder"] = ShortcutLocation.PersonalFolder,
        ["favoritesFolder"] = ShortcutLocation.FavoritesFolder,
        ["fontsFolder"] = ShortcutLocation.FontsFolder,
        ["sendToFolder"] = ShortcutLocation.SendToFolder,
        ["templateFolder"] = ShortcutLocation.TemplateFolder,
    };

    private static readonly string[] ShellFolderStandardDirectoryIds =
    [
        ShortcutLocation.DesktopFolder,
        ShortcutLocation.ProgramMenuFolder,
        ShortcutLocation.StartupFolder,
        ShortcutLocation.PersonalFolder,
        ShortcutLocation.FavoritesFolder,
        ShortcutLocation.FontsFolder,
        ShortcutLocation.SendToFolder,
        ShortcutLocation.TemplateFolder,
    ];

    /// <summary>
    /// Location defaults to Start Menu when omitted/empty - same fallback WxsImporter.ResolveShortcutLocation
    /// uses for an imported shortcut with no resolvable Directory either. Also normalizes the three
    /// lowercase camelCase values ("desktopFolder" etc.) a manifest saved before Location became a free
    /// string would still have on disk - that was this enum's JSON wire format under the API's
    /// JsonStringEnumConverter(CamelCase), which no longer applies now that it's a plain string -
    /// without this, an already-saved project's shortcut would silently resolve to a nonexistent
    /// "desktopFolder" Directory Id (case-sensitive, not WiX's real "DesktopFolder") and fail `wix build`.
    /// </summary>
    private static string EffectiveShortcutLocation(string? raw) => raw switch
    {
        null or "" => ShortcutLocation.ProgramMenuFolder,
        "desktopFolder" => ShortcutLocation.DesktopFolder,
        "programMenuFolder" => ShortcutLocation.ProgramMenuFolder,
        "startupFolder" => ShortcutLocation.StartupFolder,
        _ => raw,
    };

    /// <summary>One of the three shell folders (Desktop/Start Menu/Startup) vs. a regular InstallRoot - which kind of root a parsed sentinel resolved to.</summary>
    private enum DirectoryRootKind { None, ShellFolder, InstallRoot }

    /// <summary>
    /// Splits the Packaging Console's <c>wr:dir:{root}:{relativePath}</c> sentinel (ADR 0033/0035)
    /// into its root/relativePath - shared by <see cref="ResolveDirectoryReference"/> (resolving it
    /// to a real Directory Id) and the Generate()-time pass that ensures that Directory actually gets
    /// emitted. <paramref name="root"/> is the token's root token itself (<c>"installFolder"</c>,
    /// <c>"programMenuFolder"</c>, ...); the caller reads <paramref name="shellFolderId"/> or
    /// <paramref name="installRoot"/> depending on which <see cref="DirectoryRootKind"/> comes back.
    /// Returns <see cref="DirectoryRootKind.None"/> for anything that isn't the sentinel form (a
    /// literal WiX Directory Id, null, or empty) - the caller treats that as a pass-through literal.
    /// </summary>
    private static DirectoryRootKind TryParseDirectorySentinel(string? raw, out string shellFolderId, out InstallRoot installRoot, out string relativePath)
    {
        shellFolderId = "";
        installRoot = InstallRoot.InstallFolder;
        relativePath = "";
        if (string.IsNullOrEmpty(raw) || !raw.StartsWith(DirectorySentinelPrefix, StringComparison.Ordinal))
        {
            return DirectoryRootKind.None;
        }

        var rest = raw[DirectorySentinelPrefix.Length..];
        var separatorIndex = rest.IndexOf(':');
        if (separatorIndex < 0)
        {
            return DirectoryRootKind.None; // malformed sentinel - caller falls through and treats it as a literal
        }

        var rootToken = rest[..separatorIndex];
        // The Console writes '/', but a hand-typed path may use a backslash - treat both as separators, never as part of a folder name.
        relativePath = rest[(separatorIndex + 1)..].Replace('\\', '/').Trim('/');

        if (ShellFolderSentinelRoots.TryGetValue(rootToken, out var standardDirectoryId))
        {
            shellFolderId = standardDirectoryId;
            return DirectoryRootKind.ShellFolder;
        }

        installRoot = ParseInstallRootToken(rootToken);
        return DirectoryRootKind.InstallRoot;
    }

    /// <summary>
    /// Resolves a Shortcut's Location or WorkingDirectory to a real WiX Directory Id: a literal
    /// Directory Id the manifest author typed by hand (including the three <see cref="ShortcutLocation"/>
    /// shell-folder constants) is passed through unchanged, while the Console's <c>wr:dir:</c> sentinel
    /// is resolved via the exact same <see cref="DirectoryId"/> hash <see cref="BuildDirectoryChildren"/>
    /// gives that real folder - so the Console never has to duplicate that hashing itself. Either way
    /// this is a convenience default, never enforced: nothing stops a hand-typed Id that doesn't
    /// resolve to anything real, same as always.
    /// </summary>
    private static string ResolveDirectoryReference(Guid upgradeCode, string raw)
    {
        var kind = TryParseDirectorySentinel(raw, out var shellFolderId, out var installRoot, out var relativePath);
        return kind switch
        {
            DirectoryRootKind.ShellFolder => relativePath.Length == 0 ? shellFolderId : DirectoryId(upgradeCode, shellFolderId, relativePath),
            DirectoryRootKind.InstallRoot => relativePath.Length == 0 ? StandardDirectoryId(installRoot) : DirectoryId(upgradeCode, StandardDirectoryId(installRoot), relativePath),
            _ => raw,
        };
    }

    private static string ResolveWorkingDirectoryId(Guid upgradeCode, string? raw) =>
        string.IsNullOrEmpty(raw) ? "INSTALLFOLDER" : ResolveDirectoryReference(upgradeCode, raw);

    /// <summary>
    /// Ensures a <c>wr:dir:</c>-sentinel directory reference actually gets emitted in the compiled
    /// tree, even when nothing else (no declared file, no harvest folder) ever places anything
    /// there - e.g. a Shortcut's Location pointing at AppDataFolder in a project with no AppData
    /// files at all, or a Start Menu program-group subfolder nothing else ever touches. A bare root
    /// (no subpath) just needs <paramref name="explicitlyUsedRoots"/>/<paramref name="explicitlyUsedShellFolders"/>
    /// so the emission passes in Generate() know to emit its StandardDirectory even though its tree
    /// is otherwise empty; a subpath additionally needs the real Directory chain built so
    /// BuildDirectoryChildren emits a matching &lt;Directory&gt; for it. A literal (non-sentinel)
    /// reference is left alone - that includes the three shell-folder constants used bare (no
    /// subfolder), which Generate() already emits unconditionally based on the preset check.
    /// </summary>
    private static void TouchDirectoryReference(
        Func<InstallRoot, DirectoryNode> treeFor, Func<string, DirectoryNode> shellFolderTreeFor, HashSet<InstallRoot> explicitlyUsedRoots, HashSet<string> explicitlyUsedShellFolders, string? raw)
    {
        var kind = TryParseDirectorySentinel(raw, out var shellFolderId, out var installRoot, out var relativePath);
        DirectoryNode node;
        switch (kind)
        {
            case DirectoryRootKind.ShellFolder:
                explicitlyUsedShellFolders.Add(shellFolderId);
                if (relativePath.Length == 0) return;
                node = shellFolderTreeFor(shellFolderId);
                break;
            case DirectoryRootKind.InstallRoot:
                explicitlyUsedRoots.Add(installRoot);
                if (relativePath.Length == 0) return;
                node = treeFor(installRoot);
                break;
            default:
                return;
        }

        foreach (var segment in relativePath.Split('/'))
        {
            if (!node.Children.TryGetValue(segment, out var child))
            {
                child = new DirectoryNode();
                node.Children[segment] = child;
            }

            node = child;
        }
    }

    private static InstallRoot ParseInstallRootToken(string token) => token switch
    {
        "installFolder" => InstallRoot.InstallFolder,
        "commonFilesFolder" => InstallRoot.CommonFilesFolder,
        "systemFolder" => InstallRoot.SystemFolder,
        "appDataFolder" => InstallRoot.AppDataFolder,
        "localAppDataFolder" => InstallRoot.LocalAppDataFolder,
        "programFiles64Folder" => InstallRoot.ProgramFiles64Folder,
        "programFilesFolder" => InstallRoot.ProgramFilesFolder,
        "commonFiles64Folder" => InstallRoot.CommonFiles64Folder,
        "commonAppDataFolder" => InstallRoot.CommonAppDataFolder,
        "system64Folder" => InstallRoot.System64Folder,
        _ => InstallRoot.InstallFolder, // unrecognized token - fall back to the always-present root
    };

    /// <summary>
    /// Add/Remove Programs properties (ADR 0039) - standard MSI properties, emitted only when the
    /// corresponding AppInfo field is actually set/enabled rather than as always-present empty
    /// values (an empty ARPHELPLINK etc. is meaningfully different from an absent one to MSI).
    /// </summary>
    private static List<XElement> BuildArpProperties(AppInfo appInfo)
    {
        var properties = new List<XElement>();

        void AddIfSet(string id, string? value)
        {
            if (!string.IsNullOrEmpty(value))
            {
                properties.Add(new XElement(Namespace + "Property", new XAttribute("Id", id), new XAttribute("Value", value)));
            }
        }

        void AddFlag(string id, bool enabled)
        {
            if (enabled)
            {
                properties.Add(new XElement(Namespace + "Property", new XAttribute("Id", id), new XAttribute("Value", "1")));
            }
        }

        AddIfSet("ARPHELPLINK", appInfo.SupportUrl);
        AddIfSet("ARPURLUPDATEINFO", appInfo.UpdateUrl);
        AddIfSet("ARPURLINFOABOUT", appInfo.AboutUrl);
        AddIfSet("ARPHELPTELEPHONE", appInfo.SupportPhone);
        AddIfSet("ARPCONTACT", appInfo.Contact);
        AddIfSet("ARPCOMMENTS", !string.IsNullOrWhiteSpace(appInfo.Comments) ? appInfo.Comments : appInfo.PackagedWithCredit ? CreditText() : null);
        // The WixUI_InstallDir wizard (ADR 0098) defines ARPNOMODIFY=1 itself - it has no Modify page - so a second row fails the build with
        // WIX0091 (found by UAT T5-16 2026-10-28, verified with wix 7.0.0). With the wizard on, Modify is already hidden either way.
        AddFlag("ARPNOMODIFY", appInfo.DisableModify && !appInfo.InstallWizard);
        AddFlag("ARPNOREPAIR", appInfo.DisableRepair);
        AddFlag("ARPNOREMOVE", appInfo.DisableRemove);
        AddFlag("ARPSYSTEMCOMPONENT", appInfo.HideFromControlPanel);

        return properties;
    }

    /// <summary>The file wix reads an icon from: a program's icon pulled out into a small .ico (ADR 0112), otherwise the file as it is.</summary>
    private static string IconSourceFile(string sourceRoot, string relativePath, string generatedRoot)
    {
        var full = Path.Combine(sourceRoot, relativePath);
        return IconFiles.PrepareSource(full, generatedRoot) ?? full;
    }

    /// <summary>
    /// Resolves the Add/Remove Programs entry's icon (ARPPRODUCTICON), if any. AppInfo.AutoExtractIcon takes the first declared .exe that really has
    /// an icon (ADR 0112: only that icon goes into the MSI, as a small .ico). Falls back to AppInfo.IconPath (an explicit .ico or program) when
    /// AutoExtractIcon is off. Returns (null, null) when neither resolves to anything - ARPPRODUCTICON is simply omitted, not a build error.
    /// </summary>
    private static (XElement? Icon, XElement? Property) BuildArpIcon(WinReleaseManifest manifest, string sourceRoot, string generatedRoot)
    {
        var appInfo = manifest.AppInfo;

        // ADR 0112: auto-extract takes the first declared .exe that really has an icon (a program without one is skipped, not an empty icon).
        var iconSourcePath = appInfo.AutoExtractIcon
            ? manifest.Files.Declared
                .Where(f => f.SourcePath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                .Select(f => f.SourcePath)
                .FirstOrDefault(p => IconFiles.PrepareSource(Path.Combine(sourceRoot, p), generatedRoot) is not null)
            : appInfo.IconPath is { Length: > 0 } explicitIconPath ? explicitIconPath : null;

        if (iconSourcePath is null)
        {
            return (null, null);
        }

        var iconId = "ArpIcon_" + Uuidv5.Generate(manifest.UpgradeCode, $"arp-icon:{iconSourcePath}").ToString("N");
        var icon = new XElement(Namespace + "Icon",
            new XAttribute("Id", iconId),
            new XAttribute("SourceFile", IconSourceFile(sourceRoot, iconSourcePath, generatedRoot)));
        var property = new XElement(Namespace + "Property", new XAttribute("Id", "ARPPRODUCTICON"), new XAttribute("Value", iconId));

        return (icon, property);
    }

    /// <summary>
    /// ADR 0092: registry values are grouped one Component per hive+key (Microsoft's usual unit for related registry data), not one
    /// per value. The first value written to a key is the Component's KeyPath; later values in the same key join it without one.
    /// Remove actions keep their own marker-keyed Components. Order follows the manifest (a group sits where its first value was).
    /// </summary>
    private static List<XElement> BuildRegistryComponents(WinReleaseManifest manifest)
    {
        var components = new List<XElement>();
        var groups = new Dictionary<string, XElement>(StringComparer.OrdinalIgnoreCase);
        foreach (var authored in manifest.Registry)
        {
            var (entry, always32) = RegistryView(authored, manifest.Architecture);
            if (entry.Action != RegistryEntryAction.Write)
            {
                components.Add(BuildRegistryComponent(manifest.UpgradeCode, authored.Key, entry, always32, manifest.AppInfo.InstallScope));
                continue;
            }

            var groupKey = $"{entry.Root}|{always32}|{entry.Key}";
            if (groups.TryGetValue(groupKey, out var existing))
            {
                existing.Add(RegistryValueElement(entry, keyPath: false));
                continue;
            }

            var component = BuildRegistryComponent(manifest.UpgradeCode, authored.Key, entry, always32, manifest.AppInfo.InstallScope);
            groups[groupKey] = component;
            components.Add(component);
        }

        return components;
    }

    /// <summary>
    /// ADR 0108: an entry that names the 32-bit registry view through WOW6432Node (see <see cref="Wow6432Redirect"/> for exactly where) is built
    /// without that segment and, in a 64-bit package, in an always32 Component, which lands in the same place through the redirector. A 32-bit
    /// package's Components are 32-bit already. Every other key is left exactly as typed.
    /// </summary>
    private static (RegistryEntry Entry, bool Always32) RegistryView(RegistryEntry entry, PackageArchitecture architecture) =>
        Wow6432Redirect.TryResolve(entry.Root, entry.Key, out var resolvedKey)
            ? (entry with { Key = resolvedKey }, architecture != PackageArchitecture.X86)
            : (entry, false);

    private static XElement RegistryValueElement(RegistryEntry entry, bool keyPath) =>
        new(Namespace + "RegistryValue",
            new XAttribute("Root", RegistryRootAttribute(entry.Root)),
            new XAttribute("Key", entry.Key),
            // WiX rejects an empty Name attribute outright (WIX0006) - the key's
            // default value (RegistryEntry.Name == "") means omitting it entirely.
            entry.Name.Length > 0 ? new XAttribute("Name", entry.Name) : null,
            // MultiString is documented as newline-separated; MSI separates the strings with [~], so a raw newline
            // would be stored as ONE string with embedded line breaks (found by UAT T4). [~] typed directly still works.
            new XAttribute("Value", entry.ValueType == RegistryValueType.MultiString ? entry.Value.ReplaceLineEndings("[~]") : entry.Value),
            new XAttribute("Type", RegistryValueTypeAttribute(entry.ValueType)),
            keyPath ? new XAttribute("KeyPath", "yes") : null);

    /// <summary>
    /// Write (ADR 0033's original, only behavior) authors the value directly, KeyPath'd on itself -
    /// unchanged. RemoveValue/RemoveKey clean up registry content this product doesn't own (not the
    /// values it writes itself - those are already removed on uninstall by the Windows Installer
    /// engine with no extra authoring needed): verified against the real `wix` CLI that
    /// RemoveRegistryValue/RemoveRegistryKey can't serve as a Component's own KeyPath, so both get
    /// the same synthetic-marker trick BuildShortcutOnlyComponent already uses, scope-aware (HKCU
    /// for a per-user install - ADR 0051, a non-elevated install can't write HKLM) since the marker
    /// is independent of whichever root the actual removal targets.
    /// </summary>
    private static XElement BuildRegistryComponent(Guid upgradeCode, string authoredKey, RegistryEntry entry, bool always32, InstallScope scope)
    {
        // A Write entry's Component is shared by every value written to the same hive+key (ADR 0092), so its identity is the key,
        // not the value name; RemoveValue/RemoveKey entries each stay their own Component. The key as authored (WOW6432Node and all), so
        // the GUID tells the 32-bit and 64-bit copies of a key apart and matches what earlier builds produced.
        var seed = entry.Action == RegistryEntryAction.Write
            ? $"registry:write-key:{entry.Root}:{authoredKey.ToLowerInvariant()}"
            : $"registry:{entry.Action}:{entry.Root}:{authoredKey}:{entry.Name}";
        var bitness = always32 ? new XAttribute("Bitness", "always32") : null;
        var guid = Uuidv5.Generate(upgradeCode, seed);
        var wixId = "Reg_" + guid.ToString("N");

        XElement action = entry.Action switch
        {
            RegistryEntryAction.RemoveValue => new XElement(Namespace + "RemoveRegistryValue",
                new XAttribute("Root", RegistryRootAttribute(entry.Root)),
                new XAttribute("Key", entry.Key),
                entry.Name.Length > 0 ? new XAttribute("Name", entry.Name) : null),
            RegistryEntryAction.RemoveKey => new XElement(Namespace + "RemoveRegistryKey",
                new XAttribute("Root", RegistryRootAttribute(entry.Root)),
                new XAttribute("Key", entry.Key),
                // Required, no default - verified against the real `wix` CLI (WIX0010/WIX0021):
                // exactly these two values, never a bare "remove".
                new XAttribute("Action", entry.RemoveOnUninstall ? "removeOnUninstall" : "removeOnInstall")),
            _ => RegistryValueElement(entry, keyPath: true),
        };

        if (entry.Action == RegistryEntryAction.Write)
        {
            return new XElement(Namespace + "Component",
                new XAttribute("Id", wixId),
                new XAttribute("Directory", "TARGETDIR") /* registry-only: not under the user profile, so per-user packages pass ICE38 (ADR 0086) */,
                new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
                bitness,
                action);
        }

        // RemoveValue/RemoveKey don't carry their own KeyPath - same synthetic-marker component
        // shape BuildShortcutOnlyComponent already uses for a Component with nothing else to key on.
        return new XElement(Namespace + "Component",
            new XAttribute("Id", wixId),
            new XAttribute("Directory", "TARGETDIR") /* registry-only: not under the user profile, so per-user packages pass ICE38 (ADR 0086) */,
            new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
            bitness,
            new XElement(Namespace + "RegistryValue",
                new XAttribute("Root", scope == InstallScope.PerUser ? "HKCU" : "HKLM"),
                new XAttribute("Key", $@"Software\WinRelease\{upgradeCode:N}\RegistryActions"),
                new XAttribute("Name", wixId),
                new XAttribute("Value", "1"),
                new XAttribute("Type", "integer"),
                new XAttribute("KeyPath", "yes")),
            action);
    }

    /// <summary>
    /// ADR 0077. Environment has no KeyPath attribute at all (verified against the real `wix` CLI -
    /// WIX0004 "unexpected attribute" the moment one's added) - every entry gets the same
    /// synthetic-marker RegistryValue trick BuildRegistryComponent's RemoveValue/RemoveKey branch
    /// already uses, scoped to the entry's own System flag (HKLM marker for a System variable, HKCU
    /// otherwise) rather than manifest.AppInfo.InstallScope - System is already per-entry here, so
    /// there's no reason to tie the marker to a separate, possibly-mismatched install-wide setting.
    /// </summary>
    private static XElement BuildEnvironmentComponent(Guid upgradeCode, EnvironmentVariableEntry entry)
    {
        // Mirrors BuildRegistryComponent's seed shape: every field that distinguishes one real
        // Environment entry from another (not Value/Part/Permanent/Separator, which two
        // legitimately-different entries for the same Name+System+Action would never differ on in
        // practice) - so two entries that really are duplicates collide loudly (WIX0091) instead of
        // silently overwriting one another's generated Id.
        var seed = $"environment:{entry.Action}:{entry.System}:{entry.Name}";
        var guid = Uuidv5.Generate(upgradeCode, seed);
        var wixId = "Env_" + guid.ToString("N");

        return new XElement(Namespace + "Component",
            new XAttribute("Id", wixId),
            new XAttribute("Directory", "INSTALLFOLDER"),
            new XAttribute("Guid", guid.ToString("B").ToUpperInvariant()),
            new XElement(Namespace + "RegistryValue",
                new XAttribute("Root", entry.System ? "HKLM" : "HKCU"),
                new XAttribute("Key", $@"Software\WinRelease\{upgradeCode:N}\EnvironmentActions"),
                new XAttribute("Name", wixId),
                new XAttribute("Value", "1"),
                new XAttribute("Type", "integer"),
                new XAttribute("KeyPath", "yes")),
            new XElement(Namespace + "Environment",
                new XAttribute("Id", wixId),
                new XAttribute("Name", entry.Name),
                // Verified against the real `wix` CLI (WIX0006): an explicit empty-string Value is
                // rejected outright - same "omit entirely, don't write Value=''" rule RegistryEntry's
                // empty Name already follows. Action=Remove is the one case this is commonly empty
                // (nothing to write, just delete the variable).
                entry.Value.Length > 0 ? new XAttribute("Value", entry.Value) : null,
                new XAttribute("Action", EnvironmentActionAttribute(entry.Action)),
                // Verified against the real `wix` CLI (WIX0035): Part can't be specified at all
                // alongside Action="create" (Set/Remove both allow it) - omitted entirely rather
                // than ever writing Part="all" (our own default) for a Create entry.
                entry.Action != EnvironmentVariableAction.Create ? new XAttribute("Part", EnvironmentPartAttribute(entry.Part)) : null,
                new XAttribute("Permanent", entry.Permanent ? "yes" : "no"),
                new XAttribute("System", entry.System ? "yes" : "no"),
                new XAttribute("Separator", entry.Separator)));
    }

    private static string EnvironmentActionAttribute(EnvironmentVariableAction action) => action switch
    {
        EnvironmentVariableAction.Set => "set",
        EnvironmentVariableAction.Create => "create",
        EnvironmentVariableAction.Remove => "remove",
        _ => throw new ArgumentOutOfRangeException(nameof(action), action, "Unknown environment variable action."),
    };

    private static string EnvironmentPartAttribute(EnvironmentVariablePart part) => part switch
    {
        EnvironmentVariablePart.All => "all",
        EnvironmentVariablePart.First => "first",
        EnvironmentVariablePart.Last => "last",
        _ => throw new ArgumentOutOfRangeException(nameof(part), part, "Unknown environment variable part."),
    };

    private static string RegistryRootAttribute(RegistryRoot root) => root switch
    {
        RegistryRoot.Hklm => "HKLM",
        RegistryRoot.Hkcu => "HKCU",
        RegistryRoot.Hkcr => "HKCR",
        RegistryRoot.Hku => "HKU",
        _ => throw new ArgumentOutOfRangeException(nameof(root), root, "Unknown registry root."),
    };

    private static string RegistryValueTypeAttribute(RegistryValueType valueType) => valueType switch
    {
        RegistryValueType.String => "string",
        RegistryValueType.ExpandString => "expandable",
        RegistryValueType.Integer => "integer",
        RegistryValueType.MultiString => "multiString",
        RegistryValueType.Binary => "binary",
        _ => throw new ArgumentOutOfRangeException(nameof(valueType), valueType, "Unknown registry value type."),
    };

    private static string DirectoryId(Guid upgradeCode, string rootId, string relativePath)
    {
        // ADR 0033: seeded with the owning root too, not just the relative path -
        // two different roots sharing a subfolder name (e.g. both have a
        // "config/" folder) would otherwise collide on the same WiX Id.
        var guid = Uuidv5.Generate(upgradeCode, $"directory:{rootId}:{relativePath}");
        return "dir_" + guid.ToString("N");
    }

    private sealed record PlacedFile(string SourcePath, string GuidSeed, bool IsDeclared, string Name = "", bool ReadOnly = false, bool Hidden = false, string? FileId = null, bool Always32Bit = false, bool InUserProfile = false);

    private sealed class DirectoryNode
    {
        public List<PlacedFile> Files { get; } = [];
        public Dictionary<string, DirectoryNode> Children { get; } = [];

        /// <summary>Set on the node that IS the product folder (INSTALLFOLDER) when it sits inside a standard folder's tree (ADR 0090).</summary>
        public DirectoryNode? InstallTree { get; set; }
    }

    /// <summary>Moves everything under <paramref name="source"/> into <paramref name="destination"/>, merging folders of the same name.</summary>
    private static void MergeInto(DirectoryNode destination, DirectoryNode source)
    {
        destination.Files.AddRange(source.Files);
        foreach (var (name, child) in source.Children)
        {
            if (destination.Children.TryGetValue(name, out var existing))
            {
                MergeInto(existing, child);
            }
            else
            {
                destination.Children[name] = child;
            }
        }
    }
}
