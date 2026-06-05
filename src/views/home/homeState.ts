import { ref } from 'vue'
import { createEmptyPromptSections, createEmptyPromptSectionsDrafts, createEmptyQueueSummary } from './homeConstants'
import type {
  CheckpointOption,
  CheckpointSelection,
  ControlNetOption,
  ControlNetPreprocessorOption,
  FormTab,
  GeneratedOutputContextMenu,
  InputImageSnapshot,
  JobOutput,
  JobCounts,
  JobHistoryPagination,
  JobListTab,
  JobResponse,
  JobState,
  LoraOption,
  PromptSectionId,
  PromptSectionsState,
  PromptTag,
  PromptVariant,
  QueueSummary,
} from './homeTypes'

export function createHomeState() {
const prompt = ref('')
const negativePrompt = ref('')
const promptSections = ref<PromptSectionsState>(createEmptyPromptSections())
const promptSectionDrafts = ref<Record<PromptSectionId, string>>(createEmptyPromptSectionsDrafts())
const negativePromptTags = ref<PromptTag[]>([])
const negativePromptDraft = ref('')
const checkpoints = ref<CheckpointOption[]>([])
const selectedCheckpoints = ref<CheckpointSelection[]>([])
const selectedCheckpointPicker = ref('')
const loras = ref<LoraOption[]>([])
const defaultLoraStrength = ref('1')
const controlNets = ref<ControlNetOption[]>([])
const controlNetPreprocessors = ref<ControlNetPreprocessorOption[]>([
  { id: 'none', label: 'Raw image', defaultResolution: 512 },
  { id: 'lineart', label: 'Line art', defaultResolution: 512 },
  { id: 'canny', label: 'Canny edges', defaultResolution: 512 },
  { id: 'anime-lineart', label: 'Anime line art', defaultResolution: 512 },
  { id: 'depth', label: 'Depth map', defaultResolution: 512 },
  { id: 'pose', label: 'OpenPose', defaultResolution: 512 },
  { id: 'tile', label: 'Tile', defaultResolution: 512 },
])
const width = ref('1024')
const height = ref('1024')
const seed = ref('')
const steps = ref('')
const cfg = ref('')
const maintainAspectRatio = ref(false)
const lockedAspectRatio = ref<number | null>(null)
const aspectRatioScale = ref('0')
const aspectRatioBaseSize = ref<{ width: number; height: number } | null>(null)
const imageDenoise = ref('')
const inputImageField = ref<HTMLInputElement | null>(null)
const selectedImageFile = ref<File | null>(null)
const selectedImageSourceFile = ref<File | null>(null)
const selectedImageDisplayName = ref<string | null>(null)
const selectedImagePreviewUrl = ref<string | null>(null)
const selectedImageDimensions = ref<{ width: number; height: number } | null>(null)
const uploadedInputImageName = ref<string | null>(null)
const useInputImage = ref(false)
const flattenInputImageBackground = ref(false)
const inputImageBackgroundColor = ref('#ffffff')
const isDraggingImage = ref(false)
const isUploadingInputImage = ref(false)
const inputImageUploadError = ref('')
const formTab = ref<FormTab>('assets')
const isResetDialogOpen = ref(false)

const loadingCheckpoints = ref(true)
const loadingError = ref('')
const loadingLoras = ref(true)
const loraLoadingError = ref('')
const loadingControlNets = ref(true)
const controlNetLoadingError = ref('')

const activePromptId = ref('')
const jobsList = ref<JobResponse[]>([])
const jobCounts = ref<JobCounts>({ running: 0, queued: 0, history: 0 })
const jobHistory = ref<JobHistoryPagination>({
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
})
const queueSummary = ref<QueueSummary>(createEmptyQueueSummary())
const jobListTab = ref<JobListTab>('running')
const jobState = ref<JobState>('idle')
const statusLine = ref('Ready')
const detailLine = ref('Waiting for a prompt.')
const progressValue = ref<number | null>(null)
const progressMax = ref<number | null>(null)
const progressPercent = ref<number | null>(null)
const currentNodeLabel = ref('')
const currentSeed = ref<number | null>(null)
const lastGeneratedSeed = ref<number | null>(null)
const previewOutputs = ref<JobOutput[]>([])
const pendingSubmittedVariants = ref<PromptVariant[]>([])
const pendingSubmittedCheckpoints = ref<string[]>([])
const pendingSubmittedInputImageSnapshot = ref<InputImageSnapshot | null>(null)
const submittedInputImageSnapshots = ref<Record<string, InputImageSnapshot>>({})
const activeBatchId = ref('')
const activeBatchPromptIds = ref<string[]>([])
const activeBatchCheckpoints = ref<string[]>([])
const batchPreviewMode = ref(false)
const activePreviewIndex = ref(0)
const errorMessage = ref('')
const submissionError = ref('')
const isSubmittingGenerate = ref(false)
const isCancellingJob = ref(false)
const isCancellingQueuedJobs = ref(false)
const queueActionError = ref('')
const copiedOutputPath = ref(false)
const openingOutputFolder = ref(false)
const isPreviewModalOpen = ref(false)
const previewModalScale = ref(1)
const previewModalOffsetX = ref(0)
const previewModalOffsetY = ref(0)
const isPreviewModalDragging = ref(false)
const previewModalViewport = ref<HTMLElement | null>(null)
const previewModalPanField = ref<HTMLElement | null>(null)
const generatedOutputContextMenu = ref<GeneratedOutputContextMenu | null>(null)
const generatedOutputActionError = ref('')
const isApplyingGeneratedOutput = ref(false)
const deletingJobEntryKeys = ref<string[]>([])

const controlNetDragDepths = new Map<string, number>()
const controlNetImageLoadIds = new Map<string, string>()

return {
  prompt,
  negativePrompt,
  promptSections,
  promptSectionDrafts,
  negativePromptTags,
  negativePromptDraft,
  checkpoints,
  selectedCheckpoints,
  selectedCheckpointPicker,
  loras,
  defaultLoraStrength,
  controlNets,
  controlNetPreprocessors,
  width,
  height,
  seed,
  steps,
  cfg,
  maintainAspectRatio,
  lockedAspectRatio,
  aspectRatioScale,
  aspectRatioBaseSize,
  imageDenoise,
  inputImageField,
  selectedImageFile,
  selectedImageSourceFile,
  selectedImageDisplayName,
  selectedImagePreviewUrl,
  selectedImageDimensions,
  uploadedInputImageName,
  useInputImage,
  flattenInputImageBackground,
  inputImageBackgroundColor,
  isDraggingImage,
  isUploadingInputImage,
  inputImageUploadError,
  formTab,
  isResetDialogOpen,
  loadingCheckpoints,
  loadingError,
  loadingLoras,
  loraLoadingError,
  loadingControlNets,
  controlNetLoadingError,
  activePromptId,
  jobsList,
  jobCounts,
  jobHistory,
  queueSummary,
  jobListTab,
  jobState,
  statusLine,
  detailLine,
  progressValue,
  progressMax,
  progressPercent,
  currentNodeLabel,
  currentSeed,
  lastGeneratedSeed,
  previewOutputs,
  pendingSubmittedVariants,
  pendingSubmittedCheckpoints,
  pendingSubmittedInputImageSnapshot,
  submittedInputImageSnapshots,
  activeBatchId,
  activeBatchPromptIds,
  activeBatchCheckpoints,
  batchPreviewMode,
  activePreviewIndex,
  errorMessage,
  submissionError,
  isSubmittingGenerate,
  isCancellingJob,
  isCancellingQueuedJobs,
  queueActionError,
  copiedOutputPath,
  openingOutputFolder,
  isPreviewModalOpen,
  previewModalScale,
  previewModalOffsetX,
  previewModalOffsetY,
  isPreviewModalDragging,
  previewModalViewport,
  previewModalPanField,
  generatedOutputContextMenu,
  generatedOutputActionError,
  isApplyingGeneratedOutput,
  deletingJobEntryKeys,
  controlNetDragDepths,
  controlNetImageLoadIds,
}
}

export type HomeState = ReturnType<typeof createHomeState>
