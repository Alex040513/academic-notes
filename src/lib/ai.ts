import type { Note, Question, QuestionType } from './types'

const ENDPOINT = 'https://api.deepseek.com/chat/completions'

export type AIErrorKind = 'no_key' | 'auth' | 'balance' | 'rate' | 'network' | 'bad_output' | 'unknown' | 'no_vision'

export class AIError extends Error {
  kind: AIErrorKind
  constructor(kind: AIErrorKind, message: string) {
    super(message)
    this.name = 'AIError'
    this.kind = kind
  }
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

type Message = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

/** 支持图片输入的模型 */
export const VISION_MODELS = ['deepseek-flash']
export function supportsVision(model: string): boolean {
  return VISION_MODELS.includes(model)
}

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
    if (res.status === 400 && /image|vision|multimodal/i.test(text)) {
      throw new AIError('no_vision', '当前模型看不了图片，去「设置」把模型换成 deepseek-flash 再试。')
    }
    if (res.status === 404) {
      throw new AIError('unknown', `模型名 ${model} 不可用，去「设置」里换一个模型。`)
    }
    throw new AIError('unknown', `AI 请求失败（${res.status}）${text.slice(0, 160)}`)
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

const STRUCTURE_SYSTEM = `你是一位善于整理笔记的学习助教。用户会把上课、读论文、做科研时随手记下的零散内容交给你，你要把它整理成一张日后能直接复习的卡片。

这些内容可能来自任何学科：外语、数学、物理、化学、生物、医学、计算机、经济、历史……

硬性要求：
1. 只整理用户给出的内容，不要自作主张补充他没提到的新知识。原文含糊或有笔误时，在「易混 / 易错点」里用一句话提醒，不要擅自改写结论。
2. 自动判断学科和语种，正文用与原文一致的语言书写（原文中文就用中文，原文英文就用英文）。
3. title 不超过 22 个字，必须具体到能看出考什么。禁止「笔记」「知识点」这类空泛标题。
4. body 用 markdown，固定这四个二级小节，顺序不变：
## 一句话结论
## 核心要点
## 例子
## 易混 / 易错点
   - 语言类学科的「例子」写例句并附中文说明；理科写典型例题、公式或应用场景；人文社科写具体案例。
   - 某一节确实没有内容就写「（无）」，不要硬凑。
5. 公式用 LaTeX：行内 $...$，独立成行 $$...$$。
6. 专业术语第一次出现时中英并列，例如「梯度（gradient）」；原文本身是英文则只写英文。
7. tags 给 3-5 个，每个 2-8 字，用该学科通用的短标签。
8. 只输出 JSON 对象，不要 markdown 代码块包裹，不要任何解释文字。

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

const QUIZ_SYSTEM = `你是一位经验丰富的大学助教，擅长根据材料给任何学科出练习题：语言、数学、物理、化学、生物、医学、计算机、经济、历史……

出题原则：
1. 严格依据给定材料，不引入材料之外的知识点。材料没讲的不要考。
2. 先判断学科，再按该学科的思维方式出题：
   - 语言类：语法、搭配、句法辨析、翻译
   - 理科 / 工科：概念理解、公式适用条件、计算、单位、推理漏洞
   - 医学 / 生物：机制、鉴别要点、因果链
   - 人文社科：概念区分、观点归属、论证结构
   - 编程：语义、边界条件、复杂度、调试
3. 题目要有区分度：既考记忆，也考理解和运用。干扰项要用学生真实会犯的错误，不要一眼假。
4. 讲解必须讲「为什么」，不能只重复答案。

题型规范：
- choice：单项选择题。options 必须正好 4 个且互不相同，answer 必须与其中某一个选项**完全一致**。
- blank：把材料里的关键结论、公式、术语或数据挖空，写成 ____。answer 是唯一正确答案（词、短语、公式或数值），不要出有多种答案的填空。
- correct：给出一段含有错误的表述 / 句子 / 推导 / 代码，answer 是改正后的完整版本。语言类用语法错误；理科学科用概念错误、单位错误或推理漏洞。
- translate：把内容换成另一种表述。语言类是中译英或英译中；其他学科是「用自己的话解释这个机制 / 定义 / 过程」。

讲解 explanation 要求（80-160 字）：
先说明正确答案的依据，再点出其他选项或常见错误错在哪里，最后一句以「考点：」开头点明考查点。

只输出 JSON 对象，不要 markdown 代码块，不要任何额外文字。JSON 结构：
{"questions":[{"type":"choice","stem":"题干","options":["选项A","选项B","选项C","选项D"],"answer":"与某一选项完全相同的字符串","explanation":"讲解","sourceTitle":"对应材料位置或笔记标题"}]}

blank / correct / translate 这三种题型不要输出 options 字段。`

export type QuizSource =
  | { kind: 'notes'; notes: Note[] }
  | { kind: 'material'; name: string; text: string; images?: string[] }

const MAX_MATERIAL_CHARS = 24_000

function buildNoteContext(notes: Note[], maxChars = 14_000): string {
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
  source: QuizSource,
  opts: { count: number; types: QuestionType[] },
): Promise<Question[]> {
  if (!opts.types.length) throw new AIError('bad_output', '至少选一种题型。')

  const asked = Math.min(30, Math.max(1, opts.count))
  const typeLine = `题型只能从这些里选：${opts.types.join('、')}。${
    opts.types.length > 1 ? '请把题型混合开，不要全部用同一种。' : ''
  }`

  const textParts: string[] = []
  const images: string[] = []

  if (source.kind === 'notes') {
    if (!source.notes.length) throw new AIError('bad_output', '没有可用的笔记，先记几个知识点再来出题。')
    textParts.push(
      `请依据下面这些知识卡片出 ${asked} 道题。${typeLine}`,
      '',
      '笔记：',
      buildNoteContext(source.notes),
    )
  } else if (source.images?.length) {
    images.push(...source.images)
    textParts.push(
      `请先仔细读图：图里可能是课程幻灯片、板书、讲义截图、题目或公式。读完图之后再出 ${asked} 道题。${typeLine}`,
      '只能依据图中真实出现的内容出题，图里看不清或没有的信息一律不要臆测。',
    )
    if (source.text.trim()) {
      textParts.push('', '另外补充一些从中整理出的文字（可能有 OCR 误差，以图片为准）：', source.text.slice(0, 8000))
    }
  } else {
    const truncated = source.text.length > MAX_MATERIAL_CHARS
    textParts.push(
      `请依据下面这份材料出 ${asked} 道题。${typeLine}`,
      `材料名称：${source.name}`,
      truncated ? `（材料较长，只截取了前 ${MAX_MATERIAL_CHARS} 字）` : '',
      '',
      source.text.slice(0, MAX_MATERIAL_CHARS),
    )
    if (!source.text.trim()) throw new AIError('bad_output', '这份材料里没读出文字，换一个文件试试。')
  }

  const textPrompt = textParts.filter(Boolean).join('\n')
  const userContent: string | ContentPart[] = images.length
    ? [{ type: 'text', text: textPrompt }, ...images.map<ContentPart>((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }))]
    : textPrompt

  const out = await chat(
    apiKey,
    model,
    [
      { role: 'system', content: QUIZ_SYSTEM },
      { role: 'user', content: userContent },
    ],
    { json: true, temperature: 0.8, maxTokens: 8192 },
  )

  const parsed = parseJson<{ questions?: unknown[] }>(out)
  const raw = Array.isArray(parsed.questions) ? parsed.questions : []
  const label = source.kind === 'notes' ? source.notes : []
  const questions = raw
    .map((q, i) => normalizeQuestion(q, i, label, source.kind === 'material' ? source.name : undefined))
    .filter((q): q is Question => q !== null)

  if (!questions.length) throw new AIError('bad_output', '这次没能生成有效题目，再点一次试试。')
  return questions.slice(0, asked)
}

function normalizeQuestion(q: unknown, index: number, notes: Note[], materialName?: string): Question | null {
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
    options = Array.from(new Set(options))
    if (options.length !== 4) return null
    if (!options.includes(answer)) {
      const idx = options.findIndex((x) => x.toLowerCase() === answer.toLowerCase())
      if (idx < 0) return null
      options[idx] = answer
    }
  }

  const sourceTitle = String(o.sourceTitle || '').trim()
  const source =
    notes.find((n) => n.title === sourceTitle) ||
    notes.find((n) => sourceTitle && n.title.includes(sourceTitle))

  return {
    id: `q${Date.now()}-${index}`,
    type,
    stem,
    options,
    answer,
    explanation: explanation || '（这次没有生成讲解）',
    sourceTitle: sourceTitle || source?.title || materialName,
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
        content: `你是一位大学助教，批改学生的主观题作答，学科不限。判断标准：意思对且表述正确才算对；意思对但有小错误算 partial。只输出 JSON：{"verdict":"correct|partial|wrong","feedback":"60 字以内的中文点评，指出具体问题"}`,
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
