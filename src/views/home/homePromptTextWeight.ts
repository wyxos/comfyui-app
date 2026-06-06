import { formatPromptWeight, stepPromptWeight } from './homeValueHelpers'

export type PromptTextWeightStepInput = {
  text: string
  selectionStart: number
  selectionEnd: number
  direction: 1 | -1
}

export type PromptTextWeightStepResult = {
  text: string
  selectionStart: number
  selectionEnd: number
}

const PROMPT_TOKEN_DELIMITER = /[,;\n]/
const WEIGHTED_PROMPT_PATTERN = /^\(([\s\S]+):([+-]?\d+(?:\.\d+)?)\)$/
const TRAILING_WEIGHT_PATTERN = /^:([+-]?\d+(?:\.\d+)?)\)/

function clampSelectionOffset(value: number, textLength: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(Math.max(Math.trunc(value), 0), textLength)
}

function trimSelectionRange(text: string, start: number, end: number) {
  let nextStart = start
  let nextEnd = end

  while (nextStart < nextEnd && /\s/.test(text[nextStart] ?? '')) {
    nextStart += 1
  }

  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1] ?? '')) {
    nextEnd -= 1
  }

  return { start: nextStart, end: nextEnd }
}

function expandCaretToPromptToken(text: string, offset: number) {
  let start = offset
  let end = offset

  while (start > 0 && !PROMPT_TOKEN_DELIMITER.test(text[start - 1] ?? '')) {
    start -= 1
  }

  while (end < text.length && !PROMPT_TOKEN_DELIMITER.test(text[end] ?? '')) {
    end += 1
  }

  return trimSelectionRange(text, start, end)
}

function replaceWeightedRange(
  source: string,
  rangeStart: number,
  rangeEnd: number,
  innerText: string,
  weight: number,
): PromptTextWeightStepResult {
  const formattedWeight = formatPromptWeight(weight)
  const replacement = `(${innerText}:${formattedWeight})`
  const text = source.slice(0, rangeStart) + replacement + source.slice(rangeEnd)
  const selectionStart = rangeStart + 1
  const selectionEnd = selectionStart + innerText.length

  return {
    text,
    selectionStart,
    selectionEnd,
  }
}

export function applyPromptTextWeightStep(input: PromptTextWeightStepInput): PromptTextWeightStepResult | null {
  const source = input.text
  const rawSelectionStart = clampSelectionOffset(input.selectionStart, source.length)
  const rawSelectionEnd = clampSelectionOffset(input.selectionEnd, source.length)
  const normalizedStart = Math.min(rawSelectionStart, rawSelectionEnd)
  const normalizedEnd = Math.max(rawSelectionStart, rawSelectionEnd)
  const range = normalizedStart === normalizedEnd
    ? expandCaretToPromptToken(source, normalizedStart)
    : trimSelectionRange(source, normalizedStart, normalizedEnd)

  if (range.start === range.end) {
    return null
  }

  const selectedText = source.slice(range.start, range.end)
  const fullyWrappedMatch = selectedText.match(WEIGHTED_PROMPT_PATTERN)
  if (fullyWrappedMatch) {
    const innerText = fullyWrappedMatch[1]
    const currentWeight = Number.parseFloat(fullyWrappedMatch[2])

    return replaceWeightedRange(
      source,
      range.start,
      range.end,
      innerText,
      stepPromptWeight(currentWeight, input.direction),
    )
  }

  const trailingWeightMatch =
    range.start > 0 && source[range.start - 1] === '('
      ? source.slice(range.end).match(TRAILING_WEIGHT_PATTERN)
      : null

  if (trailingWeightMatch) {
    const currentWeight = Number.parseFloat(trailingWeightMatch[1])
    return replaceWeightedRange(
      source,
      range.start - 1,
      range.end + trailingWeightMatch[0].length,
      selectedText,
      stepPromptWeight(currentWeight, input.direction),
    )
  }

  return replaceWeightedRange(
    source,
    range.start,
    range.end,
    selectedText,
    stepPromptWeight(1, input.direction),
  )
}
