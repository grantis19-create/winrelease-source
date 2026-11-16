using System.Text.Json;
using WinRelease.Core.Domain;

namespace WinRelease.Core.Persistence;

/// <summary>
/// One JSON file per Account under <c>{dataDirectory}/accounts/{id}.json</c>.
/// See ADR 0014 - flat files over standing up a database while there's no
/// real multi-tenant need yet.
/// </summary>
public sealed class JsonFileAccountRepository : IAccountRepository
{
    private readonly string _accountsDirectory;
    private readonly SemaphoreSlim _writeLock = new(1, 1);

    public JsonFileAccountRepository(string dataDirectory)
    {
        _accountsDirectory = Path.Combine(dataDirectory, "accounts");
        Directory.CreateDirectory(_accountsDirectory);
    }

    public async Task<Account?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var path = PathFor(id);
        if (!File.Exists(path))
        {
            return null;
        }

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<Account>(stream, PersistenceJson.Options, cancellationToken);
    }

    public async Task SaveAsync(Account account, CancellationToken cancellationToken = default)
    {
        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            var json = JsonSerializer.Serialize(account, PersistenceJson.Options);
            await File.WriteAllTextAsync(PathFor(account.Id), json, cancellationToken);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    private string PathFor(Guid id) => Path.Combine(_accountsDirectory, $"{id:D}.json");
}
