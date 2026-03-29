const MAX_MESSAGE_TEXT_LENGTH = 5000;

function formatTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function buildLineMetaComment(event, sourceInfo) {
  const meta = {
    source: 'line',
    source_type: sourceInfo.type,
    source_key: sourceInfo.key,
    ...(sourceInfo.userId ? { user_id: sourceInfo.userId } : {}),
    ...(sourceInfo.groupId ? { group_id: sourceInfo.groupId } : {}),
    ...(sourceInfo.roomId ? { room_id: sourceInfo.roomId } : {}),
    ...(typeof event?.message?.id === 'string' ? { msg_id: event.message.id } : {}),
    ...(typeof event?.webhookEventId === 'string'
      ? { webhook_event_id: event.webhookEventId }
      : {}),
    ...(Number.isFinite(event?.timestamp) ? { ts: formatTimestamp(event.timestamp) } : {}),
    bootstrap: true,
  };

  return `<!-- line-meta: ${JSON.stringify(meta)} -->`;
}

function normalizeText(text, maxLength) {
  if (typeof text !== 'string') {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n[Truncated to ${maxLength} characters]`;
}

function quoteMarkdown(text) {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function formatByteSize(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const next = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) {
      continue;
    }

    next[key] =
      typeof child === 'object' && child !== null
        ? sanitizeObject(child)
        : child;
  }

  return next;
}

function buildEventSnapshot(event) {
  const snapshot = {
    type: event?.type || 'unknown',
    mode: event?.mode,
    webhookEventId: event?.webhookEventId,
    timestamp: event?.timestamp,
    deliveryContext: event?.deliveryContext,
    source: event?.source,
  };

  if (event?.type === 'message') {
    snapshot.message = sanitizeObject({
      id: event.message?.id,
      type: event.message?.type,
      text: normalizeText(event.message?.text, MAX_MESSAGE_TEXT_LENGTH),
      title: event.message?.title,
      address: event.message?.address,
      latitude: event.message?.latitude,
      longitude: event.message?.longitude,
      packageId: event.message?.packageId,
      stickerId: event.message?.stickerId,
      fileName: event.message?.fileName,
      fileSize: event.message?.fileSize,
      duration: event.message?.duration,
    });
  }

  if (event?.postback) {
    snapshot.postback = sanitizeObject(event.postback);
  }

  if (event?.join) {
    snapshot.join = sanitizeObject(event.join);
  }

  if (event?.follow !== undefined) {
    snapshot.follow = event.follow;
  }

  if (event?.memberJoined) {
    snapshot.memberJoined = sanitizeObject(event.memberJoined);
  }

  if (event?.memberLeft) {
    snapshot.memberLeft = sanitizeObject(event.memberLeft);
  }

  return sanitizeObject(snapshot);
}

function eventHeadline(event) {
  if (event?.type === 'message') {
    return `LINE ${event.message?.type || 'unknown'} message`;
  }

  if (typeof event?.type === 'string' && event.type.trim() !== '') {
    return `LINE ${event.type} event`;
  }

  return 'LINE event';
}

function buildMetadataLines(event, sourceInfo, context) {
  return [
    context?.workerName ? `- Worker name: ${context.workerName}` : null,
    Number.isInteger(context?.workerIssueNumber)
      ? `- Worker issue: #${context.workerIssueNumber}${context?.workerIssueUrl ? ` (${context.workerIssueUrl})` : ''}`
      : null,
    context?.senderName ? `- Sender: ${context.senderName}` : null,
    `- LINE origin: ${sourceInfo.key}`,
    `- Source key: ${sourceInfo.key}`,
    `- Source type: ${sourceInfo.type}`,
    `- Event type: ${event?.type || 'unknown'}`,
    event?.message?.type ? `- Message type: ${event.message.type}` : null,
    sourceInfo.groupId ? `- Group ID: ${sourceInfo.groupId}` : null,
    sourceInfo.roomId ? `- Room ID: ${sourceInfo.roomId}` : null,
    sourceInfo.userId ? `- User ID: ${sourceInfo.userId}` : null,
    typeof event?.message?.id === 'string'
      ? `- Message ID: ${event.message.id}`
      : null,
    typeof event?.webhookEventId === 'string'
      ? `- Webhook event ID: ${event.webhookEventId}`
      : null,
    Number.isFinite(event?.timestamp)
      ? `- Received at: ${formatTimestamp(event.timestamp)}`
      : null,
  ].filter(Boolean);
}

function buildMediaLines(context) {
  if (!context?.mediaAsset && !context?.mediaError) {
    return [];
  }

  return [
    context?.mediaAsset?.fileName
      ? `- Stored file: [${context.mediaAsset.fileName}](${context.mediaAsset.rawUrl || context.mediaAsset.htmlUrl})`
      : null,
    context?.mediaAsset?.branch
      ? `- Issue branch: \`${context.mediaAsset.branch}\``
      : null,
    context?.mediaAsset?.path
      ? `- Repo path: \`${context.mediaAsset.path}\``
      : null,
    context?.mediaAsset?.htmlUrl
      ? `- GitHub file page: [view in repo](${context.mediaAsset.htmlUrl})`
      : null,
    context?.mediaAsset?.contentType
      ? `- Content type: ${context.mediaAsset.contentType}`
      : null,
    formatByteSize(context?.mediaAsset?.size)
      ? `- File size: ${formatByteSize(context.mediaAsset.size)}`
      : null,
    context?.mediaError ? `- Media storage error: ${context.mediaError}` : null,
  ].filter(Boolean);
}

function buildMediaPreviewLines(context) {
  if (!context?.mediaAsset?.rawUrl) {
    return [];
  }

  if (context.mediaAsset.isImage) {
    return [
      'Preview',
      '',
      `![${context.mediaAsset.fileName || 'image'}](${context.mediaAsset.rawUrl})`,
    ];
  }

  if (context.mediaAsset.isVideo) {
    return [
      'Preview',
      '',
      `<video src="${context.mediaAsset.rawUrl}" controls muted playsinline preload="metadata"></video>`,
    ];
  }

  return [];
}

function buildReadableEventBody(event, context) {
  if (event?.type === 'message' && event?.message?.type === 'text') {
    const text =
      normalizeText(event.message?.text, MAX_MESSAGE_TEXT_LENGTH) || '';
    return text.trim() === ''
      ? ['Text', '', '_Empty text message_']
      : ['Text', '', quoteMarkdown(text)];
  }

  if (
    event?.type === 'message' &&
    ['image', 'audio', 'video', 'file'].includes(event?.message?.type)
  ) {
    const previewLines = buildMediaPreviewLines(context);

    return [
      'Media',
      '',
      ...buildMediaLines(context),
      ...(previewLines.length > 0 ? ['', ...previewLines] : []),
    ];
  }

  if (event?.type === 'follow') {
    return ['Summary', '', '- The user followed this LINE Official Account.'];
  }

  if (event?.type === 'join') {
    return ['Summary', '', '- The bot joined a group or room.'];
  }

  return [];
}

function buildEventSection(event, context) {
  const snapshot = buildEventSnapshot(event);
  const readableBody = buildReadableEventBody(event, context);

  return [
    `### ${eventHeadline(event)}`,
    '',
    ...readableBody,
    ...(readableBody.length > 0 ? [''] : []),
    '<details>',
    '<summary>Raw event snapshot</summary>',
    '',
    '```json',
    JSON.stringify(snapshot, null, 2),
    '```',
    '',
    '</details>',
  ];
}

export function buildCommentBody(event, sourceInfo, context = {}) {
  const metadataLines = buildMetadataLines(event, sourceInfo, context);

  return [
    buildLineMetaComment(event, sourceInfo),
    '',
    `## ${eventHeadline(event)}`,
    '',
    ...metadataLines,
    '',
    ...buildEventSection(event, context),
  ].join('\n');
}
