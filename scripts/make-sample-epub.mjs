import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'public/samples/slow-reading.epub');

const CSS = `
body { margin: 0; padding: 0; }
h2 { font-size: 1.45em; font-weight: 500; margin: 1.1em 0 1em; letter-spacing: 0.02em; }
p { margin: 0 0 0.95em; text-indent: 2em; }
blockquote { margin: 1.5em 0; padding: 0 0 0 1em; border-left: 2px solid #c9bba3; color: #6b6154; }
blockquote p { text-indent: 0; }
a { color: #8a5424; text-decoration: none; border-bottom: 1px solid #c9bba3; }
.footnote { font-size: 0.85em; color: #6b6154; text-indent: 0; border-top: 1px solid #d8cbb4; padding-top: 0.8em; margin-top: 2.4em; }
.end { text-indent: 0; text-align: center; margin-top: 2.4em; color: #8c8271; letter-spacing: 0.3em; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; height: auto; }
`;

const COVER_SVG = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect width="600" height="900" fill="#E9E1D2"/>
  <rect x="34" y="34" width="532" height="832" fill="none" stroke="#B9AB93" stroke-width="1"/>
  <text x="300" y="300" text-anchor="middle" font-family="Songti SC, SimSun, serif" font-size="96" fill="#2B2620" letter-spacing="14">慢读</text>
  <line x1="248" y1="352" x2="352" y2="352" stroke="#A9502C" stroke-width="2"/>
  <text x="300" y="406" text-anchor="middle" font-family="Songti SC, SimSun, serif" font-size="21" fill="#6B6154" letter-spacing="7">关于阅读的四封信</text>
  <text x="300" y="806" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="#8C8271" letter-spacing="9">READ · SAMPLE</text>
</svg>`;

function page(title, paragraphs) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${title}</h2>
${paragraphs.join('\n')}
</body>
</html>`;
}

const chapters = [
  {
    file: 'ch1.xhtml',
    title: '第一封信：关于开头',
    body: [
      '<p>一本书的开头，往往是最容易被辜负的地方。</p>',
      '<p>我们在地铁上翻开它，在睡前翻开它，在等一杯咖啡的间隙翻开它。手指捻过扉页，眼睛扫过第一段，心里却在想别的事。于是那个开头就白白过去了——它本来是要跟你说话的。</p>',
      '<p>我后来学会了一个笨办法：把开头读三遍。第一遍读字，第二遍读句子之间的空隙，第三遍读自己。第三遍通常读不出什么，但你会知道，这本书是不是值得你继续坐下去。</p>',
      '<blockquote><p>有些书的第一句就把门推开了。你还没坐稳，已经被拽了进去。另一些书则像老房子，先在门口站一会儿，等眼睛适应了屋里的光。</p></blockquote>',
      '<p>我渐渐不再要求每一本书都热烈。热烈是容易的，耐心才难。</p>',
      '<p>所以现在，如果一本书的前十页没有让我安静下来，我会合上它，放回架上。不是它不好，只是我们还没到说话的时候。</p>',
      '<p>也许过两年再翻开，它就愿意说了。</p>',
      '<p><a href="ch2.xhtml">继续读第二封 →</a></p>',
    ],
  },
  {
    file: 'ch2.xhtml',
    title: '第二封信：一本书的重量',
    body: [
      '<p>电子书没有重量，这是它最大的谎言。</p>',
      '<p>一本纸书的重量是可以测量的。精装本大约六百克，平装本四百克，口袋里那本更轻。你带着它出门，肩膀知道它的存在。<a href="#fn1" id="ref1">[1]</a></p>',
      '<p>但真正有重量的是别的东西：你读到哪一页折了角，哪一段被铅笔划过，哪一页夹着一张过期的车票。它们加起来，比纸更重。</p>',
      '<p>我搬过几次家，每次都扔掉一些书。扔的时候并不心疼，心疼的是后来某个深夜，突然想起其中一本的某一页，却再也找不到。</p>',
      '<p>读书这件事，说到底是在给自己造一间屋子。每读一本，就多一块砖。屋子不必大，但要结实，能在坏天气里待得住。</p>',
      '<p>所以我不太相信“读完”这件事。有些书是用来住的，不是用来读完的。</p>',
      '<p class="footnote" id="fn1">[1] 这是示例脚注：所谓重量，也包括那些你舍不得扔掉的成分。</p>',
    ],
  },
  {
    file: 'ch3.xhtml',
    title: '第三封信：页边空白',
    body: [
      '<p>我父亲读书有个习惯，从不写在正文里。他把想法写在页边的空白处，字很小，挤在一起，像是怕惊动正文。</p>',
      '<p>后来我读他的旧书，最动人的不是正文，是那些页边的字。有一处写着“此处不对”，另一处写着“我也见过”。</p>',
      '<blockquote><p>阅读是一件很私人的事。我们总以为自己在理解作者，其实多半是在借作者的话，理解自己。</p></blockquote>',
      '<p>页边的空白之所以重要，是因为它给了读者一个位置。没有空白的书，是作者一个人的独白。</p>',
      '<p>现在我在屏幕上读书，也总想找个地方写点什么。可惜大多数阅读器把页面做得太满，满到没有地方放一个读者的念头。</p>',
      '<p>这大概是电子书至今没能完全替代纸书的原因之一：它给了你无限的书，却没有给你一小块空白。</p>',
    ],
  },
  {
    file: 'ch4.xhtml',
    title: '第四封信：读完之前',
    body: [
      '<p>最后一封信，写给我自己。</p>',
      '<p>我们这代人读书，总带着一点焦虑。书单越列越长，读完的越来越少。好像读书是一件需要交付的事。</p>',
      '<p>可书不是任务。你可以在第三章停下来，可以同时读五本，可以读完一本之后一个字都想不起来。这些都不算失败。</p>',
      '<p>真正算失败的，是再也没有翻开下一本。</p>',
      '<p>所以我把阅读器做得尽量安静：没有推荐，没有榜单，没有“你已连续阅读多少天”。只有书，和一个记得你读到哪儿的地方。</p>',
      '<p>这样就好。</p>',
      '<p class="end">— 完 —</p>',
    ],
  },
];

const navItems = chapters
  .map((chapter) => `      <li><a href="${chapter.file}">${chapter.title}</a></li>`)
  .join('\n');

const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>目录</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;

const manifestItems = chapters
  .map((chapter, index) => `    <item id="ch${index + 1}" href="${chapter.file}" media-type="application/xhtml+xml"/>`)
  .join('\n');

const spineItems = chapters
  .map((chapter, index) => `    <itemref idref="ch${index + 1}"/>`)
  .join('\n');

const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:8f1b6a52-4a0e-4a6f-9f0e-2f0a5c8f0d21</dc:identifier>
    <dc:title>慢读</dc:title>
    <dc:creator>示例作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:publisher>Read 示例</dc:publisher>
    <dc:description>关于阅读的四封信。这是一本用于体验排版与续读的示例书。</dc:description>
    <meta property="dcterms:modified">2026-10-21T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
${manifestItems}
  </manifest>
  <spine>
    <itemref idref="cover"/>
${spineItems}
  </spine>
</package>`;

const coverPage = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>封面</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body epub:type="cover">
  <div class="cover"><img src="cover.svg" alt="慢读"/></div>
</body>
</html>`;

const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file(
  'META-INF/container.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
);

const oebps = zip.folder('OEBPS');
oebps.file('content.opf', opf);
oebps.file('nav.xhtml', nav);
oebps.file('style.css', CSS);
oebps.file('cover.svg', COVER_SVG);
oebps.file('cover.xhtml', coverPage);

for (const chapter of chapters) {
  oebps.file(chapter.file, page(chapter.title, chapter.body));
}

const buffer = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, buffer);
console.log(`sample epub written: ${OUT} (${(buffer.length / 1024).toFixed(1)} KB)`);
