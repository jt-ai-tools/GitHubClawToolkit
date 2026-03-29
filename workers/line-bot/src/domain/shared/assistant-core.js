const DEFAULT_UTC_OFFSET_MINUTES = 8 * 60;

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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function collapseWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  return stripMatchingQuotes(value.trim());
}

export function parseUtcOffsetMinutes(value, defaultOffsetMinutes = DEFAULT_UTC_OFFSET_MINUTES) {
  if (typeof value !== 'string' || value.trim() === '') {
    return defaultOffsetMinutes;
  }

  const match = value.trim().match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return defaultOffsetMinutes;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);

  return sign * ((hours * 60) + minutes);
}

export function getAssistantConfigFromEnv(env, options = {}) {
  const {
    utcOffsetKey,
    defaultReplyTextKey,
    defaultUtcOffsetMinutes = DEFAULT_UTC_OFFSET_MINUTES,
  } = options;

  return {
    utcOffsetMinutes: parseUtcOffsetMinutes(env[utcOffsetKey], defaultUtcOffsetMinutes),
    defaultReplyText: normalizeOptionalText(
      defaultReplyTextKey ? env[defaultReplyTextKey] : null,
    ),
  };
}
