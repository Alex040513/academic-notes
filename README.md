# 学问 · 知识卡片

一个给自己用的学习工具：**随手记 → 按遗忘曲线复习 → 让 AI 照着你的笔记或课程材料出题、给讲解**。

学科不限：语言、数学、物理、化学、生物、医学、计算机、经济、历史……都能放进来。

没有服务器、没有数据库、没有注册。笔记就是你 GitHub 私有仓库里的一堆 Markdown 文件，AI 用你自己的 DeepSeek Key。

---

## 它长什么样

| 页面 | 干什么 |
| --- | --- |
| **今日** | 一个输入框，想到什么粘进来就存。点「AI 整理」能自动拆成「核心要点 / 例子 / 易混点」 |
| **知识库** | 所有知识点卡片，搜索、按标签和课程筛选、点开编辑 |
| **复习** | 按间隔重复排队，到期卡片推给你，三档评价（忘了 / 有点模糊 / 记得） |
| **出题** | 可以按笔记出，也可以**直接上传课程 PPT / PDF / Word / 图片**出题；交卷给正确率和逐题讲解，错题自动提前复习 |
| **设置** | 连接笔记仓库、填 DeepSeek Key、导出备份、查看 Token 到期时间 |

### 从材料出题

- **PPTX / PDF / DOCX / TXT / MD**：在浏览器里直接抽出文字（不花钱、不上传服务器），可以先看/改提取结果再出题
- **图片**（幻灯片拍照、板书、题目截图）：交给 `deepseek-flash` 直接看图出题，最多 6 张
- 材料只用于这一次出题，不会存进仓库

## 架构（为什么不需要服务器）

```
浏览器（这个网页）
   ├── 读写的笔记 ──> 你的私有 GitHub 仓库（notes/*.md）
   ├── 文档解析   ──> 完全在本机完成（JSZip / pdf.js）
   └── AI 请求   ──> api.deepseek.com（直连，支持跨域）
```

网页本身作为静态文件托管在 GitHub Pages，电脑关机也能打开。
GitHub Token 和 DeepSeek Key 只存在你**这台设备的浏览器**里（localStorage），不会上传到别处。

---

## 一、本地跑起来

```bash
npm install
npm run dev
```

## 二、发布到你自己的网址（约 5 分钟，免费）

> 放代码的仓库必须是 **public**（免费版 Pages 不支持私有仓库），代码里没有任何笔记内容。
> 笔记放在另一个 **private** 仓库里。

1. 在 GitHub 新建一个 **public** 仓库，比如 `academic-notes`
2. 在本项目目录执行：

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/你的用户名/academic-notes.git
git push -u origin main
```

3. 构建并把网页推到 `gh-pages` 分支：

```bash
npm run build
rm -rf /tmp/ghp && mkdir -p /tmp/ghp && cp -R dist/. /tmp/ghp/ && touch /tmp/ghp/.nojekyll
cd /tmp/ghp && git init -q -b gh-pages && git add -A \
  && git commit -q -m "deploy" \
  && git remote add origin https://github.com/你的用户名/academic-notes.git \
  && git push -u origin gh-pages --force
```

4. 仓库 → **Settings → Pages** → Source 选 **Deploy from a branch** → Branch 选 **`gh-pages`** / **`/ (root)`** → Save
5. 等一分钟，网址是 `https://你的用户名.github.io/academic-notes/`

以后**只改笔记内容不需要重新部署**（笔记是实时写数据仓库的）；改了代码才需要重跑第 3 步。

> 如果想 `git push` 自动部署，可以改用 `.github/workflows/deploy.yml`，但 Token 需要额外的 `Workflows: Read and write` 权限。

## 三、第一次打开时配置（约 2 分钟）

### 1. GitHub Token —— 它是干什么的？

网站没有服务器，笔记存进**你自己**的 GitHub 私有仓库，Token 就是那把只能读写这个仓库的钥匙。

1. 打开 <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** 选 `All repositories`（这样应用能自动建仓库）
3. **Permissions → Repository permissions**：
   - `Contents` → **Read and write**（必需）
   - `Administration` → **Read and write**（想让它自动建仓库才需要）
4. 生成后复制（只显示一次），粘进设置页，仓库名随便起，点「连接」

**到期提醒**：Token 有有效期（建议 90 天）。应用会从 GitHub 的响应头里自动读出到期时间，在首页和设置页提醒你续期；过期后同步会失败，重新生成一个贴进来就行，笔记不会丢。

### 2. DeepSeek Key

1. 打开 <https://platform.deepseek.com/api_keys> 申请，充 10 元
2. 粘到设置页 → 点「测试 AI」

模型选 `deepseek-flash`：便宜、快，**而且只有它能读图片**；`deepseek-v4-pro` 推理更强但看不了图。

一次出 8 道题大约几分钱，解析 PPT 是本地完成不花钱。

### 3. 装到手机主屏幕

- iPhone Safari：分享 → **添加到主屏幕**
- Android Chrome：菜单 → **安装应用**

---

## 数据存在哪 / 怎么备份

- 每条笔记 = 仓库里 `notes/` 下的一个 `.md` 文件，文件头是元信息（标签、复习日期等）
- 每次出题在 `quizzes/` 下留一份记录
- 所有改动都是独立 commit，**改错、误删都能在 GitHub 上回滚**
- 设置页可以「导出为 Markdown」

## 安全与隐私

- 笔记在**私有**仓库里，没有你的 Token 谁也读不到
- 网页本身是公开地址，但打开只会看到配置页
- Token 和 API Key 存在浏览器 localStorage：别在公共电脑上登录；手机丢了记得去 GitHub 撤销 Token
- 上传的 PPT/PDF 只在你浏览器里解析，不会上传到任何服务器（图片会发给 DeepSeek 用于出题）

## 常见问题

**Q：换了电脑/手机，笔记还在吗？**
在。新设备打开同一个网址，填同一个 Token 就同步回来。

**Q：扫描版 PDF 读不出文字？**
扫描件没有文字层。可以截图后用图片方式上传，让 AI 直接看图。

**Q：显示「同步失败」？**
点一下重试。常见原因是 Token 过期、断网或仓库名写错，设置页会显示具体原因。

**Q：笔记多了会不会慢？**
同步只拉取发生变化的文件，几百条笔记通常一两秒。

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS + React Router（Hash 路由，适配 GitHub Pages）+ marked / DOMPurify + JSZip（PPTX/DOCX）+ pdf.js（PDF）+ DeepSeek API。PWA：manifest + Service Worker。

## 目录结构

```
src/
  lib/
    github.ts       GitHub Contents API 封装（读写 md、自动建仓、Token 到期读取）
    frontmatter.ts  .md 文件头的解析与序列化
    store.tsx       全局状态：同步、增删改、复习调度
    ai.ts           DeepSeek：整理笔记 / 出题（含图片）/ 批改
    extract.ts      PPTX / DOCX / PDF 文字抽取 + 图片压缩
    srs.ts          间隔重复算法（简化版 SM-2）
    demo.ts         演示模式样例数据
  pages/            今日 / 知识库 / 详情 / 复习 / 出题 / 设置
  components/       布局、通用组件、Markdown 渲染
```
