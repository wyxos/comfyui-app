// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { applyPromptTextWeightStep } from '../../src/views/home/homePromptTextWeight'

describe('home prompt text weighting', () => {
  it('wraps selected text with an increased prompt weight', () => {
    expect(applyPromptTextWeightStep({
      text: 'blue hair, red eyes',
      selectionStart: 0,
      selectionEnd: 9,
      direction: 1,
    })).toEqual({
      text: '(blue hair:1.1), red eyes',
      selectionStart: 1,
      selectionEnd: 10,
    })
  })

  it('steps existing selected prompt weights up and down', () => {
    expect(applyPromptTextWeightStep({
      text: '(blue hair:1.1), red eyes',
      selectionStart: 0,
      selectionEnd: 15,
      direction: 1,
    }).text).toBe('(blue hair:1.2), red eyes')

    expect(applyPromptTextWeightStep({
      text: '(blue hair:1.1), red eyes',
      selectionStart: 0,
      selectionEnd: 15,
      direction: -1,
    }).text).toBe('(blue hair:1), red eyes')
  })

  it('uses the current comma-delimited token when no text is selected', () => {
    expect(applyPromptTextWeightStep({
      text: 'blue hair, red eyes',
      selectionStart: 13,
      selectionEnd: 13,
      direction: -1,
    })).toEqual({
      text: 'blue hair, (red eyes:0.9)',
      selectionStart: 12,
      selectionEnd: 20,
    })
  })
})
