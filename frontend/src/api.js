const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function jsonFetch(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const runCodeOnServer = (code, mode, stdin = '', language = 'cpp', modelMode = 'main') =>
  jsonFetch('/run', { code, mode, stdin, language, model_mode: modelMode })

export const createRepairGap = (code, error, mode = 'DSA', language = 'cpp', modelMode = 'main') =>
  jsonFetch('/ai/repair-gap', { code, error, mode, language, model_mode: modelMode })

export const chatWithBro = (message, mode = 'DSA', code = '', context = '', useInternet = false, modelMode = 'main', history = []) =>
  jsonFetch('/chat', { message, mode, code, context, use_internet: useInternet, model_mode: modelMode, history })

export const getQuickPrompts = (mode = 'DSA', code = '', context = '', modelMode = 'main') =>
  jsonFetch('/assistant/quick-prompts', { mode, code, context, model_mode: modelMode })

export const getSuggestions = (code, mode = 'DSA', context = '', runOutput = '', error = '', useInternet = false, modelMode = 'main') =>
  jsonFetch('/suggestions', { code, mode, context, run_output: runOutput, error, use_internet: useInternet, model_mode: modelMode })

export const getSuggestionApplyGuide = (suggestion, code = '', mode = 'DSA', context = '', modelMode = 'main') =>
  jsonFetch('/suggestions/apply', { suggestion, code, mode, context, model_mode: modelMode })

export const generateSystemDiagram = (context, code = '', pseudocode = '', useInternet = false, modelMode = 'main') =>
  jsonFetch('/system/diagram', { context, code, pseudocode, use_internet: useInternet, model_mode: modelMode })

export const validateSystemDesign = (context, diagramText, code, pseudocode, useInternet = false, modelMode = 'main') =>
  jsonFetch('/system/validate', { context, diagram_text: diagramText, code, pseudocode, use_internet: useInternet, model_mode: modelMode })

export const generateUnitTests = (code, requirement, language = 'cpp', useInternet = false, modelMode = 'main') =>
  jsonFetch('/unit-tests', { code, requirement, language, use_internet: useInternet, model_mode: modelMode })

export const getLldQuestion = (difficulty = 'Medium', useInternet = false, modelMode = 'main') =>
  jsonFetch('/lld/question', { difficulty, use_internet: useInternet, model_mode: modelMode })

export const startInterview = (difficulty = 'Medium', topic = 'arrays', useInternet = false, modelMode = 'main') =>
  jsonFetch('/interview/start', { difficulty, topic, use_internet: useInternet, model_mode: modelMode })

export const judgeInterview = (question, explanation, code, language = 'cpp', modelMode = 'main') =>
  jsonFetch('/interview/judge', { question, explanation, code, language, model_mode: modelMode })

// ── New interview flow ─────────────────────────────────────────────────────
export const fetchDSAProblem = (topic = 'arrays', difficulty = 'Medium', modelMode = 'main') =>
  jsonFetch('/interview/dsa/fetch', { topic, difficulty, model_mode: modelMode })

export const askClarifyQuestion = (problem, question, modelMode = 'main') =>
  jsonFetch('/interview/dsa/clarify', { problem, question, model_mode: modelMode })

export const requestCodingHint = (problem, code, elapsedMin, modelMode = 'main') =>
  jsonFetch('/interview/dsa/hint', { problem, code, elapsed_min: elapsedMin, model_mode: modelMode })

export const getReviewQuestions = (problem, code, modelMode = 'main') =>
  jsonFetch('/interview/dsa/review-questions', { problem, code, model_mode: modelMode })

export const judgeDSASession = (problem, code, qnaPairs, modelMode = 'main') =>
  jsonFetch('/interview/dsa/judge', { problem, code, qna_pairs: qnaPairs, model_mode: modelMode })

export const startLLDDiscussion = (modelMode = 'main') =>
  jsonFetch('/interview/lld/start', { model_mode: modelMode })

export const discussLLD = (problem, conversation, modelMode = 'main') =>
  jsonFetch('/interview/lld/discuss', { problem, conversation, model_mode: modelMode })

export const judgeLLDSession = (problem, conversation, modelMode = 'main') =>
  jsonFetch('/interview/lld/judge', { problem, conversation, model_mode: modelMode })


export const getStarterCode = (mode = 'DSA', language = 'cpp', context = '', useInternet = false, modelMode = 'main') =>
  jsonFetch('/mode/starter-code', { mode, language, context, use_internet: useInternet, model_mode: modelMode })

export const explainRunResult = (code, mode, stdin, output, error, success, useInternet = false, modelMode = 'main') =>
  jsonFetch('/run/explain', { code, mode, stdin, output, error, success, use_internet: useInternet, model_mode: modelMode })

export const analyzeComplexity = (code, mode = 'DSA', context = '', modelMode = 'main') =>
  jsonFetch('/dsa/complexity', { code, mode, context, model_mode: modelMode })

export const runStressTest = (code, context = '', count = 6, language = 'cpp', modelMode = 'main') =>
  jsonFetch('/dsa/stress-test', { code, context, count, language, model_mode: modelMode })

export const getMistakeMemory = (limit = 10) =>
  jsonFetch('/memory/mistakes', { limit })

export const explainCode = (message, code = '', mode = 'DSA', modelMode = 'main') =>
  jsonFetch('/chat/explain', { message, code, mode, model_mode: modelMode })

export const analyzeCode = (code, error = '', output = '', mode = 'DSA', language = 'python', modelMode = 'main', userQuestion = '') =>
  jsonFetch('/ai/analyze', { code, error, output, mode, language, model_mode: modelMode, user_question: userQuestion })

export const generatePatch = (code, analysis = {}, language = 'python', modelMode = 'main') =>
  jsonFetch('/ai/patch', { code, analysis, language, model_mode: modelMode })

export const compactContext = (messages = [], modelMode = 'main') =>
  jsonFetch('/chat/compact', { messages, model_mode: modelMode })

export const phrasePrompt = (message, executionLogs = '', modelMode = 'main') =>
  jsonFetch('/chat/phrase', { message, execution_logs: executionLogs, model_mode: modelMode })

// ── LLD Workspace ────────────────────────────────────────────────────────────
export const getLLDWorkspaceFiles = () =>
  fetch(`${API_URL}/lld/workspace/files`).then(r => r.json())

export const readWorkspaceFile = (path) =>
  jsonFetch('/lld/workspace/read', { path })

export const writeWorkspaceFile = (path, content) =>
  jsonFetch('/lld/workspace/write', { path, content })

export const deleteWorkspaceFile = (path) =>
  jsonFetch('/lld/workspace/delete', { path })

export const runWorkspaceCommand = (command) =>
  jsonFetch('/lld/workspace/run', { command })

export const generateLLDStructure = (context, files = [], modelMode = 'main') =>
  jsonFetch('/lld/structure/generate', { context, files, model_mode: modelMode })

export const aiGenerateLLDFile = (context, filename, instruction, existingContent = '', modelMode = 'main') =>
  jsonFetch('/lld/ai/generate-file', { context, filename, instruction, existing_content: existingContent, model_mode: modelMode })

export const aiPatchLLDFile = (context, filename, fileContent, instruction, modelMode = 'main') =>
  jsonFetch('/lld/ai/patch-file', { context, filename, file_content: fileContent, instruction, model_mode: modelMode })

// ── Local filesystem browser ─────────────────────────────────────────────
export const getFsHome = () => fetch(`${API_URL}/files/home`).then(r => r.json())
export const browseFs = (path = null, showHidden = false) =>
  jsonFetch('/files/browse', { path, show_hidden: showHidden })
export const readFsFile = (path) => jsonFetch('/files/read', { path })
export const writeFsFile = (path, content) => jsonFetch('/files/write', { path, content })
export const createFsPath = (path, isDir = false) => jsonFetch('/files/create', { path, is_dir: isDir })
export const deleteFsPath = (path) => jsonFetch('/files/delete', { path })
export const renameFsPath = (oldPath, newPath) => jsonFetch('/files/rename', { old_path: oldPath, new_path: newPath })

// ── App settings: AI language ────────────────────────────────────────────
export const getAppSettings = () => fetch(`${API_URL}/settings`).then(r => r.json())
export const setAILanguage = (language) => jsonFetch('/settings/language', { language })
