const busyConversationIds = new Set<string>()

export function dropSession(conversationId: string): void {
  busyConversationIds.delete(conversationId)
}

export function isStreaming(conversationId: string): boolean {
  return busyConversationIds.has(conversationId)
}

export function markBusy(conversationId: string, busy: boolean): void {
  if (busy) busyConversationIds.add(conversationId)
  else busyConversationIds.delete(conversationId)
}

export function sdkReady(): boolean {
  return true
}
