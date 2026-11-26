# 学问 · 学术英语笔记

一个给自己用的知识点工具：**课上随手记 → 按遗忘曲线复习 → 让 AI 照着你的笔记出题、给讲解**。

没有服务器、没有数据库、没有注册。笔记就是你 GitHub 私有仓库里的一堆 Markdown 文件，AI 用你自己的 DeepSeek Key。

---

## 它长什么样

| 页面 | 干什么 |
| --- | --- |
| **今日** | 一个输入框，课上听到什么粘进来就存。点「AI 整理」能自动拆成「核心规则 / 例句 / 易混点」 |
| **知识库** | 所有知识点卡片，搜索、按标签和课程筛选、点开编辑 |
| **复习** | 按间隔重复排队，到期卡片推给你，三档评价（忘了 / 有点模糊 / 记得） |
| **出题** | 选范围 → AI 出题（单选、填空、改错、翻译）→ 交卷给正确率和逐题讲解，错题自动提前复习 |
| **设置** | 连接笔记仓库、填 DeepSeek Key、导出备份 |

## 架构（为什么不需要服务器）

```
浏览器（这个网页）
   ├── 读写的笔记 ──> 你的私有 GitHub 仓库（notes/*.md）
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

打开终端里提示的地址（默认 http://localhost:5173）。

## 二、发布到你自己的网址（约 5 分钟，免费）

> 这里的仓库放着**代码**，必须是 public（免费版 Pages 不支持私有仓库）。代码里没有任何笔记内容，不用担心。
> 你的**笔记**会放在另一个 private 仓库里。

1. 在 GitHub 新建一个 **public** 仓库，比如 `academic-english-notes`（不要勾选任何初始化文件）
2. 在本项目目录执行：

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/你的用户名/academic-english-notes.git
git push -u origin main
```

3. 打开仓库页面 → **Settings → Pages** → **Source** 选 **GitHub Actions**
4. 等 1 分钟左右，Actions 跑完，网址就是：

```
https://你的用户名.github.io/academic-english-notes/
```

以后你改了代码，只要 `git push`，网站会自动重新部署。

## 三、第一次打开时配置（约 2 分钟）

### 1. GitHub Token（用来读写你的笔记仓库）

1. 打开 <https://github.com/settings/personal-access-tokens/new>
2. **Repository access** 选 `All repositories`（这样应用能自动帮你建仓库）
3. **Permissions → Repository permissions**：
   - `Contents` → **Read and write**（必需）
   - `Administration` → **Read and write**（想让它自动建仓库才需要）
4. 生成后复制那串 Token（只显示一次）
5. 回到网页 → 设置 → 粘进去 → 仓库名随便起（默认 `academic-english-notes-data`）→ 点「连接」

应用会自动在 GitHub 上建一个 **private** 仓库，并开始同步。

### 2. DeepSeek Key（用来 AI 整理和出题）

1. 打开 <https://platform.deepseek.com/api_keys> 申请，充 10 元
2. 粘到设置页的「API Key」→ 点「测试 AI」

**成本参考**：一次出 8 道题大约几分钱；整理一条笔记更便宜。日常用一个月通常不超过 10 元。

### 3. 装到手机主屏幕

- iPhone Safari：分享按钮 → **添加到主屏幕**
- Android Chrome：右上角菜单 → **安装应用**

装完之后跟原生 App 一样全屏打开，上课点一下就能记。

---

## 数据存在哪 / 怎么备份

- 每条笔记 = 仓库里 `notes/` 下的一个 `.md` 文件，文件头是元信息（标签、复习日期等），正文是 Markdown
- 每次出题会在 `quizzes/` 下留一份记录
- 所有改动都是独立的 Git commit，**改错、误删都能在 GitHub 上回滚**
- 设置页可以「导出为 Markdown」，得到一个完整备份文件

不想用这个网页了？把仓库 clone 下来，笔记照样能用任何编辑器打开。

## 安全与隐私

- 笔记在**私有**仓库里，没有你的 Token 谁也读不到
- 网页本身是公开地址，但打开只会看到配置页
- Token 和 API Key 存在浏览器 localStorage：**别在公共电脑上登录**；手机丢了记得去 GitHub 撤销 Token
- 建议给 Token 设一个过期时间（90 天），到期重新生成即可

## 常见问题

**Q：换了电脑/手机，笔记还在吗？**
在。新设备打开同一个网址，填同一个 Token 就同步回来了。

**Q：显示「同步失败」怎么办？**
点一下重试。常见原因是 Token 过期、断网，或仓库名写错。设置页会显示具体原因。

**Q：能离线记吗？**
网页本身有离线缓存，但保存笔记需要联网写入 GitHub。断网时写的内容会留在输入框里（草稿自动保存），联网后再点保存。

**Q：笔记多了会不会慢？**
同步只拉取发生变化过的文件，几百条笔记通常一两秒内完成。

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS + React Router（Hash 路由，适配 GitHub Pages）+ marked / DOMPurify + DeepSeek API。PWA：manifest + Service Worker。

## 目录结构

```
src/
  lib/
    github.ts       GitHub Contents API 封装（读写 md、自动建仓）
    frontmatter.ts  .md 文件头的解析与序列化
    store.tsx       全局状态：同步、增删改、复习调度
    ai.ts           DeepSeek：整理笔记 / 出题 / 批改
    srs.ts          间隔重复算法（简化版 SM-2）
    demo.ts         演示模式样例数据
  pages/            今日 / 知识库 / 详情 / 复习 / 出题 / 设置
  components/       布局、通用组件、Markdown 渲染
```
