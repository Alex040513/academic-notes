/** 一条知识点就是一个 markdown 文件，文件头带这些元信息 */

export type Review = {
  /** 下次复习日期，本地时区 YYYY-MM-DD */
  due: string
  /** 间隔天数 */
  interval: number
  /** 难度系数 1.3 ~ 3.0 */
  ease: number
  /** 已复习次数 */
  reps: number
  /** 遗忘次数 */
  lapses: number
}

export type Note = {
  id: string
  /** 在仓库中的路径，如 notes/1732600000000-ding-yu-cong-ju.md */
  path: string
  title: string
  course: string
  tags: string[]
  /** 正文 markdown，不含 frontmatter */
  body: string
  created: string
  updated: string
  review: Review
  /** GitHub blob sha，用于判断内容是否变化 */
  sha?: string
  /** 仅本地：是否有未提交的修改 */
  dirty?: boolean
}

export const QUESTION_TYPES = ['choice', 'blank', 'correct', 'translate'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  choice: '单项选择',
  blank: '填空',
  correct: '改错',
  translate: '翻译/造句',
}

export type Question = {
  id: string
  type: QuestionType
  stem: string
  options?: string[]
  answer: string
  explanation: string
  sourceTitle?: string
  sourceId?: string
}

export type QuizResult = {
  question: Question
  userAnswer: string
  correct: boolean
  /** 是否由用户自己判定（主观题） */
  selfGraded?: boolean
}

export type Grade = 'again' | 'hard' | 'good'

export type Settings = {
  token: string
  owner: string
  repo: string
  branch: string
  deepseekKey: string
  model: string
  /** 演示模式：只在本机内存/缓存里跑，不连 GitHub */
  demo?: boolean
}

export const EMPTY_SETTINGS: Settings = {
  token: '',
  owner: '',
  repo: 'academic-english-notes-data',
  branch: 'main',
  deepseekKey: '',
  model: 'deepseek-chat',
  demo: false,
}

export function hasRepo(s: Settings): boolean {
  return Boolean(s.token && s.owner && s.repo)
}
