using WinRelease.Core.Domain;

namespace WinRelease.Core.Persistence;

public interface IAccountRepository
{
    Task<Account?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task SaveAsync(Account account, CancellationToken cancellationToken = default);
}
