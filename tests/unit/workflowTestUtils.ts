export type WorkflowNode = {
  class_type?: string
  inputs?: Record<string, unknown>
}

export type WorkflowPrompt = Record<string, WorkflowNode>

export type WorkflowBody = {
  prompt?: WorkflowPrompt
}

export function workflowPromptFromBody(body: unknown): WorkflowPrompt {
  if (!body || typeof body !== 'object') {
    return {}
  }

  const prompt = (body as WorkflowBody).prompt
  return prompt && typeof prompt === 'object' ? prompt : {}
}

export function workflowNodesFromBody(body: unknown): WorkflowNode[] {
  return Object.values(workflowPromptFromBody(body))
}

export function workflowNodes(prompt: unknown): WorkflowNode[] {
  return prompt && typeof prompt === 'object'
    ? Object.values(prompt as WorkflowPrompt)
    : []
}

export function workflowEntries(prompt: unknown): Array<[string, WorkflowNode]> {
  return prompt && typeof prompt === 'object'
    ? Object.entries(prompt as WorkflowPrompt)
    : []
}
