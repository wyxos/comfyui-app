const DANBOORU_POSTS_URL = 'https://danbooru.donmai.us/posts.json'
const DEFAULT_POST_LIMIT = 100
const MAX_HELPER_TAGS = 10

const GENERIC_TAGS = new Set([
  '1girl',
  '1boy',
  '2girls',
  '2boys',
  '3girls',
  '3boys',
  'solo',
  'duo',
  'multiple_girls',
  'multiple_boys',
  'multiple_views',
  'looking_at_viewer',
  'simple_background',
  'white_background',
  'transparent_background',
  'highres',
  'absurdres',
  'masterpiece',
  'best_quality',
  'commentary_request',
  'tagme',
  'artist_name',
  'signature',
  'watermark',
  'text',
  'english_text',
  'japanese_text',
  'translated',
])

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function normalizeDanbooruTagKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '_')
}

function humanizeTag(value) {
  return normalizeText(value.replace(/_/g, ' '))
}

function splitDanbooruTags(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function hasCharacterTag(post, characterKey) {
  const characterTags = new Set(splitDanbooruTags(post?.tag_string_character ?? '').map(normalizeDanbooruTagKey))
  return characterTags.size ? characterTags.has(characterKey) : true
}

function isUsefulTraitTag(tagKey, characterKey) {
  if (!tagKey || tagKey === characterKey || GENERIC_TAGS.has(tagKey)) {
    return false
  }

  if (/^\d+(girls?|boys?|others?)$/.test(tagKey) || /^rating[:_]/.test(tagKey)) {
    return false
  }

  return true
}

export function mineCharacterHelperTags(prompt, posts) {
  const characterKey = normalizeDanbooruTagKey(prompt)
  if (!characterKey || !Array.isArray(posts)) {
    return { helperTags: [], postCount: 0 }
  }

  const relevantPosts = posts.filter((post) => hasCharacterTag(post, characterKey))
  const sourcePosts = relevantPosts.length ? relevantPosts : posts
  const counts = new Map()

  for (const post of sourcePosts) {
    const postTags = new Set(splitDanbooruTags(post?.tag_string_general ?? '').map(normalizeDanbooruTagKey))
    for (const tagKey of postTags) {
      if (!isUsefulTraitTag(tagKey, characterKey)) {
        continue
      }

      counts.set(tagKey, (counts.get(tagKey) ?? 0) + 1)
    }
  }

  const minimumSupport = Math.max(2, Math.ceil(sourcePosts.length * 0.2))
  const helperTags = [...counts.entries()]
    .filter(([, count]) => count >= minimumSupport)
    .sort(([firstTag, firstCount], [secondTag, secondCount]) =>
      secondCount - firstCount || firstTag.localeCompare(secondTag),
    )
    .slice(0, MAX_HELPER_TAGS)
    .map(([tag]) => humanizeTag(tag))

  return {
    helperTags,
    postCount: sourcePosts.length,
  }
}

export async function fetchDanbooruCharacterPosts(prompt, { fetchImpl = fetch, limit = DEFAULT_POST_LIMIT } = {}) {
  const characterKey = normalizeDanbooruTagKey(prompt)
  if (!characterKey) {
    return []
  }

  const url = new URL(DANBOORU_POSTS_URL)
  url.searchParams.set('tags', characterKey)
  url.searchParams.set('limit', String(limit))
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': 'comfyui-companion-app prompt-assistant',
    },
  })
  if (!response.ok) {
    throw new Error(`Danbooru returned HTTP ${response.status}.`)
  }

  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}
