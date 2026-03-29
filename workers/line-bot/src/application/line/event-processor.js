import {
  createIssue,
  createIssueComment,
  findIssueBySourceKey,
  uploadFileToRepo,
} from '../../infrastructure/github/line-github-service.js';
import {
  canReplyToLineEvent,
  getLineMessageContent,
  getLineProfile,
  getLineSourceSummary,
  replyLineTextMessage,
} from '../../infrastructure/line/line-api-client.js';
import {
  buildIssueArtifactScope,
  buildMediaFileName,
  isIgnoredEvent,
  isMediaMessageEvent,
} from '../../domain/line/media.js';
import { buildSourceIssueDefinition } from '../../domain/line/issue-binding.js';
import { getSourceInfo } from '../../domain/line/source.js';
import { buildCommentBody } from '../../domain/line/issue-formatter.js';

function buildIssueUrl(repo, issueNumber) {
  return `https://github.com/${repo.owner}/${repo.repo}/issues/${issueNumber}`;
}

async function resolveLineProfileSafe(config, sourceInfo) {
  try {
    return await getLineProfile(config.line, sourceInfo);
  } catch (error) {
    console.warn('Failed to resolve LINE sender profile', {
      sourceKey: sourceInfo.key,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function resolveLineSourceSummarySafe(config, sourceInfo) {
  try {
    return await getLineSourceSummary(config.line, sourceInfo);
  } catch (error) {
    console.warn('Failed to resolve LINE source summary', {
      sourceKey: sourceInfo.key,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function resolveSourceContext(config, sourceInfo) {
  if (sourceInfo.type === 'user') {
    const profile = await resolveLineProfileSafe(config, sourceInfo);
    const displayName = profile?.displayName || null;

    return {
      senderName: displayName,
      sourceDisplayName: displayName,
    };
  }

  const [profile, summary] = await Promise.all([
    resolveLineProfileSafe(config, sourceInfo),
    resolveLineSourceSummarySafe(config, sourceInfo),
  ]);

  return {
    senderName: profile?.displayName || null,
    sourceDisplayName:
      summary?.groupName ||
      summary?.roomName ||
      summary?.displayName ||
      null,
  };
}

async function resolveTargetIssue(config, repo, sourceInfo, sourceContext) {
  if (Number.isInteger(config.line.targetIssueNumber)) {
    return {
      issueNumber: config.line.targetIssueNumber,
      issueUrl:
        config.line.targetIssueUrl ||
        buildIssueUrl(repo, config.line.targetIssueNumber),
      issueState: 'fixed',
    };
  }

  const existingIssue = await findIssueBySourceKey(
    config.github,
    repo,
    sourceInfo.key,
  );

  if (existingIssue?.number) {
    return {
      issueNumber: existingIssue.number,
      issueUrl:
        existingIssue.html_url || buildIssueUrl(repo, existingIssue.number),
      issueState: 'existing',
    };
  }

  const issueDefinition = buildSourceIssueDefinition(sourceInfo, sourceContext);
  const createdIssue = await createIssue(config.github, repo, {
    title: issueDefinition.title,
    body: issueDefinition.body,
  });

  return {
    issueNumber: createdIssue.number,
    issueUrl: createdIssue.html_url || buildIssueUrl(repo, createdIssue.number),
    issueState: 'created',
  };
}

async function persistMediaMessage(config, repo, issueNumber, event) {
  if (!issueNumber || !isMediaMessageEvent(event)) {
    return {
      mediaAsset: null,
      mediaError: null,
    };
  }

  try {
    const mediaContent = await getLineMessageContent(config.line, event);
    if (!mediaContent) {
      return {
        mediaAsset: null,
        mediaError: null,
      };
    }

    const bytes = new Uint8Array(mediaContent.arrayBuffer);
    const artifactScope = buildIssueArtifactScope(config, issueNumber);
    const fileName = buildMediaFileName(event, mediaContent);
    const path = artifactScope.directory
      ? `${artifactScope.directory}/${fileName}`
      : fileName;
    const upload = await uploadFileToRepo(config.github, repo, {
      branch: artifactScope.branch,
      path,
      bytes,
      commitMessage:
        `Store LINE ${event.message?.type || 'media'} message ${event.message?.id || event.webhookEventId || ''}`.trim(),
    });

    return {
      mediaAsset: {
        fileName: mediaContent.fileName || fileName,
        branch: upload.branch,
        directory: artifactScope.directory,
        path: upload.path,
        htmlUrl: upload.htmlUrl,
        rawUrl: upload.rawUrl,
        downloadUrl: upload.downloadUrl,
        contentType: mediaContent.contentType,
        size: mediaContent.contentLength,
        isImage:
          typeof mediaContent.contentType === 'string' &&
          mediaContent.contentType.startsWith('image/'),
        isVideo:
          typeof mediaContent.contentType === 'string' &&
          mediaContent.contentType.startsWith('video/'),
      },
      mediaError: null,
    };
  } catch (error) {
    return {
      mediaAsset: null,
      mediaError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildEventContext(
  config,
  repo,
  event,
  issueBinding,
  senderName = null,
) {
  const mediaResult = await persistMediaMessage(
    config,
    repo,
    issueBinding.issueNumber,
    event,
  );

  return {
    senderName,
    mediaAsset: mediaResult.mediaAsset,
    mediaError: mediaResult.mediaError,
    workerName: config.line.workerName,
    workerIssueNumber: issueBinding.issueNumber,
    workerIssueUrl: issueBinding.issueUrl,
    workerIssueState: issueBinding.issueState,
  };
}

async function maybeReplyWithDefaultMessage(config, event) {
  if (!canReplyToLineEvent(event)) {
    return null;
  }

  const replyText = config.assistant.defaultReplyText || null;
  if (!replyText) {
    return null;
  }

  await replyLineTextMessage(config.line, event.replyToken, replyText);
  return replyText;
}

export async function processEvent(config, event) {
  const sourceInfo = getSourceInfo(event);
  const targetRepo = {
    owner: config.github.owner,
    repo: config.github.repo,
    repoFullName: config.github.repoFullName,
  };

  if (isIgnoredEvent(event)) {
    return { ignored: 'sticker-message' };
  }

  const sourceContext = await resolveSourceContext(config, sourceInfo);
  const issueBinding = await resolveTargetIssue(
    config,
    targetRepo,
    sourceInfo,
    sourceContext,
  );
  const eventContext = await buildEventContext(
    config,
    targetRepo,
    event,
    issueBinding,
    sourceContext.senderName,
  );

  await maybeReplyWithDefaultMessage(config, event);

  await createIssueComment(
    config.github,
    targetRepo,
    issueBinding.issueNumber,
    buildCommentBody(event, sourceInfo, eventContext),
  );

  return {
    commented: true,
    issueNumber: issueBinding.issueNumber,
    issueUrl: issueBinding.issueUrl,
    issueState: issueBinding.issueState,
  };
}
