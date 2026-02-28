# OFD 标准对比分析文档

> 基于 GB/T 33190-2016《电子文件存储与交换格式 版式文档》与 ofd.js 源码的逐章对比分析。
>
> 最后更新：2026-02-27

---

## 目录

- [1. 已实现功能对照表](#1-已实现功能对照表)
- [2. 未实现/缺失功能清单](#2-未实现缺失功能清单)
  - [2.1 高优先级](#21-高优先级)
  - [2.2 中优先级](#22-中优先级)
  - [2.3 低优先级](#23-低优先级)
- [3. 已知 Bug 和代码问题](#3-已知-bug-和代码问题)
- [4. 总体评估](#4-总体评估)
- [5. 后续实施路线图](#5-后续实施路线图)

---

## 1. 已实现功能对照表

### 第 6 章：文件结构

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 6.1 容器 | ZIP 解压 | **完整** | `ofd_parser.js:28` `unzipOfd()` | 使用 jszip 库 |
| 6.2 文件组织 | 文件路径解析 | **完整** | `ofd_parser.js` 各函数 | 支持相对/绝对路径 |

### 第 7 章：基本结构

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 7.4 主入口 | OFD.xml 解析 | **完整** | `ofd_parser.js:39` `getDocRoots()` | 支持多文档包 |
| 7.5 文档根节点 | Document.xml 解析 | **完整** | `ofd_parser.js:102` `getDocument()` | — |
| 7.5 CommonData | 公共数据 | **部分** | `ofd_parser.js:102` | 解析 PageArea/PublicRes/DocumentRes/TemplatePage；不解析 MaxUnitID/VPreferences |
| 7.5 DocInfo | 元数据 | **完整** | `ofd_parser.js` `doGetDocRoot()` | 从 DocBody 解析 DocInfo，通过 `docMeta.docInfo` 访问 |
| 7.5 权限声明 | Permissions | **缺失** | — | — |
| 7.5 VPreferences | 浏览偏好 | **缺失** | — | PageMode/PageLayout/ZoomMode |
| 7.5 书签 | Bookmarks | **完整** | `ofd_parser.js` `parseBookmarks()` | 通过 `docMeta.bookmarks` 访问 |
| 7.6 页面树 | Pages/Page | **完整** | `ofd_parser.js:217` `getPage()` | 支持多页 |
| 7.7 页面对象 | Page 结构 | **完整** | `ofd_parser.js:324` `parsePage()` | 支持 Template 引用、Content/Layer、Area |
| 7.7 模板页 | TemplatePage | **完整** | `ofd_parser.js:203` `getTemplatePage()` | 支持多模板页（PR #113 修复） |
| 7.7 层 | Layer | **完整** | `ofd_render.js` `renderLayer()` + `sortLayersByTypeAndZOrder()` | 区分 Background/Body/Foreground 类型，按 ZOrder 排序 |
| 7.7 页面区域 | PhysicalBox/ApplicationBox/ContentBox | **完整** | `ofd_render.js:44` `calPageBox()` | 按优先级选择：Physical > Application > Content |
| 7.8 大纲 | Outlines | **完整** | `ofd_parser.js` `parseOutlines()` | 支持递归嵌套，通过 `docMeta.outlines` 访问 |
| 7.9 资源 | Font/DrawParam/MultiMedia | **完整** | `ofd_parser.js:249-322` | 三个独立解析函数 |

### 第 8 章：页面描述

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 8.1.5 变换矩阵 | CTM | **完整** | `ofd_util.js:306` `parseCtm()` | 文本和路径对象均支持 `matrix()` 变换 |
| 8.2 绘制参数 | DrawParam | **完整** | `ofd_parser.js` `getDrawParam()` + `ofd_render.js` | 支持 LineWidth/FillColor/StrokeColor/Relative/Join/Cap/DashPattern/MiterLimit |
| 8.3.2 基本颜色 | RGB 颜色 | **完整** | `ofd_util.js` `parseColor()` | 支持 `R G B`、`#RRGGBB`、CMYK、灰度格式 |
| 8.3.2 颜色 Alpha | 透明度 | **完整** | `ofd_render.js` | TextObject 和 PathObject 均支持 Alpha |
| 8.3.1 色彩空间 | ColorSpace | **完整** | `ofd_util.js` `parseColor()` | 支持 sRGB/HEX/CMYK/灰度 |
| 8.3.3 底纹 | Pattern | **完整** | `ofd_render.js` `parseColorOrGradient()` | 支持平铺底纹（`ofd:Pattern`），含 ReflectMethod 翻转 |
| 8.3.4 渐变 | Axial/Radial | **完整** | `ofd_render.js` `parseColorOrGradient()` | 支持轴向渐变和径向渐变 |
| 8.4 裁剪区域 | Clips | **完整** | `ofd_render.js` `applyClips()` | 支持 ClipArea/Path/CTM |
| 8.5 图元通用属性 | Visible/Name/Actions | **缺失** | — | — |

### 第 9 章：图形

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 9.1 路径对象 | PathObject | **完整** | `ofd_render.js` `renderPathObject()` | 支持所有算子、填充规则、渐变、裁剪 |
| 9 缩略数据 | AbbreviatedData | **完整** | `ofd_util.js` `convertPathAbbreviatedDatatoPoint()` | 支持 S/M/L/B/C/Q/A 全部算子 |
| 9.2 填充规则 | NonZero/Even-Odd | **完整** | `ofd_render.js` `renderPathObject()` | 通过 `fill-rule` 属性实现 |
| 9.3 非缩略描述 | Subpath XML | **完整** | `ofd_util.js` `convertXmlSubpathToPoints()` | 当 AbbreviatedData 缺失时回退到 XML Subpath 解析 |

### 第 10 章：图像

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 10 图像对象 | ImageObject | **完整** | `ofd_render.js:294` | 支持常规图片和 JBIG2 格式 |
| 10 图像掩模 | ImageMask | **完整** | `ofd_render.js` `renderImageMask()` | 使用 SVG mask 实现 stencil masking，FillColor 着色 |
| 10 替代图 | Substitution | **完整** | `ofd_render.js` `renderImageObject()` | 主资源不可用时自动回退到替代资源 |
| 10 边框 | Border | **完整** | `ofd_render.js` `renderImageObject()` | 支持 LineWidth 和 BorderColor |
| 10 CTM/Alpha | 图像变换/透明度 | **完整** | `ofd_render.js` `renderImageObject()` | 支持 CTM matrix 变换和 Alpha 透明度 |

### 第 11 章：文字

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 11.1 字体 | Font | **完整** | `ofd_util.js` `getFontFamily()` | 支持 30+ 字体映射（方正/华文/微软雅黑等）+ 嵌入字体 |
| 11.2 文本对象 | TextObject | **完整** | `ofd_render.js` `renderTextObject()` | 支持 Stroke/Italic/Weight/ReadDirection/CharDirection/HScale |
| 11.3 文本定位 | DeltaX/DeltaY | **完整** | `ofd_util.js` `calTextPoint()` | 支持 `g` 压缩格式，每字符独立定位 |
| 11.4 字形变换 | CGTransform | **完整** | `ofd_render.js` `renderTextWithCGTransform()` | 通过 opentype.js 解析嵌入字体，按字形索引渲染为 SVG path；支持 1:1/连字/分解映射 |

### 第 15 章：注释

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 15 注释 | Annotations | **完整** | `ofd_parser.js:124` + `ofd_render.js:187` | 解析和渲染均支持 |

### 第 18 章：数字签名

| 标准章节 | 功能 | 状态 | 代码位置 | 备注 |
|---------|------|------|---------|------|
| 18 数字签名 | Signatures | **完整** | `ofd_parser.js:335` + `ses_signature_parser.js` | 支持 SES V1 和 V4 格式 |
| 18 签名验证 | Verify | **完整** | `verify_signature_util.js` | 支持 SM2/SM3/RSA/MD5/SHA1 |

### 公开 API (`ofd.js`)

| 函数 | 说明 |
|------|------|
| `parseOfdDocument(options)` | 解析 OFD 文件（支持 File/ArrayBuffer/URL），结果包含 `docMeta` |
| `renderOfd(screenWidth, ofd)` | 按屏幕宽度缩放渲染所有页面 |
| `renderOfdByScale(ofd)` | 按原始比例渲染 |
| `digestCheck(options)` | 验签 |
| `setPageScale(scale)` | 设置缩放比例 |
| `getPageScale()` | 获取当前缩放比例 |
| `extractAttachment(ofd, attachment)` | 从已解析的 OFD 中提取附件二进制数据（返回 Uint8Array） |
| `pushScaleContext()` | 保存当前缩放上下文到栈（用于并发渲染隔离） |
| `popScaleContext()` | 恢复之前保存的缩放上下文 |
| `calPageBox` | re-export，计算页面尺寸 |
| `calPageBoxScale` | re-export，计算原始比例页面尺寸 |
| `renderPage` | re-export，渲染单页 |

**`docMeta` 结构说明（通过 `ofd.docMeta` 访问）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `docInfo` | Object | 文档元数据（Title/Author/Subject/CreationDate 等） |
| `outlines` | Array | 大纲树（递归结构，含 title/actions/children） |
| `bookmarks` | Array | 书签列表（含 name/pageId/left/top） |
| `attachments` | Array | 附件列表（含 id/name/format/size/fileLoc） |

---

## 2. 未实现/缺失功能清单

### 2.1 高优先级 ✅ 全部已完成

> 影响常见文档（电子发票、公文）的正常渲染。**已在第一批全部修复。**

| # | 功能 | 状态 |
|---|------|------|
| ~~H1~~ | Q 算子（二次贝塞尔曲线） | ✅ 已实现 |
| ~~H2~~ | A 算子（圆弧） | ✅ 已实现 |
| ~~H3~~ | 填充规则 NonZero/Even-Odd | ✅ 已实现 |
| ~~H4~~ | PathObject Alpha 透明度 | ✅ 已实现 |
| ~~H5~~ | 裁剪区域 Clips | ✅ 已实现 |
| ~~H6~~ | Layer 类型（Body/FG/BG）渲染顺序 | ✅ 已实现 |
| ~~H7~~ | ZOrder 排序 | ✅ 已实现 |
| ~~H8~~ | 文本描边 Text Stroke | ✅ 已修复 |
| ~~H9~~ | ReadDirection/CharDirection | ✅ 已实现 |

### 2.2 中优先级 — 大部分已完成

> 影响特定场景或较复杂文档的渲染质量。

| # | 功能 | 状态 |
|---|------|------|
| ~~M1~~ | Join/Cap/DashPattern/MiterLimit | ✅ 已实现 |
| ~~M2~~ | CMYK/灰度色彩空间 | ✅ 已实现 |
| ~~M3~~ | Pattern（平铺底纹） | ✅ 已实现 |
| ~~M4~~ | Axial/Radial 渐变 | ✅ 已实现 |
| ~~M5~~ | ImageMask/Substitution | ✅ 已实现 |
| ~~M6~~ | 嵌入字体（FontFile） | ✅ 已实现 |
| ~~M7~~ | CGTransform 字形变换 | ✅ 已实现 |
| ~~M8~~ | Subpath XML 非缩略描述 | ✅ 已实现 |
| ~~M9~~ | ImageObject CTM/Alpha | ✅ 已实现 |

### 2.3 低优先级

> 高级功能，大多数常见文档不涉及。

| # | 标准章节 | 功能 | 状态 |
|---|---------|------|------|
| ~~L1~~ | 7.5 DocInfo | 文档元数据（Title/Author/Subject 等） | ✅ 已实现 |
| L2 | 7.5 Permissions | 权限声明（Edit/Print/Annot/Export） | 未实现 |
| L3 | 7.5 VPreferences | 浏览偏好（PageMode/PageLayout/ZoomMode） | 未实现 |
| ~~L4~~ | 7.5 Bookmarks | 书签 | ✅ 已实现 |
| ~~L5~~ | 7.8 Outlines | 大纲（目录） | ✅ 已实现 |
| ~~L6~~ | 7.5 Actions | 动作（URI 链接/页面跳转） | ✅ 已实现（注释 URI/Goto） |
| L7 | 12 视频 | 视频对象 | 未实现 |
| L8 | 13 复合对象 | CompositeObject | 未实现 |
| L9 | 14 动作 | 14.1-14.6 各类动作定义 | 未实现 |
| L10 | 16 自定义标引 | CustomTags | 未实现 |
| L11 | 17 扩展信息 | Extensions | 未实现 |
| L12 | 19 版本 | Versions | 未实现 |
| ~~L13~~ | 20 附件 | Attachments | ✅ 已实现 |
| L14 | 8.5 图元通用属性 | Visible/Name/Actions 等 | 未实现 |

---

## 3. 已知 Bug 和代码问题

### ~~Bug 1：文本描边被覆盖（严重）~~ ✅ 已修复

**位置：** `ofd_render.js` `renderTextObject()`

已正确区分 `fill` 和 `stroke` 属性，StrokeColor 通过 `@_Stroke` 属性控制。

### ~~Bug 2：async-in-forEach 异步问题（严重）~~ ✅ 已修复

**位置：** `ofd_parser.js` `getSignatureData()`

已将 `forEach` + `async` 替换为 `for...of` 循环，确保所有文件数据在使用前加载完毕。

### ~~Bug 3：文本字符合并丢失间距~~ ✅ 已修复

**位置：** `ofd_util.js` `calTextPoint()` + `ofd_render.js` `renderTextObject()`

`calTextPoint` 的 `x` 改为数组存储每个字符的独立坐标；渲染时使用 SVG `<text x="x1 x2 x3">` 多值定位语法，保留所有 DeltaX 间距信息。

### ~~Bug 4：RSA 签名算法硬编码为 SHA1~~ ✅ 已修复

**位置：** `verify_signature_util.js` `SES_Signature_Verify()`

通过 OID 映射表自动识别 RSA 签名算法（SHA1/SHA224/SHA256/SHA384/SHA512），不再硬编码为 SHA1withRSA。

### ~~Bug 5：SM2 userId 硬编码~~ ✅ 已修复

**位置：** `verify_signature_util.js` `SES_Signature_Verify()`

`userId` 改为可选参数传入，默认值仍为 GM/T 0009 标准规定的 `"1234567812345678"`。

### ~~Bug 6：SHA-256/SHA-512 摘要不支持~~ ✅ 已修复

**位置：** `verify_signature_util.js` `digestByteArray()`

新增 SHA-256（OID: 2.16.840.1.101.3.4.2.1）和 SHA-512（OID: 2.16.840.1.101.3.4.2.3）支持，利用 jsrsasign 内置哈希实现。不支持的算法改为返回 `false` 并输出警告。

### ~~Bug 7：签名路径硬编码~~ ✅ 已修复

**位置：** `ofd_parser.js` `getSignature()`

不再硬编码 `'Signs/'` 前缀，改为从 Signatures.xml 的实际路径推导基目录，正确解析相对路径。

### ~~Bug 8：Annotation pfIndex 始终为 undefined~~ ✅ 已修复

**位置：** `ofd_parser.js` `getAnnotations()` + `ofd_render.js` `renderAnnotation()`

解析阶段使用注释在数组中的索引赋值 `pfIndex`；渲染阶段增加 null 检查，`pfIndex` 缺失时回退为 0。

### 代码质量问题

| 问题 | 状态 | 说明 |
|------|------|------|
| ~~全局状态污染~~ | ✅ 已改进 | 新增 `pushScaleContext()`/`popScaleContext()` 上下文栈隔离机制，`renderOfd`/`renderOfdByScale` 自动使用 |
| ~~残留标志位~~ | ✅ 已移除 | `global.xmlParseFlag` 已删除 |
| ~~命名不一致~~ | ✅ 已修复 | 新增 `setPageScale`/`getPageScale`/`setMaxPageScale` 正确拼写别名 |
| ~~字体映射不完整~~ | ✅ 已扩充 | 从 12 个扩充到 30+ 个字体映射（方正/华文/微软雅黑/英文字体等） |
| ~~DPI 转换冗余~~ | ✅ 已简化 | `converterDpi(mm)` 直接返回 `mm * Scale` |

---

## 4. 总体评估

ofd.js 已实现 GB/T 33190-2016 标准的**绝大部分功能**，覆盖完整的渲染管线（解压 → 解析 → 渲染）、三种基本图元（文本/路径/图像）的全特性渲染、模板页、注释、数字签名、文档元数据、大纲、书签和附件。能够**高质量渲染绝大多数 OFD 文件**，包括电子发票、公文和复杂排版文档。

**剩余未实现/部分实现功能**：

1. ~~**CGTransform 字形变换**（M7）~~ — ✅ 已实现
2. ~~**图像掩模/替代图**（M5）~~ — ✅ 已实现
3. **低频高级特性** — 权限声明、浏览偏好、视频对象、复合对象、版本管理等
4. **完整动作定义** — 当前仅支持注释 URI/Goto，不支持 14.1-14.6 全部动作类型

---

## 5. 后续实施路线图

### 第一批：修复核心渲染 Bug（高优先级） ✅ 已完成

| 任务 | 状态 |
|------|------|
| 修复文本 Stroke 属性覆盖（Bug 1, H8） | ✅ |
| 实现路径 A 圆弧 + Q 二次贝塞尔算子（H1, H2） | ✅ |
| 实现路径填充规则 fill-rule（H3） | ✅ |
| PathObject Alpha 透明度（H4） | ✅ |
| Layer 类型 Body/FG/BG 渲染顺序（H6） | ✅ |
| ZOrder 排序（H7） | ✅ |

### 第二批：完善绘制参数和裁剪 ✅ 已完成

| 任务 | 状态 |
|------|------|
| DrawParam 支持 Join/Cap/DashPattern/MiterLimit（M1） | ✅ |
| 裁剪区域 Clips（H5） | ✅ |
| 文本阅读方向 ReadDirection/CharDirection（H9） | ✅ |
| ImageObject CTM 和 Alpha（M9） | ✅ |

### 第三批：增强颜色和字体系统 ✅ 已完成

| 任务 | 状态 |
|------|------|
| CMYK/灰度色彩空间（M2） | ✅ |
| Axial/Radial 渐变（M4） | ✅ |
| Pattern 底纹（M3） | ✅ |
| 嵌入字体 FontFile（M6） | ✅ |
| CGTransform 字形变换（M7） | ✅ 已完成 |

### 第四批：修复验签和异步问题 ✅ 已完成

| 任务 | 关联问题 | 涉及文件 | 状态 |
|------|---------|---------|--------|
| 修复 async-in-forEach 异步 Bug | Bug 2 | `ofd_parser.js` | ✅ 已完成 |
| 支持 SHA-256/SHA-512 摘要算法 | Bug 6 | `verify_signature_util.js` | ✅ 已完成 |
| 修复 RSA 签名算法硬编码 | Bug 4 | `verify_signature_util.js` | ✅ 已完成 |
| 修复 SM2 userId 硬编码 | Bug 5 | `verify_signature_util.js` | ✅ 已完成 |
| 修复签名路径硬编码 | Bug 7 | `ofd_parser.js` | ✅ 已完成 |
| 修复 Annotation pfIndex 未赋值 | Bug 8 | `ofd_parser.js` | ✅ 已完成 |

### 第五批：辅助功能和高级特性 ✅ 已完成

| 任务 | 关联问题 | 涉及文件 | 状态 |
|------|---------|---------|--------|
| XML 格式路径描述支持 | M8 | `ofd_util.js`, `ofd_render.js` | ✅ 已完成 |
| 图像边框 Border/ImageMask/Substitution | M5 | `ofd_render.js` | ✅ 已完成 |
| 文档元数据解析 | L1 | `ofd_parser.js` | ✅ 已完成 |
| 大纲/书签 | L4, L5 | `ofd_parser.js` | ✅ 已完成 |
| 附件支持 | L13 | `ofd_parser.js`, `ofd.js` | ✅ 已完成 |
| 动作支持（URI/Goto） | L6 | `ofd_parser.js`, `ofd_render.js` | ✅ 已完成 |

### 代码质量改进 ✅ 已完成

| 任务 | 说明 | 状态 |
|------|------|------|
| 消除全局 Scale 状态 | 新增 `pushScaleContext()`/`popScaleContext()` 上下文栈，`renderOfd`/`renderOfdByScale` 自动隔离 | ✅ 已完成 |
| 清理 `global.xmlParseFlag` | 移除这个从未被读取的残留标志位 | ✅ 已完成 |
| 修复命名不一致 | 新增 `setPageScale`/`getPageScale` 正确拼写别名，保留旧名向后兼容 | ✅ 已完成 |
| 扩充字体映射表 | 新增 18 个常见中英文字体映射（方正系列、华文系列、微软雅黑等） | ✅ 已完成 |
| 简化 DPI 转换函数 | 消除冗余的 25.4 因子，`converterDpi(mm)` 直接返回 `mm * Scale` | ✅ 已完成 |

---

## 附录：关键文件索引

| 文件 | 路径 | 作用 |
|------|------|------|
| 公开 API | `src/utils/ofd/ofd.js` | 入口 API |
| 解析器 | `src/utils/ofd/ofd_parser.js` | ZIP 解压 + XML 解析 |
| 渲染器 | `src/utils/ofd/ofd_render.js` | DOM 渲染 |
| 工具函数 | `src/utils/ofd/ofd_util.js` | 坐标/颜色/字体等工具 |
| 管道 | `src/utils/ofd/pipeline.js` | 异步管道架构 |
| 签名解析 | `src/utils/ofd/ses_signature_parser.js` | ASN.1/SES 签名解码 |
| 签名验证 | `src/utils/ofd/verify_signature_util.js` | SM2/SM3/RSA 验证 |
| SM3 哈希 | `src/utils/ofd/sm3.js` | SM3 纯 JS 实现 |

---

## 附录：标准章节覆盖总览

| 章节 | 是否覆盖 | 说明 |
|------|---------|------|
| 第 1-4 章（范围/术语/缩略语） | N/A | 规范性说明，无需实现 |
| 第 5 章（概述） | N/A | 规范性说明 |
| 第 6 章（文件结构） | 完整 | ZIP 容器和文件组织 |
| 第 7 章（基本结构） | 完整 | 核心结构 + 大纲/书签/附件/元数据，仅缺浏览偏好/权限声明 |
| 第 8 章（页面描述） | 大部分 | CTM/DrawParam/颜色/渐变/Pattern底纹/裁剪已实现；缺少图元通用属性 |
| 第 9 章（图形） | 完整 | 支持所有算子（S/M/L/B/C/Q/A）+ XML Subpath + 填充规则 |
| 第 10 章（图像） | 完整 | 支持 CTM/Alpha/Border/ImageMask/Substitution |
| 第 11 章（文字） | 完整 | 方向控制 + 嵌入字体 + 每字符独立定位 + CGTransform 字形变换 |
| 第 12 章（视频） | 未实现 | — |
| 第 13 章（复合对象） | 未实现 | — |
| 第 14 章（动作） | 部分 | 支持注释上的 URI/Goto 动作 |
| 第 15 章（注释） | 完整 | 支持动作绑定 |
| 第 16 章（自定义标引） | 未实现 | — |
| 第 17 章（扩展信息） | 未实现 | — |
| 第 18 章（数字签名） | 完整 | 支持 V1/V4 格式，SHA-256/SHA-512 |
| 第 19 章（版本） | 未实现 | — |
| 第 20 章（附件） | 完整 | 支持附件列表解析和数据提取 |
