/**
 * 生成多页带水印的 OFD 测试文件
 * 用法：node scripts/generate-multipage-test.js
 */
const JSZip = require('jszip');
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

const PW = 210, PH = 297; // A4 mm
const MARGIN = 20;

function makeTextObj(id, x, y, w, h, fontId, size, text, opts = {}) {
    const deltaX = opts.deltaX || '';
    const dxAttr = deltaX ? ` DeltaX="${deltaX}"` : '';
    const fillVal = opts.color || '0 0 0';
    const alphaAttr = opts.alpha ? `\n        <ofd:FillColor Value="${fillVal}" Alpha="${opts.alpha}"/>` : `\n        <ofd:FillColor Value="${fillVal}"/>`;
    const ctmAttr = opts.ctm ? ` CTM="${opts.ctm}"` : '';
    const weightAttr = opts.weight ? ` Weight="${opts.weight}"` : '';
    const cgBlock = opts.cgTransform || '';
    return `      <ofd:TextObject ID="${id}" Boundary="${x} ${y} ${w} ${h}" Font="${fontId}" Size="${size}"${ctmAttr}${weightAttr}>${alphaAttr}
        ${cgBlock}<ofd:TextCode X="${opts.textX || 0}" Y="${size}"${dxAttr}>${text}</ofd:TextCode>
      </ofd:TextObject>`;
}

function makePathRect(id, x, y, w, h, opts = {}) {
    const fill = opts.fill || '220 220 220';
    const stroke = opts.stroke || '180 180 180';
    const lw = opts.lineWidth || 0.3;
    return `      <ofd:PathObject ID="${id}" Boundary="${x} ${y} ${w} ${h}" LineWidth="${lw}">
        <ofd:FillColor Value="${fill}"/>
        <ofd:StrokeColor Value="${stroke}"/>
        <ofd:AbbreviatedData>M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} C</ofd:AbbreviatedData>
      </ofd:PathObject>`;
}

function makePathLine(id, x, y, w, opts = {}) {
    const stroke = opts.stroke || '0 0 0';
    const lw = opts.lineWidth || 0.5;
    return `      <ofd:PathObject ID="${id}" Boundary="${x} ${y} ${w} 0.1" Stroke="true" Fill="false" LineWidth="${lw}">
        <ofd:StrokeColor Value="${stroke}"/>
        <ofd:AbbreviatedData>M 0 0 L ${w} 0</ofd:AbbreviatedData>
      </ofd:PathObject>`;
}

function generateWatermarkLayer(startId, text, fontSize) {
    const objs = [];
    let id = startId;
    const cos30 = 0.866, sin30 = 0.5;
    const spacing = 60;
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 4; col++) {
            const cx = col * spacing + 15;
            const cy = row * spacing + 20;
            const ctm = `${cos30} ${-sin30} ${sin30} ${cos30} 0 0`;
            const w = text.length * fontSize + 10;
            const dx = Array(text.length - 1).fill(fontSize.toFixed(1)).join(' ');
            objs.push(makeTextObj(id++, cx, cy, w, fontSize + 2, '30', fontSize, text, {
                color: '200 200 200',
                alpha: '80',
                ctm: ctm,
                deltaX: dx
            }));
        }
    }
    return {
        xml: `    <ofd:Layer ID="${id++}" Type="Foreground">\n${objs.join('\n')}\n    </ofd:Layer>`,
        nextId: id
    };
}

function buildParagraph(startId, x, startY, width, fontId, fontSize, lines, opts = {}) {
    const objs = [];
    let id = startId;
    const lineHeight = fontSize * 1.6;
    const color = opts.color || '0 0 0';
    const weight = opts.weight;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const y = startY + i * lineHeight;
        const dx = Array(line.length - 1).fill(fontSize.toFixed(2)).join(' ');
        objs.push(makeTextObj(id++, x, y, width, fontSize + 2, fontId, fontSize, line, {
            deltaX: dx, color, weight
        }));
    }
    return { objs, nextId: id, endY: startY + lines.length * lineHeight };
}

async function main() {
    const sourceOfd = fs.readFileSync(path.join(__dirname, '../public/2.ofd'));
    const sourceZip = await JSZip.loadAsync(sourceOfd);
    const ttfBuffer = await sourceZip.files['Doc_0/Res/cc282774b5eb4b86957ed2e42c3b6ffa.ttf'].async('arraybuffer');
    const calibriBuffer = await sourceZip.files['Doc_0/Res/d206dd3fe05141bc91d8d116b660e8eb.ttf'].async('arraybuffer');
    const font = opentype.parse(ttfBuffer);

    const charMap = new Map();
    for (let i = 1; i < font.numGlyphs; i++) {
        const g = font.glyphs.get(i);
        if (g.unicode && g.path && g.path.commands.length > 0) {
            charMap.set(String.fromCodePoint(g.unicode), i);
        }
    }

    let globalId = 100;

    // ========== 页面 1：封面 ==========
    function buildPage1() {
        let id = globalId;
        const objs = [];

        objs.push(makePathRect(id++, 0, 0, PW, 80, { fill: '41 98 164', stroke: '41 98 164' }));

        objs.push(makeTextObj(id++, 30, 25, 160, 18, '30', 14,
            'ofd.js 渲染测试', { color: '255 255 255', weight: '900', deltaX: Array(7).fill('14.00').join(' ') }));

        objs.push(makeTextObj(id++, 30, 50, 160, 10, '32', 6,
            'Multi-Page Watermark Test Document', { color: '220 230 240', deltaX: Array(33).fill('3.50').join(' ') }));

        objs.push(makePathLine(id++, MARGIN, 95, PW - 2 * MARGIN, { stroke: '180 180 180', lineWidth: 0.3 }));

        const sections = [
            { title: '文档概述', body: ['本文档用于测试 ofd.js 的多页渲染、', '水印叠加、嵌入字体和 CGTransform', '字形变换等功能的综合表现。'] },
            { title: '测试内容', body: ['第一页：封面设计与基本排版', '第二页：正文段落与嵌入字体', '第三页：CGTransform 字形变换测试'] },
            { title: '技术特性', body: ['支持 Layer 类型排序与 ZOrder', '支持 CTM 矩阵变换与裁剪', '支持渐变、底纹和透明度'] },
        ];

        let curY = 105;
        for (const section of sections) {
            objs.push(makePathRect(id++, MARGIN, curY, 3, 7, { fill: '41 98 164', stroke: '41 98 164' }));
            objs.push(makeTextObj(id++, MARGIN + 6, curY, 80, 9, '30', 6, section.title,
                { weight: '700', deltaX: Array(section.title.length - 1).fill('6.00').join(' ') }));
            curY += 12;
            const p = buildParagraph(id, MARGIN + 6, curY, PW - 2 * MARGIN, '30', 4, section.body);
            objs.push(...p.objs); id = p.nextId; curY = p.endY + 8;
        }

        objs.push(makePathLine(id++, MARGIN, PH - 25, PW - 2 * MARGIN, { stroke: '200 200 200', lineWidth: 0.2 }));
        objs.push(makeTextObj(id++, MARGIN, PH - 20, 100, 5, '30', 3, '生成日期：2026-02-28',
            { color: '150 150 150', deltaX: Array(12).fill('3.00').join(' ') }));

        const wm = generateWatermarkLayer(id, '内部测试', 5);
        id = wm.nextId;
        globalId = id;

        return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org">
  <ofd:Area><ofd:PhysicalBox>0 0 ${PW} ${PH}</ofd:PhysicalBox></ofd:Area>
  <ofd:Content>
    <ofd:Layer ID="${id++}" Type="Body">
${objs.join('\n')}
    </ofd:Layer>
${wm.xml}
  </ofd:Content>
</ofd:Page>`;
    }

    // ========== 页面 2：正文段落 ==========
    function buildPage2() {
        let id = globalId;
        const objs = [];

        objs.push(makePathRect(id++, MARGIN, MARGIN, PW - 2 * MARGIN, 12, { fill: '245 245 245', stroke: '220 220 220' }));
        objs.push(makeTextObj(id++, MARGIN + 4, MARGIN + 1, 100, 10, '30', 7, '正文排版测试',
            { weight: '700', deltaX: Array(5).fill('7.00').join(' ') }));

        let curY = MARGIN + 18;

        const paragraphs = [
            ['版权航天福昕所有未经公司授禁止以', '任何形式复制转移散布或储存本文档。'],
            ['在副中的提示允许情况下您可使用修改', '出售和该软件此不含隐藏条款对于产生', '后果均由户人承担。'],
            ['目录第章概述办套优点入门安装卸载设', '置为默认阅读获取帮助工具栏模界面介', '绍导板打开保另关闭选择多创建。'],
            ['窗口扫描仪编辑链接电子语义树书签大', '纲附象注释标水印图功能校符号属性页', '管理插删除动交换替分离裁剪旋全查。'],
        ];

        for (let pi = 0; pi < paragraphs.length; pi++) {
            objs.push(makePathRect(id++, MARGIN, curY - 1, PW - 2 * MARGIN, paragraphs[pi].length * 7.5 + 4,
                { fill: pi % 2 === 0 ? '255 255 255' : '250 252 255', stroke: '240 240 240' }));

            const sectionLabel = `段落 ${pi + 1}`;
            objs.push(makeTextObj(id++, MARGIN + 2, curY, 40, 5, '30', 3.5, sectionLabel,
                { color: '100 100 100', deltaX: Array(sectionLabel.length - 1).fill('3.50').join(' ') }));
            curY += 7;

            const p = buildParagraph(id, MARGIN + 4, curY, PW - 2 * MARGIN - 8, '30', 4.5, paragraphs[pi]);
            objs.push(...p.objs); id = p.nextId; curY = p.endY + 6;
        }

        objs.push(makePathLine(id++, MARGIN, curY, PW - 2 * MARGIN, { stroke: '41 98 164', lineWidth: 0.5 }));
        curY += 8;

        objs.push(makeTextObj(id++, MARGIN, curY, 100, 7, '30', 5, '多字号混排测试',
            { weight: '700', deltaX: Array(5).fill('5.00').join(' ') }));
        curY += 10;

        const sizes = [3, 4, 5, 6, 8, 10];
        for (const sz of sizes) {
            const label = `${sz}mm 字号示例文字`;
            objs.push(makeTextObj(id++, MARGIN + 4, curY, PW - 2 * MARGIN, sz + 2, '30', sz, label,
                { deltaX: Array(label.length - 1).fill(sz.toFixed(2)).join(' ') }));
            curY += sz * 1.8 + 2;
        }

        const wm = generateWatermarkLayer(id, '内部测试', 5);
        id = wm.nextId;
        globalId = id;

        return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org">
  <ofd:Area><ofd:PhysicalBox>0 0 ${PW} ${PH}</ofd:PhysicalBox></ofd:Area>
  <ofd:Content>
    <ofd:Layer ID="${id++}" Type="Body">
${objs.join('\n')}
    </ofd:Layer>
${wm.xml}
  </ofd:Content>
</ofd:Page>`;
    }

    // ========== 页面 3：CGTransform 综合测试 ==========
    function buildPage3() {
        let id = globalId;
        const objs = [];

        objs.push(makePathRect(id++, MARGIN, MARGIN, PW - 2 * MARGIN, 12, { fill: '245 245 245', stroke: '220 220 220' }));
        objs.push(makeTextObj(id++, MARGIN + 4, MARGIN + 1, 140, 10, '30', 7, 'CGTransform 字形变换',
            { weight: '700', deltaX: Array(12).fill('7.00').join(' ') }));

        let curY = MARGIN + 20;

        // 测试 1：基本 CGTransform
        objs.push(makeTextObj(id++, MARGIN, curY, 100, 5, '30', 3.5, '测试一：基本字形映射',
            { color: '41 98 164', weight: '700', deltaX: Array(9).fill('3.50').join(' ') }));
        curY += 8;

        const testChars1 = [];
        for (let i = 1; i <= 20; i++) testChars1.push(i);
        const pua1 = testChars1.map((_, i) => String.fromCodePoint(0xE000 + i)).join('');
        const glyphs1 = testChars1.join(' ');
        const dx1 = Array(testChars1.length - 1).fill('5.00').join(' ');
        const cg1 = `<ofd:CGTransform CodePosition="0" CodeCount="${testChars1.length}" GlyphCount="${testChars1.length}">
          <ofd:Glyphs>${glyphs1}</ofd:Glyphs>
        </ofd:CGTransform>\n        `;
        objs.push(makeTextObj(id++, MARGIN + 4, curY, 110, 7, '30', 5, pua1,
            { deltaX: dx1, cgTransform: cg1 }));
        curY += 10;

        // 对照组
        const actualChars1 = testChars1.map(i => {
            const g = font.glyphs.get(i);
            return g && g.unicode ? String.fromCodePoint(g.unicode) : '?';
        }).join('');
        objs.push(makeTextObj(id++, MARGIN + 4, curY, 110, 7, '30', 5, actualChars1,
            { deltaX: dx1, color: '100 100 100' }));
        curY += 12;

        objs.push(makeTextObj(id++, MARGIN + 4, curY, 160, 4, '30', 3, '上行：CGTransform 渲染  下行：Unicode 对照（两行应一致）',
            { color: '120 120 120', deltaX: Array(27).fill('3.00').join(' ') }));
        curY += 12;

        // 测试 2：不同字号的 CGTransform
        objs.push(makeTextObj(id++, MARGIN, curY, 120, 5, '30', 3.5, '测试二：不同字号字形渲染',
            { color: '41 98 164', weight: '700', deltaX: Array(10).fill('3.50').join(' ') }));
        curY += 8;

        const testSizes = [3, 5, 8, 12];
        const testGlyphs = [1, 2, 3, 4, 5, 6, 7, 8];
        const puaSmall = testGlyphs.map((_, i) => String.fromCodePoint(0xE100 + i)).join('');
        for (const sz of testSizes) {
            const dx = Array(testGlyphs.length - 1).fill(sz.toFixed(2)).join(' ');
            const cg = `<ofd:CGTransform CodePosition="0" CodeCount="${testGlyphs.length}" GlyphCount="${testGlyphs.length}">
          <ofd:Glyphs>${testGlyphs.join(' ')}</ofd:Glyphs>
        </ofd:CGTransform>\n        `;
            objs.push(makeTextObj(id++, MARGIN + 4, curY, 100, sz + 2, '30', sz, puaSmall,
                { deltaX: dx, cgTransform: cg }));
            objs.push(makeTextObj(id++, MARGIN + sz * testGlyphs.length + 14, curY + sz * 0.3, 30, 4, '30', 3,
                `${sz}mm`, { color: '150 150 150', deltaX: '3' }));
            curY += sz * 1.5 + 3;
        }
        curY += 5;

        // 测试 3：连字映射
        objs.push(makeTextObj(id++, MARGIN, curY, 120, 5, '30', 3.5, '测试三：连字映射（多对少）',
            { color: '41 98 164', weight: '700', deltaX: Array(11).fill('3.50').join(' ') }));
        curY += 8;
        const cgLig = `<ofd:CGTransform CodePosition="0" CodeCount="4" GlyphCount="2">
          <ofd:Glyphs>1 2</ofd:Glyphs>
        </ofd:CGTransform>\n        `;
        objs.push(makeTextObj(id++, MARGIN + 4, curY, 40, 8, '30', 6,
            '\uE200\uE201\uE202\uE203', { deltaX: '6 6 6', cgTransform: cgLig }));
        curY += 12;

        objs.push(makeTextObj(id++, MARGIN + 4, curY, 160, 4, '30', 3,
            '4个占位符映射到2个字形（后2个应被跳过）',
            { color: '120 120 120', deltaX: Array(20).fill('3.00').join(' ') }));
        curY += 12;

        // 测试 4：混合渲染
        objs.push(makeTextObj(id++, MARGIN, curY, 120, 5, '30', 3.5, '测试四：混合渲染',
            { color: '41 98 164', weight: '700', deltaX: Array(7).fill('3.50').join(' ') }));
        curY += 8;

        const g5 = font.glyphs.get(5);
        const g6 = font.glyphs.get(6);
        const ch5 = g5 && g5.unicode ? String.fromCodePoint(g5.unicode) : '?';
        const ch6 = g6 && g6.unicode ? String.fromCodePoint(g6.unicode) : '?';
        const cgMix = `<ofd:CGTransform CodePosition="0" CodeCount="3" GlyphCount="3">
          <ofd:Glyphs>3 4 5</ofd:Glyphs>
        </ofd:CGTransform>\n        `;
        objs.push(makeTextObj(id++, MARGIN + 4, curY, 60, 8, '30', 6,
            `\uE300\uE301\uE302${ch5}${ch6}`, { deltaX: '6 6 6 6', cgTransform: cgMix }));
        curY += 12;
        objs.push(makeTextObj(id++, MARGIN + 4, curY, 160, 4, '30', 3,
            '前3个字符通过CGTransform渲染，后2个通过cmap渲染',
            { color: '120 120 120', deltaX: Array(24).fill('3.00').join(' ') }));

        const wm = generateWatermarkLayer(id, '内部测试', 5);
        id = wm.nextId;
        globalId = id;

        return `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org">
  <ofd:Area><ofd:PhysicalBox>0 0 ${PW} ${PH}</ofd:PhysicalBox></ofd:Area>
  <ofd:Content>
    <ofd:Layer ID="${id++}" Type="Body">
${objs.join('\n')}
    </ofd:Layer>
${wm.xml}
  </ofd:Content>
</ofd:Page>`;
    }

    const page1 = buildPage1();
    const page2 = buildPage2();
    const page3 = buildPage3();

    const ofdXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org" Version="1.1" DocType="OFD">
  <ofd:DocBody>
    <ofd:DocInfo>
      <ofd:DocID>MultiPage-Watermark-Test</ofd:DocID>
      <ofd:Title>多页水印渲染测试</ofd:Title>
      <ofd:Author>ofd.js test generator</ofd:Author>
      <ofd:CreationDate>2026-02-28</ofd:CreationDate>
    </ofd:DocInfo>
    <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org">
  <ofd:CommonData>
    <ofd:MaxUnitID>9999</ofd:MaxUnitID>
    <ofd:PageArea>
      <ofd:PhysicalBox>0 0 ${PW} ${PH}</ofd:PhysicalBox>
    </ofd:PageArea>
    <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>
  </ofd:CommonData>
  <ofd:Pages>
    <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
    <ofd:Page ID="2" BaseLoc="Pages/Page_1/Content.xml"/>
    <ofd:Page ID="3" BaseLoc="Pages/Page_2/Content.xml"/>
  </ofd:Pages>
</ofd:Document>`;

    const publicResXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org" BaseLoc="Res">
  <ofd:Fonts>
    <ofd:Font ID="30" FontName="SimSun" FamilyName="SimSun">
      <ofd:FontFile>simsun-subset.ttf</ofd:FontFile>
    </ofd:Font>
    <ofd:Font ID="32" FontName="Calibri" FamilyName="Calibri">
      <ofd:FontFile>calibri-subset.ttf</ofd:FontFile>
    </ofd:Font>
  </ofd:Fonts>
</ofd:Res>`;

    const zip = new JSZip();
    zip.file('OFD.xml', ofdXml);
    zip.file('Doc_0/Document.xml', documentXml);
    zip.file('Doc_0/PublicRes.xml', publicResXml);
    zip.file('Doc_0/Pages/Page_0/Content.xml', page1);
    zip.file('Doc_0/Pages/Page_1/Content.xml', page2);
    zip.file('Doc_0/Pages/Page_2/Content.xml', page3);
    zip.file('Doc_0/Res/simsun-subset.ttf', ttfBuffer);
    zip.file('Doc_0/Res/calibri-subset.ttf', calibriBuffer);

    const outputPath = path.join(__dirname, '../public/multipage-watermark-test.ofd');
    const ofdData = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outputPath, ofdData);

    console.log(`✅ 测试文件已生成: public/multipage-watermark-test.ofd`);
    console.log(`   文件大小: ${(ofdData.length / 1024).toFixed(1)} KB`);
    console.log(`   共 3 页：`);
    console.log(`   第 1 页 - 封面：蓝色标题栏 + 分节内容 + 水印`);
    console.log(`   第 2 页 - 正文：多段落排版 + 多字号混排 + 水印`);
    console.log(`   第 3 页 - CGTransform：基本映射/不同字号/连字/混合渲染 + 水印`);
    console.log(`   每页均含 "内部测试" 斜 30° 半透明水印（前景层）`);
}

main().catch(e => { console.error(e); process.exit(1); });
