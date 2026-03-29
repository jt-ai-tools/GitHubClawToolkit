function stripMatchingQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1).trim();
  }

  return value;
}

export function requireString(
  env,
  key,
  { createError = (message) => new Error(message) } = {},
) {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw createError(`Missing required environment variable: ${key}`);
  }

  return stripMatchingQuotes(value.trim());
}

export function optionalString(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  return stripMatchingQuotes(value.trim());
}

export function parseDefaultGitHub(
  env,
  { createError = (message) => new Error(message) } = {},
) {
  const owner = optionalString(env, 'GITHUB_OWNER');
  const repo = optionalString(env, 'GITHUB_REPO');

  if ((owner && !repo) || (!owner && repo)) {
    throw createError(
      'GITHUB_OWNER and GITHUB_REPO must be provided together.',
    );
  }

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo,
    repoFullName: `${owner}/${repo}`,
  };
}
