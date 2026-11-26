import type { Question } from './types'

/**
 * 演示模式专用：没有配 DeepSeek Key 时，用这套内置题目走一遍完整答题流程。
 * 题目内容和演示笔记对应，讲解也写全。
 */
export function demoQuestions(): Question[] {
  const now = Date.now()
  return [
    {
      id: `dq${now}-0`,
      type: 'choice',
      stem: '下面哪一句中的 that 引导的是同位语从句？',
      options: [
        'The evidence that he presented was convincing.',
        'The evidence that he was present is convincing.',
        'The book that I bought yesterday is useful.',
        'The method that we adopted worked well.',
      ],
      answer: 'The evidence that he was present is convincing.',
      explanation:
        '判断方法是把 that 去掉，看从句还完整不完整。第二句去掉 that 后 "he was present" 主谓齐全，that 不充当任何成分，所以是同位语从句；其余三句去掉 that 都会缺宾语，属于定语从句。考点：定语从句与同位语从句的区分。',
      sourceTitle: 'that 引导定语从句 vs 同位语从句',
      sourceId: '1000000000001',
    },
    {
      id: `dq${now}-1`,
      type: 'blank',
      stem: 'The committee suggested that the study ____ (be) replicated in a larger sample.',
      answer: 'be',
      explanation:
        'suggest 表示"建议"时，后面的 that 从句要用虚拟语气 (should) + 动词原形；美式英语里 should 通常省略，只留原形 be。即使主语是第三人称单数也不能写 is，更不能写 was。考点：suggest / recommend 后的虚拟语气。',
      sourceTitle: 'suggest / recommend 后的虚拟语气',
      sourceId: '1000000000004',
    },
    {
      id: `dq${now}-2`,
      type: 'correct',
      stem: 'Having collected the samples, the results were analyzed by the researchers.',
      answer: 'Having collected the samples, the researchers analyzed the results.',
      explanation:
        '句首分词短语的逻辑主语默认是主句主语。原句主句主语是 the results，结果把"结果"说成了收集样本的人，这就是悬垂修饰语。改法之一是把主句改成主动语态、让真正的动作发出者作主语；另一种是把分词扩展成从句：After the researchers collected the samples, the results were analyzed. 考点：分词构句与悬垂修饰语。',
      sourceTitle: '悬垂修饰语（dangling modifier）',
      sourceId: '1000000000006',
    },
    {
      id: `dq${now}-3`,
      type: 'choice',
      stem: 'Which sentence expresses the LOWEST degree of certainty?',
      options: [
        'The results must be reliable.',
        'The results should be reliable.',
        'The results might be reliable.',
        "The results can't be reliable.",
      ],
      answer: 'The results might be reliable.',
      explanation:
        '情态动词表推测的确定程度从高到低是 must > should > may/might/could。might 表示较小的可能性，是四个选项里最不确定的。注意 can\'t 在否定方向上表示"几乎不可能"，确定程度反而最高。考点：情态动词表推测的程度差异。',
      sourceTitle: '情态动词表推测的确定程度',
      sourceId: '1000000000003',
    },
    {
      id: `dq${now}-4`,
      type: 'translate',
      stem: '请译成英文，并注意使用平行结构：这项研究旨在识别成因、分析数据，并提出解决方案。',
      answer: 'This study aims to identify the causes, to analyze the data, and to propose solutions.',
      explanation:
        '中文并列的三个动作用英文表达时必须保持形式一致：三个不定式 to identify / to analyze / to propose 并列。如果写成 to identify, analyzing, and propose，就破坏了平行结构。也可以统一用动名词 aiming at identifying / analyzing / proposing。考点：平行结构。',
      sourceTitle: '平行结构（parallelism）',
      sourceId: '1000000000005',
    },
  ]
}
