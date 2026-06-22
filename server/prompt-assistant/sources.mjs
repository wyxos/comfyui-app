export const saaPromptSuggestionSourceKind = 'saa'
export const saaPromptSuggestionSourceVersion = 'saa-v160-danbooru-e621-view-tags-2026-06-22'
const SAA_SOURCE_DOWNLOAD_TIMEOUT_MS = 30_000

export const saaPromptSuggestionSources = [
  {
    name: 'SAA v160 character list',
    url: 'https://huggingface.co/datasets/flagrantia/character_select_stand_alone_app/resolve/main/wai_characters_v160.csv?download=true',
  },
  {
    name: 'SAA character helper tags',
    url: 'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/data/wai_tag_assist.json',
  },
  {
    name: 'SAA Danbooru/E621 tag complete',
    url: 'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/data/danbooru_e621_merged_zh_cn.csv',
  },
  {
    name: 'SAA view tags',
    url: 'https://raw.githubusercontent.com/mirabarukaso/character_select_stand_alone_app/refs/heads/main/data/view_tags.json',
  },
]

export async function downloadSaaPromptSuggestionDocuments() {
  return Promise.all(
    saaPromptSuggestionSources.map(async (source) => {
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(SAA_SOURCE_DOWNLOAD_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`Could not download ${source.name}.`)
      }

      return {
        name: source.name,
        text: await response.text(),
      }
    }),
  )
}
