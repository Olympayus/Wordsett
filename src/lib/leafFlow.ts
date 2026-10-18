import { LEAF_FLOW_CONTAINER_KEYS } from './fieldKind'

/** 该容器是否走「一行多条」（v0.7.4 决定一）。
 *  判据只有一句：key 在不在名单里。**内容不再参与**——旧判据里的「≤ 40 字符」是
 *  「编辑后整块翻面」的根因（双击一个近义词改成 40 字以上，保存那一刻判据翻面、
 *  整块从多列退回逐行）；「全部是叶子」在那六个容器下永远为真（那些项不会有子项），
 *  是死代码。表外（含用户自建字段与辨析组）一律逐行。 */
export function isLeafFlow(containerKey: string | undefined): boolean {
  return containerKey !== undefined && LEAF_FLOW_CONTAINER_KEYS.includes(containerKey)
}
