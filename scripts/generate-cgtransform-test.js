/**
 * 生成包含 CGTransform 的最小 OFD 测试文件
 *
 * 原理：
 * 1. 从 2.ofd 提取已有的 SimSun 子集字体 TTF
 * 2. 用 opentype.js 查出已知字符的真实字形索引
 * 3. 构造 TextObject，其中 TextCode 使用占位字符（不在子集中），
 *    但 CGTransform 提供正确的字形索引
 * 4. 不含 CGTransform 时显示为乱码/空白，含 CGTransform 时应显示正确字形
 *
 * 用法：node scripts/generate-cgtransform-test.js
 */

const JSZip = require('jszip');
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

async function main() {
  // --- Step 1: 从 2.ofd 提取 SimSun 子集字体 ---
  const sourceOfd = fs.readFileSync(path.join(__dirname, '../public/2.ofd'));
  const sourceZip = await JSZip.loadAsync(sourceOfd);
  const ttfPath = 'Doc_0/Res/cc282774b5eb4b86957ed2e42c3b6ffa.ttf';
  const ttfBuffer = await sourceZip.files[ttfPath].async('arraybuffer');

  // --- Step 2: 解析字体，获取字形索引映射 ---
  const font = opentype.parse(ttfBuffer);
  console.log(`字体: ${font.names.fontFamily.en}, 字形数: ${font.numGlyphs}, unitsPerEm: ${font.unitsPerEm}`);

  // 找出子集中存在的字符及其字形索引
  const glyphMap = [];
  for (let i = 1; i < font.numGlyphs; i++) {
    const g = font.glyphs.get(i);
    if (g.unicode && g.path && g.path.commands.length > 0) {
      glyphMap.push({
        index: i,
        unicode: g.unicode,
        char: String.fromCodePoint(g.unicode)
      });
    }
  }

  // 选取测试用字符（取前 10 个有效字形）
  const testGlyphs = glyphMap.slice(0, 10);
  console.log('\n测试字形：');
  testGlyphs.forEach(g => {
    console.log(`  glyph[${g.index}] = U+${g.unicode.toString(16).toUpperCase()} '${g.char}'`);
  });

  // 用于 TextCode 的占位字符：使用 PUA 区域 (U+E000+)，不在子集 cmap 中
  const placeholderChars = testGlyphs.map((_, i) => String.fromCodePoint(0xE000 + i)).join('');
  const glyphIndices = testGlyphs.map(g => g.index).join(' ');
  const actualText = testGlyphs.map(g => g.char).join('');

  console.log(`\n占位字符: ${placeholderChars.split('').map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase()).join(' ')}`);
  console.log(`字形索引: ${glyphIndices}`);
  console.log(`实际文字: ${actualText}`);

  // --- Step 3: 构造 OFD XML ---
  const fontSize = 5; // mm
  const charWidth = fontSize;
  const pageW = 210; // A4 宽度 mm
  const pageH = 297; // A4 高度 mm

  // 计算 DeltaX（等宽排列）
  const deltaX = testGlyphs.slice(1).map(() => charWidth.toFixed(2)).join(' ');

  // 同时创建一个不带 CGTransform 的 TextObject（对照组）用于显示实际 Unicode 文字
  // 和一个使用正确 Unicode 字符但不带 CGTransform 的 TextObject
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org">
  <ofd:Area>
    <ofd:PhysicalBox>0 0 ${pageW} ${pageH}</ofd:PhysicalBox>
  </ofd:Area>
  <ofd:Content>
    <ofd:Layer ID="100" Type="Body">

      <!-- 测试组 1：有 CGTransform 的 TextObject -->
      <!-- TextCode 使用 PUA 占位字符，CGTransform 提供正确的字形索引 -->
      <!-- 没有 CGTransform 支持时：显示空白/方块 -->
      <!-- 有 CGTransform 支持时：应显示 "${actualText}" -->
      <ofd:TextObject ID="201" Boundary="20 30 ${charWidth * testGlyphs.length + 10} ${fontSize + 4}" Font="30" Size="${fontSize}">
        <ofd:FillColor Value="0 0 0"/>
        <ofd:CGTransform CodePosition="0" CodeCount="${testGlyphs.length}" GlyphCount="${testGlyphs.length}">
          <ofd:Glyphs>${glyphIndices}</ofd:Glyphs>
        </ofd:CGTransform>
        <ofd:TextCode X="2" Y="${fontSize}" DeltaX="${deltaX}">${placeholderChars}</ofd:TextCode>
      </ofd:TextObject>

      <!-- 测试组 2：无 CGTransform 的对照组（使用实际 Unicode 字符） -->
      <!-- 应通过 cmap 正常渲染（如果字符在子集中） -->
      <ofd:TextObject ID="202" Boundary="20 50 ${charWidth * testGlyphs.length + 10} ${fontSize + 4}" Font="30" Size="${fontSize}">
        <ofd:FillColor Value="0 0 0"/>
        <ofd:TextCode X="2" Y="${fontSize}" DeltaX="${deltaX}">${actualText}</ofd:TextCode>
      </ofd:TextObject>

      <!-- 测试组 3：CGTransform CodeCount != GlyphCount（连字测试） -->
      <!-- 2 个占位字符 → 1 个字形（模拟连字） -->
      <ofd:TextObject ID="203" Boundary="20 70 30 ${fontSize + 4}" Font="30" Size="${fontSize}">
        <ofd:FillColor Value="128 0 0"/>
        <ofd:CGTransform CodePosition="0" CodeCount="2" GlyphCount="1">
          <ofd:Glyphs>${testGlyphs[0].index}</ofd:Glyphs>
        </ofd:CGTransform>
        <ofd:TextCode X="2" Y="${fontSize}">\uE010\uE011</ofd:TextCode>
      </ofd:TextObject>

      <!-- 测试组 4：多段 CGTransform（部分字符有变换，部分没有） -->
      <ofd:TextObject ID="204" Boundary="20 90 ${charWidth * 4 + 10} ${fontSize + 4}" Font="30" Size="${fontSize}">
        <ofd:FillColor Value="0 0 128"/>
        <ofd:CGTransform CodePosition="0" CodeCount="2" GlyphCount="2">
          <ofd:Glyphs>${testGlyphs[3].index} ${testGlyphs[4].index}</ofd:Glyphs>
        </ofd:CGTransform>
        <ofd:TextCode X="2" Y="${fontSize}" DeltaX="${charWidth} ${charWidth} ${charWidth}">\uE020\uE021${testGlyphs[5].char}${testGlyphs[6].char}</ofd:TextCode>
      </ofd:TextObject>

      <!-- 标注文字（使用系统字体，不依赖嵌入字体） -->
      <ofd:TextObject ID="210" Boundary="20 15 100 8" Font="30" Size="3.5">
        <ofd:FillColor Value="128 128 128"/>
        <ofd:TextCode X="0" Y="3.5">CGTransform Test - ofd.js</ofd:TextCode>
      </ofd:TextObject>

    </ofd:Layer>
  </ofd:Content>
</ofd:Page>`;

  const ofdXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org" Version="1.1" DocType="OFD">
  <ofd:DocBody>
    <ofd:DocInfo>
      <ofd:DocID>CGTransform-Test-001</ofd:DocID>
      <ofd:Title>CGTransform 字形变换测试文件</ofd:Title>
      <ofd:Author>ofd.js test generator</ofd:Author>
      <ofd:CreationDate>2026-02-28</ofd:CreationDate>
    </ofd:DocInfo>
    <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org">
  <ofd:CommonData>
    <ofd:MaxUnitID>300</ofd:MaxUnitID>
    <ofd:PageArea>
      <ofd:PhysicalBox>0 0 ${pageW} ${pageH}</ofd:PhysicalBox>
    </ofd:PageArea>
    <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>
  </ofd:CommonData>
  <ofd:Pages>
    <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
  </ofd:Pages>
</ofd:Document>`;

  const publicResXml = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org" BaseLoc="Res">
  <ofd:Fonts>
    <ofd:Font ID="30" FontName="SimSun" FamilyName="SimSun">
      <ofd:FontFile>simsun-subset.ttf</ofd:FontFile>
    </ofd:Font>
  </ofd:Fonts>
</ofd:Res>`;

  // --- Step 4: 打包为 OFD (ZIP) ---
  const zip = new JSZip();
  zip.file('OFD.xml', ofdXml);
  zip.file('Doc_0/Document.xml', documentXml);
  zip.file('Doc_0/PublicRes.xml', publicResXml);
  zip.file('Doc_0/Pages/Page_0/Content.xml', contentXml);
  zip.file('Doc_0/Res/simsun-subset.ttf', ttfBuffer);

  const outputPath = path.join(__dirname, '../public/cgtransform-test.ofd');
  const ofdData = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, ofdData);

  console.log(`\n✅ 测试文件已生成: ${outputPath}`);
  console.log(`   文件大小: ${(ofdData.length / 1024).toFixed(1)} KB`);

  // --- 输出测试说明 ---
  console.log(`
=== 测试文件说明 ===

文件: public/cgtransform-test.ofd
字体: SimSun 子集 (${font.numGlyphs} 字形, unitsPerEm=${font.unitsPerEm})

包含 4 组 TextObject 测试用例：

1. 基本 CGTransform（行 1，黑色）
   TextCode: PUA 占位字符 (U+E000~)
   CGTransform: ${glyphIndices}
   期望渲染: "${actualText}"
   无 CGTransform 时: 空白/方块

2. 对照组 - 无 CGTransform（行 2，黑色）
   TextCode: "${actualText}"（实际 Unicode 字符）
   期望: 通过 cmap 正常渲染

3. 连字测试 CodeCount=2 → GlyphCount=1（行 3，红色）
   2 个占位字符映射到 1 个字形 (index ${testGlyphs[0].index} = '${testGlyphs[0].char}')

4. 混合渲染（行 4，蓝色）
   前 2 个字符有 CGTransform，后 2 个无
   期望: '${testGlyphs[3].char}${testGlyphs[4].char}${testGlyphs[5].char}${testGlyphs[6].char}'
`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
