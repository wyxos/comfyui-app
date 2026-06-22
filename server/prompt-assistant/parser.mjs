const TARGET_ALIASES = {
  background: 'environment',
  detail: 'details',
  details: 'details',
  environment: 'environment',
  light: 'lighting',
  lighting: 'lighting',
  negative: 'negative',
  negatives: 'negative',
  other: 'others',
  others: 'others',
  quality: 'quality',
  style: 'style',
  subject: 'subject',
  subjects: 'subject',
}

const TAG_GROUPS = {
  0: { category: 'General', kind: 'tag', targets: inferGeneralTargets },
  1: { category: 'Artist', kind: 'tag', targets: ['style'] },
  3: { category: 'Copyright', kind: 'tag', targets: ['subject'] },
  4: { category: 'Character', kind: 'character', targets: ['subject'] },
  5: { category: 'Meta', kind: 'tag', targets: inferMetaTargets },
  7: { category: 'General', kind: 'tag', targets: inferGeneralTargets },
  8: { category: 'Artist', kind: 'tag', targets: ['style'] },
  10: { category: 'Copyright', kind: 'tag', targets: ['subject'] },
  11: { category: 'Character', kind: 'character', targets: ['subject'] },
  12: { category: 'Species', kind: 'tag', targets: ['subject', 'details'] },
  14: { category: 'Meta', kind: 'tag', targets: inferMetaTargets },
  15: { category: 'Lore', kind: 'tag', targets: ['subject', 'details', 'others'] },
  255: { category: 'Wildcard', kind: 'tag', targets: ['others'] },
}

const VIEW_TAG_TARGETS = {
  angle: ['details'],
  background: ['environment'],
  camera: ['details'],
  style: ['style'],
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function normalizeKey(value) {
  return normalizeText(typeof value === 'string' ? value.replace(/_/g, ' ') : value).toLowerCase()
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean)
  }

  return normalizeText(value)
    .split(/[|;,]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function uniqueList(values) {
  const seen = new Set()
  return values.filter((value) => {
    const key = normalizeKey(value)
    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSuggestionId(kind, prompt) {
  return `${kind}-${slugify(prompt) || 'suggestion'}`
}

function humanizeTag(value) {
  return normalizeText(value.replace(/_/g, ' '))
}

function titleCase(value) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeTargetSections(value, fallback) {
  const targets = splitList(value)
    .map((target) => TARGET_ALIASES[target.toLowerCase()] ?? null)
    .filter(Boolean)

  return uniqueList(targets.length ? targets : fallback)
}

function inferFallbackTargets(kind, category, sourceName = '') {
  const normalizedCategory = category.toLowerCase()
  const normalizedSource = sourceName.toLowerCase()
  if (normalizedCategory.includes('negative') || normalizedSource.includes('negative')) {
    return ['negative']
  }

  return kind === 'character' ? ['subject'] : ['others']
}

function normalizeImportedSuggestion(draft, sourceName = '') {
  const prompt = normalizeText(draft?.prompt)
  if (!prompt) {
    return null
  }

  const kind = draft?.kind === 'character' ? 'character' : 'tag'
  const label = normalizeText(draft?.label) || prompt
  const category = normalizeText(draft?.category) || (kind === 'character' ? 'Character' : 'Tag')
  const aliases = uniqueList(splitList(draft?.aliases))
  const helperTags = uniqueList(splitList(draft?.helperTags))
  const targetSections = normalizeTargetSections(
    draft?.targetSections,
    inferFallbackTargets(kind, category, sourceName),
  )

  return {
    id: normalizeText(draft?.id) || buildSuggestionId(kind, prompt),
    kind,
    label,
    prompt,
    aliases,
    category,
    targetSections,
    ...(helperTags.length ? { helperTags } : {}),
  }
}

function parseCsvRows(text) {
  const rows = []
  let field = ''
  let row = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      row.push(field)
      if (row.some((cell) => normalizeText(cell))) {
        rows.push(row)
      }
      field = ''
      row = []
      continue
    }

    field += char
  }

  row.push(field)
  if (row.some((cell) => normalizeText(cell))) {
    rows.push(row)
  }

  return rows
}

function normalizeHeader(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function hasPromptSuggestionHeader(row) {
  const headers = new Set(row.map(normalizeHeader))
  return ['prompt', 'tag', 'label', 'name', 'targetsections', 'targets', 'helpertags', 'kind']
    .some((header) => headers.has(header))
}

function getRowValue(row, keys) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)]
    if (normalizeText(value)) {
      return value
    }
  }

  return ''
}

function inferGeneralTargets(prompt) {
  const tag = normalizeKey(prompt)
  if (/^\d+(girl|boy)s?$/.test(tag) || /(solo|focus|person|people|male|female)/.test(tag)) {
    return ['subject']
  }

  if (/(background|outdoor|indoor|sky|cloud|city|forest|beach|room|street|school|garden|landscape)/.test(tag)) {
    return ['environment']
  }

  if (/(eye|hair|face|hand|pose|clothes|dress|shirt|skirt|weapon|expression)/.test(tag)) {
    return ['details']
  }

  if (/(light|shadow|backlight|rim|glow|sunlight|moonlight)/.test(tag)) {
    return ['lighting']
  }

  if (/(style|medium|monochrome|greyscale|comic|pixel|realistic|photo|painting|anime|chibi)/.test(tag)) {
    return ['style']
  }

  if (/(highres|absurdres|masterpiece|quality|detailed|official_art)/.test(tag)) {
    return ['quality']
  }

  return ['details', 'others']
}

function inferMetaTargets(prompt) {
  const targets = inferGeneralTargets(prompt)
  return targets.includes('details') ? ['quality', 'others'] : targets
}

function resolveTargets(group, prompt) {
  return typeof group.targets === 'function' ? group.targets(prompt) : group.targets
}

function makeSaaTagSuggestion(row) {
  const prompt = normalizeText(row[0])
  const group = TAG_GROUPS[normalizeText(row[1])]
  if (!prompt || !group) {
    return null
  }

  const translatedLabel = normalizeText(row[2])
  return {
    id: buildSuggestionId(group.kind, prompt),
    kind: group.kind,
    label: prompt,
    prompt,
    aliases: uniqueList([humanizeTag(prompt), translatedLabel]),
    category: group.category,
    targetSections: resolveTargets(group, prompt),
  }
}

function parseSaaTagCompleteCsv(document) {
  const rows = parseCsvRows(document.text.replace(/^\uFEFF/, ''))
    .map((row) => row.map(normalizeText))
  if (!rows.length || !TAG_GROUPS[normalizeText(rows[0][1])]) {
    return null
  }

  return rows.map(makeSaaTagSuggestion).filter(Boolean)
}

function makeViewTagSuggestion(category, prompt) {
  return {
    id: buildSuggestionId('tag', prompt),
    kind: 'tag',
    label: prompt,
    prompt,
    aliases: uniqueList(splitList(prompt)),
    category: titleCase(category),
    targetSections: VIEW_TAG_TARGETS[category],
  }
}

function parseSaaViewTags(document) {
  const parsed = JSON.parse(document.text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const entries = Object.entries(parsed)
    .filter(([category, values]) => VIEW_TAG_TARGETS[category] && Array.isArray(values))
  if (!entries.length) {
    return null
  }

  return entries.flatMap(([category, values]) =>
    values.map(normalizeText).filter(Boolean).map((prompt) => makeViewTagSuggestion(category, prompt)),
  )
}

function parseSaaPromptSuggestionDocument(document) {
  const trimmedText = document.text.trimStart()
  if (trimmedText.startsWith('{')) {
    return parseSaaViewTags(document)
  }

  return parseSaaTagCompleteCsv(document)
}

function parseCsvDocument(document) {
  const rows = parseCsvRows(document.text.replace(/^\uFEFF/, ''))
  if (!rows.length) {
    return []
  }

  if (!hasPromptSuggestionHeader(rows[0])) {
    return rows
      .map((row) => normalizeImportedSuggestion({
        kind: 'character',
        label: row[0],
        prompt: row[1] ?? row[0],
        aliases: row[0] === row[1] ? [] : [row[0]],
        category: 'Character',
        targetSections: ['subject'],
      }, document.name))
      .filter(Boolean)
  }

  const headers = rows[0].map(normalizeHeader)
  return rows.slice(1)
    .map((row) => headers.reduce((record, header, index) => {
      record[header] = row[index] ?? ''
      return record
    }, {}))
    .map((row) => normalizeImportedSuggestion({
      id: getRowValue(row, ['id']),
      kind: getRowValue(row, ['kind', 'type']),
      label: getRowValue(row, ['label', 'name', 'displayName']),
      prompt: getRowValue(row, ['prompt', 'tag', 'value']),
      aliases: getRowValue(row, ['aliases', 'alias', 'search']),
      category: getRowValue(row, ['category', 'group']),
      targetSections: getRowValue(row, ['targetSections', 'targets', 'target', 'sections', 'section']),
      helperTags: getRowValue(row, ['helperTags', 'helpers', 'traits']),
    }, document.name))
    .filter(Boolean)
}

function parseJsonObjectMap(value, document) {
  return Object.entries(value)
    .map(([key, mapValue]) => {
      if (mapValue && typeof mapValue === 'object' && !Array.isArray(mapValue)) {
        return normalizeImportedSuggestion({
          label: key,
          ...mapValue,
          prompt: mapValue.prompt ?? key,
        }, document.name)
      }

      return normalizeImportedSuggestion({
        kind: 'character',
        label: key,
        prompt: key,
        aliases: [],
        category: 'Character',
        targetSections: ['subject'],
        helperTags: mapValue,
      }, document.name)
    })
    .filter(Boolean)
}

function parseJsonDocument(document) {
  const parsed = JSON.parse(document.text)
  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeImportedSuggestion(item, document.name)).filter(Boolean)
  }

  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.suggestions)) {
      return parsed.suggestions.map((item) => normalizeImportedSuggestion(item, document.name)).filter(Boolean)
    }

    return parseJsonObjectMap(parsed, document)
  }

  return []
}

function parsePromptSuggestionDocument(document) {
  const saaSuggestions = parseSaaPromptSuggestionDocument(document)
  if (saaSuggestions) {
    return saaSuggestions
  }

  const trimmedText = document.text.trimStart()
  if (document.name.toLowerCase().endsWith('.json') || trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
    return parseJsonDocument(document)
  }

  return parseCsvDocument(document)
}

function mergePromptSuggestions(suggestions) {
  const mergedByKey = new Map()

  for (const suggestion of suggestions) {
    const targetKey = [...suggestion.targetSections].sort().join('|')
    const key = `${suggestion.kind}:${normalizeKey(suggestion.prompt)}:${targetKey}`
    const existing = mergedByKey.get(key)

    if (!existing) {
      mergedByKey.set(key, {
        ...suggestion,
        aliases: uniqueList(suggestion.aliases),
        helperTags: suggestion.helperTags ? uniqueList(suggestion.helperTags) : undefined,
      })
      continue
    }

    if (existing.label === existing.prompt && suggestion.label !== suggestion.prompt) {
      existing.label = suggestion.label
    }
    existing.aliases = uniqueList([
      ...existing.aliases,
      ...suggestion.aliases,
      ...(normalizeKey(suggestion.label) === normalizeKey(suggestion.prompt) ? [] : [suggestion.label]),
    ])
    existing.helperTags = uniqueList([...(existing.helperTags ?? []), ...(suggestion.helperTags ?? [])])
  }

  return ensureUniqueSuggestionIds([...mergedByKey.values()])
}

function ensureUniqueSuggestionIds(suggestions) {
  const seen = new Set()
  return suggestions.map((suggestion) => {
    const baseId = suggestion.id
    let nextId = baseId
    let suffix = 2
    while (seen.has(nextId)) {
      nextId = `${baseId}-${suffix}`
      suffix += 1
    }

    seen.add(nextId)
    return nextId === suggestion.id ? suggestion : { ...suggestion, id: nextId }
  })
}

export function parsePromptSuggestionDocuments(documents, importedAt = new Date().toISOString()) {
  const suggestions = mergePromptSuggestions(documents.flatMap(parsePromptSuggestionDocument))
  if (!suggestions.length) {
    throw new Error('No prompt suggestions were found in the selected files.')
  }

  return {
    sourceNames: documents.map((document) => document.name),
    importedAt,
    suggestions,
  }
}
