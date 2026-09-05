// CSS Custom Highlight API（spec §4b）：Highlight / HighlightRegistry / CSS.highlights
// 类型已内置于 lib.dom（TypeScript ≥ 6.0），无需全局 shim。
// 运行时守卫：Node / 旧 WebView 可能缺失 CSS.highlights，FindBar.tsx 中一律以可选链 `CSS.highlights?.` 访问。
export {}
