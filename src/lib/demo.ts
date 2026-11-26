import { addDays, applyGrade, dateStr, newReview } from './srs'
import type { Note } from './types'

/** 演示模式下用的样例数据，让用户不配置也能先看到完整界面 */
export function demoNotes(): Note[] {
  const make = (
    id: string,
    title: string,
    course: string,
    tags: string[],
    body: string,
    daysAgo: number,
    grade?: 'again' | 'hard' | 'good',
  ): Note => {
    const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    let review = newReview()
    if (grade) review = applyGrade(review, grade)
    if (daysAgo > 0) review = { ...review, due: addDays(dateStr(), daysAgo > 2 ? -1 : 0) }
    return {
      id,
      path: `notes/${id}-demo.md`,
      title,
      course,
      tags,
      body: body.trim(),
      created,
      updated: created,
      review,
    }
  }

  return [
    make(
      '1000000000001',
      'that 引导定语从句 vs 同位语从句',
      '学术英语',
      ['从句', 'that', '易混点'],
      `## 一句话结论
定语从句里的 that 在从句中**充当成分**；同位语从句里的 that **不充当任何成分**，只起连接作用。

## 核心规则
- 定语从句：that 指代先行词，在从句里作主语或宾语，因此去掉 that 后从句**结构不完整**。
- 同位语从句：that 只是引导词，去掉后从句**主谓宾齐全**，且只跟在 idea / fact / belief / evidence / conclusion 这类抽象名词后。

## 例句
- *The evidence **that** he presented was convincing.* — 定语从句，that 作 presented 的宾语，去掉就缺宾语。
- *The evidence **that** he was present is convincing.* — 同位语从句，that 不作成分，从句本身完整。

## 易混点
判断口诀：**把 that 去掉，看从句缺不缺成分**。缺 → 定语从句；不缺 → 同位语从句。
另一个信号：同位语从句前的名词多是"观点、事实、证据"类抽象名词。`,
      9,
      'hard',
    ),
    make(
      '1000000000002',
      '学术写作中的名词化（nominalization）',
      '学术英语',
      ['学术写作', '名词化'],
      `## 一句话结论
名词化是把动词或形容词变成名词，让句子更"学术"，但用多了会让文字变得沉重难读。

## 核心规则
- 动词 → 名词：*analyze → analysis*，*fail → failure*，*increase → increase*
- 形容词 → 名词：*accurate → accuracy*，*complex → complexity*
- 名词化适合**概括前文**，不适合**描述动作过程**。

## 例句
- 口语化：*We analyzed the data and found that...*
- 名词化：*The **analysis** of the data revealed that...*

## 易混点
一句话里出现三个以上 -tion 就要警惕了。学术写作的目标是清晰，不是把动词全部埋进名词里。`,
      6,
      'good',
    ),
    make(
      '1000000000003',
      '情态动词表推测的确定程度',
      '学术英语',
      ['情态动词', '推测'],
      `## 一句话结论
从确定到不确定：**must > should > may/might/could > can't**（否定方向相反）。

## 核心规则
- must：几乎可以肯定（基于证据的强推断）
- should：按常理应该如此
- may / might / could：有可能，程度依次略降
- can't / couldn't：几乎不可能是这样

## 例句
- *The results **must** be reliable — the sample size was large.*
- *The discrepancy **might** stem from a measurement error.*

## 易混点
must 表推测时**不能用于否定**。想说"肯定不是"，要用 can't，而不是 mustn't（mustn't 表示禁止）。`,
      3,
    ),
    make(
      '1000000000004',
      'suggest / recommend 后的虚拟语气',
      '学术英语',
      ['虚拟语气', '从句'],
      `## 一句话结论
suggest / recommend / propose / insist 等表示"建议、要求"的动词后，that 从句用 **(should) + 动词原形**。

## 核心规则
- 英式英语常用 should；美式英语常直接省略 should，只留动词原形。
- 主语是第三人称单数时也**不加 -s**，这是最容易错的地方。
- 同类名词 advice / suggestion / proposal 后的从句也一样。

## 例句
- *The committee suggested that the study **be** replicated.*（不是 is / was）
- *We recommend that each participant **complete** the survey twice.*

## 易混点
suggest 表示"暗示、表明"时**不用**虚拟语气：*The data suggests that the trend **is** rising.*`,
      1,
      'again',
    ),
    make(
      '1000000000005',
      '平行结构（parallelism）',
      '学术英语',
      ['学术写作', '平行结构'],
      `## 一句话结论
用 and / or / 逗号连接的一系列成分，必须保持**语法形式一致**。

## 核心规则
- 名词对名词，动名词对动名词，从句对从句。
- 常见破功点：列表里混用 -ing 形式和不定式。
- not only... but also、either... or、both... and 前后必须对称。

## 例句
- ❌ *The study aims to identify the cause, analyzing the data, and to propose solutions.*
- ✅ *The study aims **to identify** the cause, **to analyze** the data, and **to propose** solutions.*

## 易混点
长列表里第三个成分最容易变形。写完列表，把每个成分单独读一遍，看形式是否一致。`,
      0,
    ),
    make(
      '1000000000006',
      '悬垂修饰语（dangling modifier）',
      '学术英语',
      ['分词', '语法错误'],
      `## 一句话结论
句首的分词短语，其逻辑主语必须是**主句主语**，否则就叫悬垂。

## 核心规则
- 分词短语放句首时，读者会默认它的动作发出者是主句主语。
- 主句用被动语态时最容易出问题，因为真正的动作发出者没出现。

## 例句
- ❌ *Having collected the samples, the results were analyzed.*（结果是"收集样本"的人吗？）
- ✅ *Having collected the samples, **we** analyzed the results.*

## 易混点
改法有两种：把主句主语改成真正的动作发出者，或者把分词短语扩展成完整从句（*After we collected the samples, ...*）。`,
      4,
      'good',
    ),
  ]
}
