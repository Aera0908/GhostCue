export type SupportedLocale =
  | "en"
  | "zh-CN"
  | "zh-TW"
  | "es"
  | "ja"
  | "de"
  | "fr"
  | "pt-BR"
  | "ko"
  | "ru"
  | "tl-PH";

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  flag: string;
}

export interface TranslationDictionary {
  common: {
    save: string;
    cancel: string;
    close: string;
    copy: string;
    copied: string;
    edit: string;
    loading: string;
    active: string;
    inactive: string;
    enabled: string;
    disabled: string;
    on: string;
    off: string;
    error: string;
    success: string;
    warning: string;
    delete: string;
    clear: string;
    search: string;
    all: string;
  };
  header: {
    appName: string;
    stealthMode: string;
    stealthOff: string;
    clickThrough: string;
    clickThroughOff: string;
    micLive: string;
    micMuted: string;
    sysLive: string;
    sysMuted: string;
    aiReady: string;
    aiGenerating: string;
    codeStudio: string;
    askMode: string;
    hotkeysHelp: string;
    settings: string;
    hideHud: string;
    sessionSetup: string;
    autoTriggerActive: string;
  };
  actions: {
    answer: string;
    answerDesc: string;
    code: string;
    codeDesc: string;
    ask: string;
    askDesc: string;
    clarify: string;
    clarifyDesc: string;
    systemDesign: string;
    systemDesignDesc: string;
    summary: string;
    summaryDesc: string;
    screenVision: string;
    screenVisionDesc: string;
    stopAi: string;
    queryPlaceholder: string;
    sendPrompt: string;
  };
  suggestion: {
    headerTitle: string;
    emptyTitle: string;
    emptySubtitle: string;
    listeningSpeech: string;
    copyFullAnswer: string;
    generatingStream: string;
    interviewerPrompt: string;
    actionBadge: string;
  };
  transcript: {
    headerTitle: string;
    speakerInterviewer: string;
    speakerCandidate: string;
    speakerSystem: string;
    emptyWaiting: string;
    emptySubtitle: string;
    clearHistory: string;
    pauseStream: string;
    resumeStream: string;
    turnCount: string;
  };
  codeStudio: {
    title: string;
    noSnippets: string;
    noSnippetsSub: string;
    copySnippet: string;
    insertPrompt: string;
    language: string;
    snippetCount: string;
    tabCode: string;
    tabExplanation: string;
  };
  settings: {
    modalTitle: string;
    tabGeneral: string;
    tabAudio: string;
    tabModel: string;
    tabContext: string;
    
    // General
    uiLanguage: string;
    uiLanguageDesc: string;
    responseLanguage: string;
    responseLanguageDesc: string;
    antiCaptureTitle: string;
    antiCaptureDesc: string;
    opacityTitle: string;
    hotkeysTitle: string;

    // Audio
    audioTitle: string;
    inputDevice: string;
    outputDevice: string;
    sttProvider: string;
    sttLanguage: string;
    sttLanguageDesc: string;
    vadSensitivity: string;
    whisperModel: string;
    downloadModel: string;
    downloading: string;

    // Model
    llmProvider: string;
    apiKey: string;
    modelName: string;
    endpointUrl: string;

    // Context
    targetRole: string;
    companyName: string;
    interviewTitle: string;
    jobDescription: string;
    resumeText: string;
    systemPromptOverride: string;
    autoTrigger: string;
    maxTurns: string;
  };
  hotkeysModal: {
    title: string;
    subtitle: string;
    categoryAi: string;
    categoryStealth: string;
    categoryAudio: string;
  };
  sessionScreen: {
    badge: string;
    title: string;
    subtitle: string;
    tabProfile: string;
    tabAudio: string;
    tabStealth: string;
    tabCodebase: string;
    roleLabel: string;
    companyLabel: string;
    jobDescLabel: string;
    resumeLabel: string;
    startBtn: string;
    presetsTitle: string;
  };
  permissionModal: {
    title: string;
    desc: string;
    allowBtn: string;
    skipBtn: string;
  };
}
