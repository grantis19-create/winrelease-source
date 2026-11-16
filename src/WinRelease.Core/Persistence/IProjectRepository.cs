using WinRelease.Core.Domain;

namespace WinRelease.Core.Persistence;

public interface IProjectRepository
{
    Task<Project?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Project>> ListByAccountAsync(Guid accountId, CancellationToken cancellationToken = default);

    Task SaveAsync(Project project, CancellationToken cancellationToken = default);

    /// <returns>False if no Project with that Id existed - a no-op, not an error.</returns>
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
