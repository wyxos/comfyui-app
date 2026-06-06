import { sendJson } from '../http.mjs'
import { buildGenerationOptions } from '../generation-options.mjs'

export async function handleGenerationOptions(response) {
  return sendJson(response, 200, await buildGenerationOptions())
}
