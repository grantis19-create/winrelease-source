using System.Text.Json;
using WinRelease.Core.Domain;

namespace WinRelease.Core.Persistence;

/// <summary>
/// One JSON file per Project under <c>{dataDirectory}/projects/{id}.json</c>.
/// See ADR 0014.
/// </summary>
public sealed class JsonFileProjectRepository : IProjectRepository
{
    private readonly string _projectsDirectory;
    private readonly SemaphoreSlim _writeLock = new(1, 1);

    public JsonFileProjectRepository(string dataDirectory)
    {
        _projectsDirectory = Path.Combine(dataDirectory, "projects");
        Directory.CreateDirectory(_projectsDirectory);
    }

    public async Task<Project?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var path = PathFor(id);
        if (!File.Exists(path))
        {
            return null;
        }

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<Project>(stream, PersistenceJson.Options, cancellationToken);
    }

    public async Task<IReadOnlyList<Project>> ListByAccountAsync(Guid accountId, CancellationToken cancellationToken = default)
    {
        var projects = new List<Project>();
        foreach (var path in Directory.EnumerateFiles(_projectsDirectory, "*.json"))
        {
            await using var stream = File.OpenRead(path);
            var project = await JsonSerializer.DeserializeAsync<Project>(stream, PersistenceJson.Options, cancellationToken);
            if (project is not null && project.AccountId == accountId)
            {
                projects.Add(project);
            }
        }

        return projects;
    }

    public async Task SaveAsync(Project project, CancellationToken cancellationToken = default)
    {
        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            var json = JsonSerializer.Serialize(project, PersistenceJson.Options);
            await File.WriteAllTextAsync(PathFor(project.Id), json, cancellationToken);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    public Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var path = PathFor(id);
        if (!File.Exists(path))
        {
            return Task.FromResult(false);
        }

        File.Delete(path);
        return Task.FromResult(true);
    }

    private string PathFor(Guid id) => Path.Combine(_projectsDirectory, $"{id:D}.json");
}
