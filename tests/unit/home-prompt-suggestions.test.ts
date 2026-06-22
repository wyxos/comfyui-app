import { describe, expect, it } from 'vitest'

import { parsePromptSuggestionDocuments } from '../../server/prompt-assistant/parser.mjs'

function suggestionPrompts(pack: ReturnType<typeof parsePromptSuggestionDocuments>) {
  return pack.suggestions.map((suggestion) => suggestion.prompt)
}

describe('prompt suggestion parser', () => {
  it('imports SAA-style character CSV and helper-tag JSON as a dynamic suggestion pack', () => {
    const pack = parsePromptSuggestionDocuments([
      {
        name: 'wai_characters.csv',
        text: [
          '初音未来,hatsune miku',
          '2B（尼尔：机械纪元）,2b (nier automata)',
        ].join('\n'),
      },
      {
        name: 'wai_tag_assist.json',
        text: JSON.stringify({
          'hatsune miku': 'twintails, turquoise hair',
          '2b (nier automata)': ['white hair', 'black blindfold'],
        }),
      },
    ], '2026-06-21T00:00:00.000Z')

    expect(pack.sourceNames).toEqual(['wai_characters.csv', 'wai_tag_assist.json'])
    expect(pack.suggestions).toEqual([
      {
        id: 'character-hatsune-miku',
        kind: 'character',
        label: '初音未来',
        prompt: 'hatsune miku',
        aliases: ['初音未来'],
        category: 'Character',
        targetSections: ['subject'],
        helperTags: ['twintails', 'turquoise hair'],
      },
      {
        id: 'character-2b-nier-automata',
        kind: 'character',
        label: '2B（尼尔：机械纪元）',
        prompt: '2b (nier automata)',
        aliases: ['2B（尼尔：机械纪元）'],
        category: 'Character',
        targetSections: ['subject'],
        helperTags: ['white hair', 'black blindfold'],
      },
    ])
    expect(pack.importedAt).toBe('2026-06-21T00:00:00.000Z')
  })

  it('merges SAA character helpers across underscore and space prompt keys', () => {
    const pack = parsePromptSuggestionDocuments([
      {
        name: 'wai_characters.csv',
        text: '红月华莲（反逆的鲁路修）,kouzuki kallen',
      },
      {
        name: 'wai_tag_assist.json',
        text: JSON.stringify({ kouzuki_kallen: 'red hair, code geass' }),
      },
      {
        name: 'danbooru_e621_merged_zh_cn.csv',
        text: 'kouzuki_kallen,4,皇月卡莲',
      },
    ], '2026-06-21T00:00:00.000Z')

    expect(pack.suggestions).toHaveLength(1)
    expect(pack.suggestions[0]).toMatchObject({
      kind: 'character',
      label: '红月华莲（反逆的鲁路修）',
      prompt: 'kouzuki kallen',
      helperTags: ['red hair', 'code geass'],
      aliases: expect.arrayContaining(['kouzuki kallen', '皇月卡莲']),
    })
  })

  it('imports first-class prompt suggestion JSON without inventing defaults', () => {
    const pack = parsePromptSuggestionDocuments([
      {
        name: 'prompt-suggestions.json',
        text: JSON.stringify([
          {
            id: 'style-pixel-art',
            kind: 'tag',
            label: 'Pixel art',
            prompt: 'pixel art',
            aliases: ['pixelated'],
            category: 'Style',
            targetSections: ['style'],
          },
        ]),
      },
    ])

    expect(pack.suggestions).toHaveLength(1)
    expect(pack.suggestions[0]).toMatchObject({
      id: 'style-pixel-art',
      prompt: 'pixel art',
      targetSections: ['style'],
    })
  })

  it('keeps generated IDs unique when duplicate suffixes collide', () => {
    const pack = parsePromptSuggestionDocuments([
      {
        name: 'colliding-ids.json',
        text: JSON.stringify([
          {
            id: 'tag-collision',
            kind: 'tag',
            label: 'Collision',
            prompt: 'collision',
            targetSections: ['others'],
          },
          {
            id: 'tag-collision',
            kind: 'tag',
            label: 'Collision duplicate',
            prompt: 'collision duplicate',
            targetSections: ['others'],
          },
          {
            id: 'tag-collision-2',
            kind: 'tag',
            label: 'Collision numbered',
            prompt: 'collision numbered',
            targetSections: ['others'],
          },
        ]),
      },
    ])

    expect(pack.suggestions.map((suggestion) => suggestion.id)).toEqual([
      'tag-collision',
      'tag-collision-2',
      'tag-collision-2-2',
    ])
  })

  it('imports SAA tagcomplete CSV groups as section-aware tag suggestions', () => {
    const pack = parsePromptSuggestionDocuments([
      {
        name: 'danbooru_e621_merged_zh_cn.csv',
        text: [
          '1girl,0,1个女孩',
          'blue_eyes,0,蓝眼睛',
          'outdoors,0,户外',
          'highres,5,高分辨率',
          'ciloranko,1,ciloranko',
          'blue_archive,3,蔚蓝档案',
          'hatsune_miku,4,初音未来',
          'wolf,12,狼',
        ].join('\n'),
      },
    ], '2026-06-21T00:00:00.000Z')

    expect(pack.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ prompt: '1girl', category: 'General', targetSections: ['subject'] }),
      expect.objectContaining({ prompt: 'blue_eyes', category: 'General', targetSections: ['details'] }),
      expect.objectContaining({ prompt: 'outdoors', category: 'General', targetSections: ['environment'] }),
      expect.objectContaining({ prompt: 'highres', category: 'Meta', targetSections: ['quality'] }),
      expect.objectContaining({ prompt: 'ciloranko', category: 'Artist', targetSections: ['style'] }),
      expect.objectContaining({ prompt: 'hatsune_miku', category: 'Character', targetSections: ['subject'] }),
      expect.objectContaining({ prompt: 'wolf', category: 'Species', targetSections: ['subject', 'details'] }),
    ]))
  })

  it('imports SAA view tags as curated section suggestions', () => {
    const pack = parsePromptSuggestionDocuments([
      {
        name: 'view_tags.json',
        text: JSON.stringify({
          background: ['simple background', 'white background, simple background'],
          style: ['pixel art, pixelated'],
          camera: ['cinematic angle'],
        }),
      },
    ])

    expect(suggestionPrompts(pack)).toEqual([
      'simple background',
      'white background, simple background',
      'pixel art, pixelated',
      'cinematic angle',
    ])
    expect(pack.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ prompt: 'simple background', category: 'Background', targetSections: ['environment'] }),
      expect.objectContaining({ prompt: 'pixel art, pixelated', category: 'Style', targetSections: ['style'] }),
      expect.objectContaining({ prompt: 'cinematic angle', category: 'Camera', targetSections: ['details'] }),
    ]))
  })
})
