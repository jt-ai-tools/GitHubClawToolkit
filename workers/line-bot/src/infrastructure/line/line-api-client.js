const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function buildLineSignature(secret, bodyText) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(bodyText),
  );
  return bytesToBase64(new Uint8Array(signature));
}

export async function isValidLineSignature(request, bodyText, config) {
  const actual = request.headers.get('x-line-signature');

  if (typeof actual !== 'string' || actual.trim() === '') {
    return false;
  }

  const expected = await buildLineSignature(config.channelSecret, bodyText);
  return actual === expected;
}

async function lineJsonRequest(config, urlPath) {
  const response = await fetch(`${config.apiBaseUrl}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${config.channelAccessToken}`,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message || `LINE API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function linePostJsonRequest(config, urlPath, payload) {
  const response = await fetch(`${config.apiBaseUrl}${urlPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message || `LINE API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function lineDataUrl(config, messageId, suffix = '') {
  return `${config.dataApiBaseUrl}/v2/bot/message/${messageId}${suffix}`;
}

function parseContentDispositionFileName(headerValue) {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') {
    return null;
  }

  const utf8Match = headerValue.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim() || null;
    } catch {
      return utf8Match[1].trim() || null;
    }
  }

  const quotedMatch = headerValue.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim() || null;
  }

  const plainMatch = headerValue.match(/filename\s*=\s*([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim() || null;
  }

  return null;
}

async function lineBinaryRequest(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      message ||
        `LINE content API request failed with status ${response.status}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    arrayBuffer,
    contentType:
      response.headers.get('content-type') || 'application/octet-stream',
    contentLength:
      Number.parseInt(response.headers.get('content-length') || '', 10) ||
      arrayBuffer.byteLength,
    fileName: parseContentDispositionFileName(
      response.headers.get('content-disposition'),
    ),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function getLineProfile(config, sourceInfo) {
  if (!sourceInfo?.userId) {
    return null;
  }

  if (sourceInfo.type === 'group' && sourceInfo.groupId) {
    return lineJsonRequest(
      config,
      `/v2/bot/group/${encodeURIComponent(sourceInfo.groupId)}/member/${encodeURIComponent(sourceInfo.userId)}`,
    );
  }

  if (sourceInfo.type === 'room' && sourceInfo.roomId) {
    return lineJsonRequest(
      config,
      `/v2/bot/room/${encodeURIComponent(sourceInfo.roomId)}/member/${encodeURIComponent(sourceInfo.userId)}`,
    );
  }

  return lineJsonRequest(
    config,
    `/v2/bot/profile/${encodeURIComponent(sourceInfo.userId)}`,
  );
}

export async function getLineSourceSummary(config, sourceInfo) {
  if (sourceInfo?.type === 'group' && sourceInfo.groupId) {
    return lineJsonRequest(
      config,
      `/v2/bot/group/${encodeURIComponent(sourceInfo.groupId)}/summary`,
    );
  }

  if (sourceInfo?.type === 'user' && sourceInfo.userId) {
    return getLineProfile(config, sourceInfo);
  }

  return null;
}

async function waitForMediaReady(
  config,
  messageId,
  maxAttempts = 6,
  delayMs = 500,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(
      lineDataUrl(
        config,
        encodeURIComponent(messageId),
        '/content/transcoding',
      ),
      {
        headers: {
          Authorization: `Bearer ${config.channelAccessToken}`,
        },
      },
    );

    const status = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        status?.message ||
        `LINE transcoding API request failed with status ${response.status}`;
      throw new Error(message);
    }

    if (status?.status === 'succeeded') {
      return;
    }

    if (status?.status === 'failed') {
      throw new Error(`LINE media transcoding failed for message ${messageId}`);
    }

    await sleep(delayMs);
  }

  throw new Error(`LINE media transcoding timed out for message ${messageId}`);
}

export async function getLineMessageContent(config, event) {
  if (event?.type !== 'message') {
    return null;
  }

  const messageType = event.message?.type;
  if (!['image', 'audio', 'video', 'file'].includes(messageType)) {
    return null;
  }

  const messageId = event.message?.id;
  if (typeof messageId !== 'string' || messageId.trim() === '') {
    return null;
  }

  if (messageType === 'audio' || messageType === 'video') {
    await waitForMediaReady(config, messageId);
  }

  const contentProvider = event.message?.contentProvider;
  if (
    contentProvider?.type === 'external' &&
    typeof contentProvider.originalContentUrl === 'string' &&
    contentProvider.originalContentUrl.trim() !== ''
  ) {
    const externalResponse = await fetch(contentProvider.originalContentUrl);
    if (!externalResponse.ok) {
      throw new Error(
        `External content fetch failed with status ${externalResponse.status}`,
      );
    }

    const arrayBuffer = await externalResponse.arrayBuffer();
    return {
      arrayBuffer,
      contentType:
        externalResponse.headers.get('content-type') ||
        'application/octet-stream',
      contentLength:
        Number.parseInt(
          externalResponse.headers.get('content-length') || '',
          10,
        ) || arrayBuffer.byteLength,
      fileName:
        event.message?.fileName ||
        parseContentDispositionFileName(
          externalResponse.headers.get('content-disposition'),
        ) ||
        null,
    };
  }

  const content = await lineBinaryRequest(
    lineDataUrl(config, messageId, '/content'),
    config.channelAccessToken,
  );

  return {
    ...content,
    fileName: event.message?.fileName || content.fileName || null,
  };
}

export function canReplyToLineEvent(event) {
  return (
    typeof event?.replyToken === 'string' &&
    event.replyToken.trim() !== '' &&
    event.replyToken !== '00000000000000000000000000000000'
  );
}

export async function replyLineTextMessage(config, replyToken, text) {
  return linePostJsonRequest(config, '/v2/bot/message/reply', {
    replyToken,
    messages: [
      {
        type: 'text',
        text,
      },
    ],
  });
}

export function getLineEvents(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray(payload.events)
  ) {
    return [];
  }

  return payload.events.filter(Boolean);
}
