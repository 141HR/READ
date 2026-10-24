import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'public/samples/night-boat.epub');

const CSS = `
body { margin: 0; padding: 0; }
h2 { font-size: 1.45em; font-weight: 500; margin: 1.1em 0 1em; letter-spacing: 0.02em; }
p { margin: 0 0 0.95em; text-indent: 2em; }
figure { margin: 1.6em 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
figcaption { font-size: 0.82em; color: #7c6c56; margin-top: 0.6em; text-indent: 0; letter-spacing: 0.08em; }
blockquote { margin: 1.5em 0; padding-left: 1em; border-left: 2px solid #c9bba3; color: #6b6154; }
blockquote p { text-indent: 0; }
a { color: #8a5424; text-decoration: none; }
.footnote { font-size: 0.85em; color: #6b6154; text-indent: 0; border-top: 1px solid #d8cbb4; padding-top: 0.8em; margin-top: 2.4em; }
.end { text-indent: 0; text-align: center; margin-top: 2.4em; color: #8c8271; letter-spacing: 0.3em; }
.cover { margin: 0; padding: 0; }
.cover img { width: 100%; height: auto; display: block; }
`;

const COVER = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect width="600" height="900" fill="#1F2A2E"/>
  <rect x="34" y="34" width="532" height="832" fill="none" stroke="#6E7F82" stroke-width="1"/>
  <circle cx="300" cy="300" r="86" fill="none" stroke="#C9A227" stroke-width="1.5" opacity="0.7"/>
  <path d="M120 640 Q300 700 480 640" fill="none" stroke="#C9A227" stroke-width="2"/>
  <path d="M180 600 Q300 650 420 600 L400 630 Q300 668 200 630 Z" fill="none" stroke="#C9A227" stroke-width="1.5"/>
  <path d="M230 600 Q300 545 370 600" fill="none" stroke="#C9A227" stroke-width="1.5"/>
  <text x="300" y="440" text-anchor="middle" font-family="Songti SC, SimSun, serif" font-size="72" fill="#F2E7D2" letter-spacing="16">夜行船</text>
  <text x="300" y="486" text-anchor="middle" font-family="Songti SC, SimSun, serif" font-size="16" fill="#9FB0B2" letter-spacing="8">一条江，八章夜色</text>
  <text x="300" y="800" text-anchor="middle" font-family="Georgia, serif" font-size="10" fill="#6E7F82" letter-spacing="8">READ · SAMPLE</text>
</svg>`;

const BOAT = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300">
  <rect width="520" height="300" fill="#F6EFE2"/>
  <line x1="30" y1="120" x2="490" y2="120" stroke="#DCCBAC" stroke-width="1"/>
  <path d="M60 210 Q260 250 460 210" fill="none" stroke="#3A3025" stroke-width="1.5"/>
  <path d="M120 170 Q260 214 400 170 L378 202 Q260 236 142 202 Z" fill="#E9DCC4" stroke="#3A3025" stroke-width="1.5"/>
  <path d="M180 170 Q260 120 340 170" fill="none" stroke="#3A3025" stroke-width="1.5"/>
  <line x1="400" y1="120" x2="440" y2="230" stroke="#3A3025" stroke-width="2"/>
  <line x1="120" y1="238" x2="420" y2="238" stroke="#A9502C" stroke-width="1"/>
  <circle cx="96" cy="96" r="12" fill="none" stroke="#C9A227" stroke-width="1.5"/>
</svg>`;

const LANTERN = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="340" viewBox="0 0 520 340">
  <rect width="520" height="340" fill="#1F2A2E"/>
  <line x1="260" y1="40" x2="260" y2="300" stroke="#6E7F82" stroke-width="1.5"/>
  <circle cx="260" cy="132" r="52" fill="#C9A227" opacity="0.12"/>
  <rect x="236" y="104" width="48" height="56" rx="4" fill="none" stroke="#C9A227" stroke-width="1.5"/>
  <line x1="260" y1="104" x2="260" y2="92" stroke="#C9A227" stroke-width="1.5"/>
  <path d="M40 300 Q260 336 480 300" fill="none" stroke="#6E7F82" stroke-width="1"/>
  <line x1="60" y1="318" x2="460" y2="318" stroke="#C9A227" stroke-width="1" opacity="0.6"/>
</svg>`;

function page(title, blocks) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <h2>${title}</h2>
${blocks.join('\n')}
</body>
</html>`;
}

const chapters = [
  {
    file: 'ch1.xhtml',
    part: 0,
    title: '一 · 上船',
    blocks: [
      '<p>到渡口的时候，天已经黑透了。雨是下午开始下的，不大，但一直没有停，把石阶洗得发亮。江面上什么都没有，只有远处一盏灯，浮着，不动。</p>',
      '<p>船夫蹲在岸边抽烟，见我下来，把烟按在石头上，说，就你一个？我点头。他说，上来吧，今天水急，走得慢。</p>',
      '<p>船是乌篷船，中间一个矮棚，棚下铺着草席。我弯腰进去，头几乎碰到棚顶。船夫在后面撑了一篙，船身一沉，慢慢离了岸。</p>',
      '<figure><img src="images/boat.svg" alt="雨夜的乌篷船"/><figcaption>雨夜的乌篷船</figcaption></figure>',
      '<p>岸上的灯一盏一盏退后，最后只剩下一团模糊的黄。我掀开一点帘子，风灌进来，带着水草和柴油的味道。</p>',
      '<p>船夫说，睡吧，到地方我叫你。我说，睡不着。他笑了一声，说，那就看着。</p>',
    ],
  },
  {
    file: 'ch2.xhtml',
    part: 0,
    title: '二 · 雨里的灯',
    blocks: [
      '<p>江面比想象中宽。雨落在水上，没有声音，只有一层很细的白。</p>',
      '<p>走了大约一个时辰，前面出现一盏灯。不是岸上的灯，是挂在水中间的，一根竹竿挑着，随水晃。</p>',
      '<figure><img src="images/lantern.svg" alt="水中间的航标灯"/><figcaption>水中间的航标灯</figcaption></figure>',
      '<p>我问那是什么。船夫说，航标。这一段水下有礁，老辈子就立在那儿，换过很多次，位置没变过。</p>',
      '<p>灯光照过来的时候，我看见水里有一道黑影，很快地游过去，又不见了。船夫说，鱼。我说，那么大？他说，水下面的东西，看着都大。</p>',
      '<p>灯过去了。我回头看，它还在原地，一晃一晃，像一个不肯走的人。</p>',
    ],
  },
  {
    file: 'ch3.xhtml',
    part: 0,
    title: '三 · 船夫的话',
    blocks: [
      '<p>船夫五十来岁，手上的筋很粗。他说他撑了三十年船，这条江的每一块石头他都认得。</p>',
      '<p>我问他有没有见过翻船。他说见过两次。一次是涨水，一次是人自己不小心。</p>',
      '<p>他说，水不害人，人害人。你只要不跟它赌气，它就让你过去。<a href="#fn1" id="ref1">[1]</a></p>',
      '<p>我问他，那你怕不怕。他想了想，说，怕。不怕的人早就不在了。</p>',
      '<p>说完他就不说话了，只有篙子入水的声音，一下，又一下。</p>',
      '<p class="footnote" id="fn1">[1] 这句话我后来在很多地方听人说过，说的人大多没有撑过船。</p>',
    ],
  },
  {
    file: 'ch4.xhtml',
    part: 0,
    title: '四 · 一封没有地址的信',
    blocks: [
      '<p>我从包里把信拿出来。信封是牛皮纸的，边角磨白了，上面只写着一个名字，没有地址。</p>',
      '<p>这是祖父留下的。他去世前一年写好的，写完就放在抽屉里，谁也没寄。</p>',
      '<p>父亲说，别寄了，人都没了。我还是带着它上了船。</p>',
      '<p>船夫瞥了一眼，问，寄信？我说，不知道。他说，不知道还带着。我说，带着心里踏实。</p>',
      '<p>他没再问。我把信放回包里，忽然觉得它比来时轻了一点。</p>',
    ],
  },
  {
    file: 'ch5.xhtml',
    part: 1,
    title: '五 · 旧码头',
    blocks: [
      '<p>半夜的时候，船靠了一次岸。不是码头，是一段塌了的石阶。</p>',
      '<p>船夫说，加水。他提着一个塑料桶下去，消失在黑暗里。我坐在船上等，听见很远的狗叫。</p>',
      '<p>石阶上长满了草，缝里都是水。有一块碑，字已经看不清了，只能摸出几道刻痕。</p>',
      '<p>船夫回来的时候，桶里的水晃出来，打湿了他的裤脚。他说，这地方以前是个码头，热闹过。</p>',
      '<p>我问，后来呢。他说，公路修好了，就没人坐船了。</p>',
    ],
  },
  {
    file: 'ch6.xhtml',
    part: 1,
    title: '六 · 水下的城',
    blocks: [
      '<p>过了旧码头，水变得很静。船夫说，这下面有座城。</p>',
      '<p>我以为他开玩笑。他说，真的。几十年前修水库，淹了两个村子，房子都还在，只是在水底下。</p>',
      '<p>我说，那水清的时候能看见吗。他说，看不见，太深了。但是撑船的时候，能感觉到底下的东西——篙子下去，有时候会碰到硬的地方。</p>',
      '<p>我把手伸进水里。水很凉，什么也摸不到。</p>',
      '<p>船夫说，你别不信。有些东西沉下去了，不等于没有了。</p>',
    ],
  },
  {
    file: 'ch7.xhtml',
    part: 1,
    title: '七 · 天亮之前',
    blocks: [
      '<p>后半夜雨停了。云散开一点，露出几颗星。</p>',
      '<p>我靠在棚边，迷迷糊糊睡了一会儿。醒来的时候，天边有一道很淡的白。</p>',
      '<p>船夫在船头坐着，背对着我。他的蓑衣上全是水，一动，就往下滴。</p>',
      '<p>我问他，快到了吗。他说，快了，前面那个弯过去就是。</p>',
      '<p>我忽然有点不想到了。</p>',
    ],
  },
  {
    file: 'ch8.xhtml',
    part: 1,
    title: '八 · 下船',
    blocks: [
      '<p>天完全亮的时候，船靠了岸。码头是新的，水泥的，有几个早起的人在等货。</p>',
      '<p>我付了钱，船夫帮我把包递上来。他说，路上小心。我说，你也是。</p>',
      '<p>我走了几步，回头看他。他没有马上走，蹲在船头，点了一支烟。</p>',
      '<p>那封信还在包里。我最终没有寄出去。</p>',
      '<p>后来我想，有些信大概本来就不是用来寄的。它只是让你在某个夜里，愿意坐上一条船。</p>',
      '<p class="end">— 完 —</p>',
      '<p>如果你是从第一章翻到这里的，可以<a href="ch1.xhtml">回到开头</a>再看一遍。</p>',
    ],
  },
];

const parts = [
  { title: '上卷 · 夜航', from: 0, to: 3 },
  { title: '下卷 · 天明', from: 4, to: 7 },
];

function navList() {
  return parts
    .map((part) => {
      const items = chapters
        .slice(part.from, part.to + 1)
        .map((chapter) => `        <li><a href="${chapter.file}">${chapter.title}</a></li>`)
        .join('\n');
      return `    <li><span>${part.title}</span>\n      <ol>\n${items}\n      </ol>\n    </li>`;
    })
    .join('\n');
}

const manifestItems = chapters
  .map((chapter, index) => `    <item id="ch${index + 1}" href="${chapter.file}" media-type="application/xhtml+xml"/>`)
  .join('\n');

const spineItems = chapters.map((_, index) => `    <itemref idref="ch${index + 1}"/>`).join('\n');

const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:7d1f0a52-9c34-4f0e-8a51-2b6c9d4e8f10</dc:identifier>
    <dc:title>夜行船</dc:title>
    <dc:creator>示例作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:publisher>Read 示例</dc:publisher>
    <dc:description>一条江，八章夜色。用于体验分页、目录层级、插图与脚注的示例书。</dc:description>
    <meta property="dcterms:modified">2026-10-21T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="boat" href="images/boat.svg" media-type="image/svg+xml"/>
    <item id="lantern" href="images/lantern.svg" media-type="image/svg+xml"/>
${manifestItems}
  </manifest>
  <spine>
    <itemref idref="cover"/>
${spineItems}
  </spine>
</package>`;

const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>目录</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navList()}
    </ol>
  </nav>
</body>
</html>`;

const coverPage = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>封面</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body epub:type="cover"><div class="cover"><img src="cover.svg" alt="夜行船"/></div></body>
</html>`;

const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file(
  'META-INF/container.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
);

const oebps = zip.folder('OEBPS');
oebps.file('content.opf', opf);
oebps.file('nav.xhtml', nav);
oebps.file('style.css', CSS);
oebps.file('cover.svg', COVER);
oebps.file('cover.xhtml', coverPage);
oebps.folder('images').file('boat.svg', BOAT);
oebps.folder('images').file('lantern.svg', LANTERN);

for (const chapter of chapters) {
  oebps.file(chapter.file, page(chapter.title, chapter.blocks));
}

const buffer = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

await mkdir(resolve(process.cwd(), 'public/samples'), { recursive: true });
await writeFile(OUT, buffer);

const chars = chapters.reduce((sum, chapter) => sum + chapter.blocks.join('').replace(/<[^>]+>/g, '').length, 0);
console.log(`epub: ${OUT} (${(buffer.length / 1024).toFixed(1)} KB, ${chapters.length} 章, 约 ${chars} 字)`);
