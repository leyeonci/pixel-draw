# Bao 拼豆图纸对比

输入原图：`../../public/bao.jpg`。

使用 `liangdabiao/perler-beads-skill`（本地位置：`../../tools/skills/pindou-pattern`）生成，两版统一使用 48×48 网格、MARD 色号、Lab 颜色匹配、最多 16 色。两版均保留底色，没有启用白色留空；白色毛发仍按实体豆计算。

| 版本 | 图纸 | 用豆清单 | 用色 | 总豆数 |
| --- | --- | --- | --- | --- |
| 原图直转 | [PNG](bao-original-pattern.png) | [CSV](bao-original-beads.csv) | 16 | 2304 |
| AI 卡通化后转图 | [PNG](bao-cartoon-pattern.png) | [CSV](bao-cartoon-beads.csv) | 16 | 2304 |

图纸尺寸均为 1624×2076 像素，包含格内色号、行列坐标和用量统计。CSV 中的数量是图纸实际用量，未增加备货余量。色号以技能自带的色卡数据为准。

卡通版源图：[bao-cartoon.png](bao-cartoon.png)，通过内置 imagegen 编辑原图得到。AI 简化了毛发和背景，两版主体边界与构图可能有变化。图纸由脚本生成，画面效果交由用户比较。

## 重新生成

在项目根目录运行：

```powershell
node tools/skills/pindou-pattern/scripts/generate.js public/bao.jpg --size 48 --system MARD --match lab --max-colors 16 --title "Bao 原图直转" --watermark "48x48 / MARD / 16 colors" --out output/bao-comparison/bao-original-pattern.png --csv output/bao-comparison/bao-original-beads.csv
node tools/skills/pindou-pattern/scripts/generate.js output/bao-comparison/bao-cartoon.png --size 48 --system MARD --match lab --max-colors 16 --title "Bao 卡通化后转图" --watermark "48x48 / MARD / 16 colors" --out output/bao-comparison/bao-cartoon-pattern.png --csv output/bao-comparison/bao-cartoon-beads.csv
```

## 卡通化提示词

生成方式：内置 imagegen；编辑参考图为 `public/bao.jpg`。

```text
Use case: style-transfer. Edit target: the provided photo of a gray-and-white cat. Produce one square chibi cartoon / clean 16-bit pixel-art rendition suitable for subsequently converting into a 48x48 fuse-bead pattern. Preserve THIS cat's distinctive gray-and-white coat markings, huge dark round eyes, pink nose, face proportions and diagonally tilted head orientation; retain the close-up facial composition and both visible ears. Simplify fur into broad flat color clusters and a few clean shadow shapes; use restrained warm gray, cream-white, dark charcoal, muted pink, about 12-16 colors. Keep the cat recognizable from the reference, no new pose or other animal. Remove the tissue/plastic and background clutter, replace with solid pale warm ivory background. The cat's white fur should stay warm ivory, with visible gray outlines separating it from the backdrop. Crisp chunky pixel edges, no fine hair texture, no gradients, no text, no grid, no color codes, no watermark. Fill the square similarly to the original photo, without adding a body or accessories.
```
