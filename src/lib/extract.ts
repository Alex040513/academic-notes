import JSZip from 'jszip'

export type MaterialKind = 'pptx' | 'pdf' | 'docx' | 'text' | 'image'

export type Material = {
  name: string
  kind: MaterialKind
  /** 从文档里抽出来的文字（图片为空） */
  text: string
  /** 图片文件，交给视觉模型直接看图 */
  images: File[]
  /** 文档页数 / 幻灯片数，没有则为 0 */
  pages: number
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|heic)$/i

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name)
}

export function materialKind(file: File): MaterialKind | null {
  const n = file.name.toLowerCase()
  if (isImageFile(file)) return 'image'
  if (n.endsWith('.pptx')) return 'pptx'
  if (n.endsWith('.pdf')) return 'pdf'
  if (n.endsWith('.docx')) return 'docx'
  if (/\.(txt|md|markdown|csv|json)$/.test(n) || file.type.startsWith('text/')) return 'text'
  return null
}

export const ACCEPT_ATTR = '.pptx,.pdf,.docx,.txt,.md,.markdown,.csv,image/*'

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

function cleanLines(lines: string[]): string {
  return lines
    .map((l) => l.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** PPTX：每个 <a:p> 是一段，段落内的 <a:t> 是文字片段 */
async function extractPptx(file: File): Promise<{ text: string; pages: number }> {
  const zip = await JSZip.loadAsync(file)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)\.xml$/)?.[1] || 0)
      const nb = Number(b.match(/(\d+)\.xml$/)?.[1] || 0)
      return na - nb
    })

  const chunks: string[] = []
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.file(slideNames[i])!.async('string')
    const paragraphs = xml.split(/<a:p[\s>]/).slice(1)
    const lines = paragraphs
      .map((p) => [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(''))
      .filter((l) => l.trim())
    if (lines.length) chunks.push(`【第 ${i + 1} 页】\n${cleanLines(lines)}`)
  }
  return { text: chunks.join('\n\n'), pages: slideNames.length }
}

/** DOCX：按 <w:p> 分段，收集 <w:t> */
async function extractDocx(file: File): Promise<{ text: string; pages: number }> {
  const zip = await JSZip.loadAsync(file)
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('这个 .docx 里没有找到正文，可能文件已损坏')
  const xml = await entry.async('string')
  const paragraphs = xml.split(/<w:p[\s>]/).slice(1)
  const lines = paragraphs.map((p) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1])).join(''),
  )
  return { text: cleanLines(lines), pages: 0 }
}

/** PDF：用 pdf.js 逐页抽文字（扫描版 PDF 没有文字层，会抽不出来） */
async function extractPdf(file: File, onProgress?: (msg: string) => void): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  const chunks: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.(`解析第 ${i} / ${doc.numPages} 页…`)
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // 按 pdf.js 给的 hasEOL 还原换行，比全部拍平成一行好读
    let pageText = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      pageText += item.str
      pageText += item.hasEOL ? '\n' : ' '
    }
    const line = pageText
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim()
    if (line) chunks.push(`【第 ${i} 页】\n${line}`)
    page.cleanup()
  }
  const pages = doc.numPages
  await task.destroy()
  return { text: chunks.join('\n\n'), pages }
}

export async function readMaterial(file: File, onProgress?: (msg: string) => void): Promise<Material> {
  const kind = materialKind(file)
  if (!kind) {
    throw new Error('这个格式还不支持。可以用 PPTX / PDF / DOCX / TXT / MD 或图片。')
  }

  if (kind === 'image') {
    return { name: file.name, kind, text: '', images: [file], pages: 0 }
  }
  if (kind === 'text') {
    return { name: file.name, kind, text: await file.text(), images: [], pages: 0 }
  }

  onProgress?.(kind === 'pdf' ? '正在读取 PDF…' : '正在读取文档…')
  const res =
    kind === 'pptx' ? await extractPptx(file) : kind === 'docx' ? await extractDocx(file) : await extractPdf(file, onProgress)

  return { name: file.name, kind, text: res.text, images: [], pages: res.pages }
}

/**
 * 图片压到长边 1600px 再转 data URL：
 * 手机拍的照片动辄 5MB，压一下请求小、也更省钱，题目质量不受影响。
 */
export async function imageToDataUrl(file: File, maxSide = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    // 拿不到 canvas 就退回原图
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(file)
    })
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
