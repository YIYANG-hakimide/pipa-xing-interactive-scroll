# 内容模型

## 《琵琶行》第一期范围

第一期只呈现正文，不展示序文。通用数据结构仍支持：

- 标题；
- 作者与朝代；
- 序文；
- 正文；
- 按叙事或音乐阶段划分的章节；
- 原文版本和校勘说明；
- 可选注音、译文和注释。

正文采用哪一版底本仍需在正式发布前校勘；底层数据模型保留序文字段，供其他作品或未来版本使用。

已确定的呈现规则：

- 正文全篇处于同一条连续横向长卷中；
- 古籍竖排，从右向左阅读；
- 每个文字列默认容纳两段原文，是巨型文字帘的一部分；
- 最后一行“座中泣下谁最多？江州司马青衫湿。”由曲终构图固定为两列展示；
- 不通过分页或章节切换截断全文；
- 章节信息只用于导航、环境变化和音乐提示。

## 数据结构

```ts
interface WorkDefinition {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  sourceEdition: string;
  preface?: TextBlock[];
  sections: WorkSection[];
  annotations?: Annotation[];
}

interface WorkSection {
  id: string;
  title?: string;
  lines: TextLine[];
  mood?: string;
  audioCue?: string;
}

interface TextLine {
  id: string;
  text: string;
}
```

## 数据要求

- 正文不得直接写在 Canvas 或页面组件里；
- 保留标点版本，同时允许生成无标点渲染版本；
- 每行使用稳定 ID，方便声音、动画和注释绑定；
- 原文数据与显示换行分离；
- 不以屏幕宽度修改原始文本；
- 后续可为每一行附加朗读时间轴和音色提示。

## 建议章节

第一版可以按体验节奏切为：

1. 江头送客；
2. 忽闻琵琶；
3. 琵琶声起；
4. 自叙身世；
5. 同是天涯；
6. 重闻此曲。

章节只是交互和视觉编排，不改变原文顺序。
