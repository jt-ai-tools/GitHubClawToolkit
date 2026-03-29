import { getAssistantConfigFromEnv } from '../../domain/shared/assistant-core.js';
import {
  optionalString,
  parseDefaultGitHub,
  requireString,
} from './source-rules.js';

const DEFAULT_GH_API_BASE_URL = 'https://api.github.com';
const DEFAULT_LINE_API_BASE_URL = 'https://api.line.me';
const DEFAULT_LINE_DATA_API_BASE_URL = 'https://api-data.line.me';
const LINE_WEBHOOK_PATH = '/line/webhook';
const GH_API_VERSION = '2022-11-28';
const USER_AGENT = 'GitHubClawDev-LineWorker/0.1.0';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function createAssistantConfig(env) {
  return getAssistantConfigFromEnv(env, {
    utcOffsetKey: 'LINE_ASSISTANT_UTC_OFFSET',
    defaultReplyTextKey: 'LINE_DEFAULT_REPLY_MESSAGE',
    defaultUtcOffsetMinutes: 8 * 60,
  });
}

function getOptionalConfig(env, key, fallback) {
  return optionalString(env, key) || fallback;
}

function parseOptionalPositiveInteger(env, keys, createError) {
  const candidateKeys = Array.isArray(keys) ? keys : [keys];

  for (const key of candidateKeys) {
    const rawValue = optionalString(env, key);
    if (!rawValue) {
      continue;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw createError(
        `Invalid environment variable: ${key} must be a positive integer.`,
      );
    }

    return parsedValue;
  }

  return null;
}

export function getConfig(env) {
  const createError = (message) => new ConfigError(message);
  const defaultGithub = parseDefaultGitHub(env, { createError });

  if (!defaultGithub) {
    throw createError(
      'GH_OWNER and GH_REPO are required for LineWorker.',
    );
  }

  const targetIssueNumber = parseOptionalPositiveInteger(
    env,
    'ISSUE_NUMBER',
    createError,
  );
  const workerName = optionalString(env, 'LINE_WORKER_NAME');

  return {
    github: {
      owner: defaultGithub.owner,
      repo: defaultGithub.repo,
      repoFullName: defaultGithub.repoFullName,
      token: requireString(env, 'GH_TOKEN', { createError }),
      apiBaseUrl: getOptionalConfig(
        env,
        'GH_API_BASE_URL',
        DEFAULT_GH_API_BASE_URL,
      ),
      apiVersion: getOptionalConfig(
        env,
        'GH_API_VERSION',
        GH_API_VERSION,
      ),
      userAgent: getOptionalConfig(env, 'USER_AGENT', USER_AGENT),
    },
    line: {
      channelSecret: requireString(env, 'LINE_CHANNEL_SECRET', { createError }),
      channelAccessToken: requireString(env, 'LINE_CHANNEL_ACCESS_TOKEN', {
        createError,
      }),
      apiBaseUrl: getOptionalConfig(
        env,
        'LINE_API_BASE_URL',
        DEFAULT_LINE_API_BASE_URL,
      ),
      dataApiBaseUrl: getOptionalConfig(
        env,
        'LINE_DATA_API_BASE_URL',
        DEFAULT_LINE_DATA_API_BASE_URL,
      ),
      webhookPath: getOptionalConfig(env, 'LINE_WEBHOOK_PATH', LINE_WEBHOOK_PATH),
      issueBindingMode: targetIssueNumber ? 'fixed' : 'dynamic-by-source',
      targetIssueNumber,
      targetIssueUrl: targetIssueNumber
        ? `https://github.com/${defaultGithub.owner}/${defaultGithub.repo}/issues/${targetIssueNumber}`
        : null,
      workerName,
    },
    assistant: createAssistantConfig(env),
  };
}
