export function getSourceInfo(event) {
  const source = event?.source;

  if (!source || typeof source !== 'object') {
    return {
      type: 'unknown',
      id: null,
      key: 'unknown',
      groupId: null,
      roomId: null,
      userId: null,
    };
  }

  if (source.type === 'group') {
    return {
      type: 'group',
      id: source.groupId || null,
      key: source.groupId ? `group:${source.groupId}` : 'group',
      groupId: source.groupId || null,
      roomId: null,
      userId: source.userId || null,
    };
  }

  if (source.type === 'room') {
    return {
      type: 'room',
      id: source.roomId || null,
      key: source.roomId ? `room:${source.roomId}` : 'room',
      groupId: null,
      roomId: source.roomId || null,
      userId: source.userId || null,
    };
  }

  if (source.type === 'user') {
    return {
      type: 'user',
      id: source.userId || null,
      key: source.userId ? `user:${source.userId}` : 'user',
      groupId: null,
      roomId: null,
      userId: source.userId || null,
    };
  }

  return {
    type: source.type || 'unknown',
    id: null,
    key: source.type || 'unknown',
    groupId: null,
    roomId: null,
    userId: source.userId || null,
  };
}
