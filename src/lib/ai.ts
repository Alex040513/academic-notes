import type { Note, Question, QuestionType } from './types'

const ENDPOINT = 'https://api.deepseek.com/chat/completions'

export type AIErrorKind = 'no_key' | 'auth' | 'balance' | 'rate' | 'network' | 'bad_output' | 'unknown'

export class AIError extends Error {
  kind: AIErrorKind
  constructor(kind: AIErrorKind, message: string) {
    super(message)
    this.name = 'AIError'
    this.kind = kind
  }
}

type Message = { role: 'system' | 'user' | 'assistant'; content: string }

async function chat(
  apiKey: string,
  model: string,
  messages: Message[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  if (!apiKey) {
    throw new AIError('no_key', '还没有填 DeepSeek API Key。去「设置」里填上就能用 AI 了。')
  }

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  } catch {
    throw new AIError('network', '连不上 DeepSeek 服务器，检查一下网络。')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 401) throw new AIError('auth', 'DeepSeek API Key 不对，去「设置」里重新填一个。')
    if (res.status === 402) throw new AIError('balance', 'DeepSeek 账户余额不足，去 platform.deepseek.com 充值。')
    if (res.status === 429) throw new AIError('rate', '请求太频繁了，等几秒再试。')
    throw new AIError('unknown', `AI 请求失败（${res.status}）${text.slice(0, 120)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new AIError('bad_output', 'AI 没有返回内容，再试一次。')
  return content
}

/** 模型有时会用 ```json 包起来，这里做一次容错解析 */
function parseJson<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  try {
    return JSON.parse(text) as T
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T
      } catch {
        /* fallthrough */
      }
    }
    throw new AIError('bad_output', 'AI 返回的内容格式不对，再试一次。')
  }
}

export async function testAI(apiKey: string, model: string): Promise<void> {
  await chat(apiKey, model, [{ role: 'user', content: '只回复两个字：可用' }], {
    temperature: 0,
    maxTokens: 16,
  })
}

/* ------------------------------ 整理笔记 ------------------------------ */

export type StructuredNote = {
  title: string
  course: string
  tags: string[]
  body: string
}

const STRUCTURE_SYSTEM = `你是一位「学术英语（English for Academic Purposes）」课程的助教，负责把研究生在课上随手记下的零散内容，整理成一张用于日后复习的知识点卡片。

硬性要求：
1. 只整理用户给出的内容，不要自行补充用户没提到的新知识。原文含糊或可能有笔误时，在「易混点」里用一句话提醒，不要瞎改。
2. title 不超过 22 个汉字，必须具体（例如「that 引导定语从句和同位语从句的区别」），禁止「关于从句」「语法笔记」这类空泛标题。
3. body 用 markdown，固定这四个二级小节，顺序不变，内容为空则写「（无）」：
## 一句话结论
## 核心规则
## 例句
## 易混点
4. 例句保留英文原句，后面紧跟一句中文说明；每个知识点至少 1 个例句，原文没有就给最典型的。
5. 术语第一次出现时中英并列，例如「先行词（antecedent）」。
6. tags 给 3-5 个，每个 2-6 个字，例如「从句」「易混点」「学术写作」。
7. 只输出 JSON 对象，不要用 markdown 代码块包裹，不要任何解释文字。

JSON 结构：
{"title": "字符串", "course": "字符串", "tags": ["字符串"], "body": "markdown 字符串"}`

export async function structureNote(
  apiKey: string,
  model: string,
  raw: string,
  ctx: { course?: string; tags?: string[] } = {},
): Promise<StructuredNote> {
  const user = [
    ctx.course ? `课程：${ctx.course}` : '',
    ctx.tags?.length ? `用户已给的标签：${ctx.tags.join('、')}` : '',
    '原始内容：',
    raw,
  ]
    .filter(Boolean)
    .join('\n')

  const out = await chat(
    apiKey,
    model,
    [
      { role: 'system', content: STRUCTURE_SYSTEM },
      { role: 'user', content: user },
    ],
    { json: true, temperature: 0.3, maxTokens: 2048 },
  )

  const j = parseJson<Partial<StructuredNote>>(out)
  const body = String(j.body || '').trim()
  if (!body) throw new AIError('bad_output', 'AI 整理结果为空，再试一次。')

  return {
    title: String(j.title || '').trim().slice(0, 60),
    course: String(j.course || ctx.course || '').trim(),
    tags: Array.isArray(j.tags) ? j.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : ctx.tags || [],
    body,
  }
}

/* ------------------------------ 生成题目 ------------------------------ */

const QUIZ_SYSTEM = `你是一位学术英语课程（English for Academic Purposes）的助教，负责根据学生的知识点笔记出练习题。

出题原则：
1. 严格只考笔记里出现过的知识点，禁止超纲。
2. 题目要有区分度：不只考记忆，也要考辨析和实际运用。
3. 干扰项必须合理——用学生真实会犯的错误，不要「明显错到离谱」的选项。
4. 讲解必须讲清「为什么」，不要只重复答案。
5. 语言：题干里的英文例句保持英文，其余说明用中文。

题型规范：
- choice：单项选择题，options 必须正好 4 个且互不相同，answer 必须与其中某一个选项**完全一致**。
- blank：英文句子中需要填的部分写成 ____ ，answer 是唯一正确答案（单词或短语），不要出有多种正确答案的填空。
- correct：stem 是一句含有**典型语法错误**的英文句子，answer 是改正后的完整句子。
- translate：stem 是一句中文，answer 是参考英文译文，且译文必须用到对应知识点。

讲解 explanation 要求（80-160 字）：
先说明正确答案的依据，再指出其他选项/常见错误错在哪里，最后一句以「考点：」开头点明考查点。

只输出 JSON 对象，不要 markdown 代码块，不要任何额外文字。JSON 结构：
{"questions":[{"type":"choice","stem":"题干","options":["选项A","选项B","选项C","选项D"],"answer":"与某一选项完全相同的字符串","explanation":"讲解","sourceTitle":"对应笔记的标题"}]}

blank / correct / translate 三种题型不要输出 options 字段。`

function buildNoteContext(notes: Note[], maxChars = 14000): string {
  // 先均匀取样，避免只用到前几条笔记
  const perNote = Math.max(400, Math.floor(maxChars / Math.max(1, notes.length)))
  return notes
    .map((n) => {
      const body = n.body.replace(/\s+/g, ' ').slice(0, perNote)
      const meta = [n.course, n.tags.join('、')].filter(Boolean).join(' | ')
      return `### ${n.title}\n${meta ? `（${meta}）` : ''}\n${body}`
    })
    .join('\n\n')
}

export async function generateQuiz(
  apiKey: string,
  model: string,
  notes: Note[],
  opts: { count: number; types: QuestionType[] },
): Promise<Question[]> {
  if (!notes.length) throw new AIError('bad_output', '没有可用的笔记，先记几个知识点再来出题。')
  if (!opts.types.length) throw new AIError('bad_output', '至少选一种题型。')

  const asked = Math.min(30, Math.max(1, opts.count))
  const user = [
    `请依据下面的笔记出 ${asked} 道题，题型只能从这些里选：${opts.types.join('、')}。`,
    opts.types.length > 1 ? '请把题型混合开，不要全部用同一种题型。' : '',
    '',
    '笔记：',
    buildNoteContext(notes),
  ]
    .filter(Boolean)
    .join('\n')

  const out = await chat(
    apiKey,
    model,
    [
      { role: 'system', content: QUIZ_SYSTEM },
      { role: 'user', content: user },
    ],
    { json: true, temperature: 0.8, maxTokens: 8192 },
  )

  const parsed = parseJson<{ questions?: unknown[] }>(out)
  const raw = Array.isArray(parsed.questions) ? parsed.questions : []
  const questions = raw
    .map((q, i) => normalizeQuestion(q, i, notes))
    .filter((q): q is Question => q !== null)

  if (!questions.length) throw new AIError('bad_output', '这次没能生成有效题目，再点一次试试。')
  return questions.slice(0, asked)
}

function normalizeQuestion(q: unknown, index: number, notes: Note[]): Question | null {
  if (!q || typeof q !== 'object') return null
  const o = q as Record<string, unknown>
  const type = String(o.type || '') as QuestionType
  if (!['choice', 'blank', 'correct', 'translate'].includes(type)) return null

  const stem = String(o.stem || '').trim()
  const answer = String(o.answer || '').trim()
  const explanation = String(o.explanation || '').trim()
  if (!stem || !answer) return null

  let options: string[] | undefined
  if (type === 'choice') {
    options = Array.isArray(o.options) ? o.options.map((x) => String(x).trim()).filter(Boolean) : []
    // 去重后必须仍有 4 个，且 answer 落在选项里
    options = Array.from(new Set(options))
    if (options.length !== 4) return null
    if (!options.includes(answer)) {
      const idx = options.findIndex((x) => x.toLowerCase() === answer.toLowerCase())
      if (idx < 0) return null
      options[idx] = answer
    }
  }

  const sourceTitle = String(o.sourceTitle || '').trim()
  const source = notes.find((n) => n.title === sourceTitle) || notes.find((n) => sourceTitle && n.title.includes(sourceTitle))

  return {
    id: `q${Date.now()}-${index}`,
    type,
    stem,
    options,
    answer,
    explanation: explanation || '（这次没有生成讲解）',
    sourceTitle: sourceTitle || source?.title,
    sourceId: source?.id,
  }
}

/* ------------------------------ 批改主观题 ------------------------------ */

export async function gradeOpenAnswer(
  apiKey: string,
  model: string,
  question: Question,
  userAnswer: string,
): Promise<{ verdict: 'correct' | 'partial' | 'wrong'; feedback: string }> {
  const out = await chat(
    apiKey,
    model,
    [
      {
        role: 'system',
        content: `你是学术英语课的助教，批改学生的主观题作答。判断标准：意思对且语法正确才算对；意思对但有小语法错误算 partial。只输出 JSON：{"verdict":"correct|partial|wrong","feedback":"60字以内的中文点评，指出具体问题"}`,
      },
      {
        role: 'user',
        content: `题目：${question.stem}\n参考答案：${question.answer}\n学生作答：${userAnswer}`,
      },
    ],
    { json: true, temperature: 0.2, maxTokens: 400 },
  )

  const j = parseJson<{ verdict?: string; feedback?: string }>(out)
  const verdict = j.verdict === 'correct' || j.verdict === 'partial' || j.verdict === 'wrong' ? j.verdict : 'partial'
  return { verdict, feedback: String(j.feedback || '').trim() || '已批改。' }
}
