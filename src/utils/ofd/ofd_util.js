/*
 * ofd.js - A Javascript class for reading and rendering ofd files
 * <https://github.com/DLTech21/ofd.js>
 *
 * Copyright (c) 2020. DLTech21 All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */


export const convertPathAbbreviatedDatatoPoint = abbreviatedData => {
    let array = abbreviatedData.split(' ');
    let pointList = [];
    let i = 0;
    while (i < array.length) {
        if (array[i] === 'M' || array[i] === 'S') {
            let point = {
                'type': 'M',
                'x': parseFloat(array[i + 1]),
                'y': parseFloat(array[i + 2])
            }
            i = i + 3;
            pointList.push(point);
        } else if (array[i] === 'L') {
            let point = {
                'type': 'L',
                'x': parseFloat(array[i + 1]),
                'y': parseFloat(array[i + 2])
            }
            i = i + 3;
            pointList.push(point);
        } else if (array[i] === 'C') {
            let point = {
                'type': 'C',
                'x': 0,
                'y': 0
            }
            pointList.push(point)
            i++;
        } else if (array[i] === 'B') {
            let point = {
                'type': 'B',
                'x1': parseFloat(array[i + 1]),
                'y1': parseFloat(array[i + 2]),
                'x2': parseFloat(array[i + 3]),
                'y2': parseFloat(array[i + 4]),
                'x3': parseFloat(array[i + 5]),
                'y3': parseFloat(array[i + 6])
            }
            i = i + 7;
            pointList.push(point);
        } else if (array[i] === 'Q') {
            let point = {
                'type': 'Q',
                'x1': parseFloat(array[i + 1]),
                'y1': parseFloat(array[i + 2]),
                'x2': parseFloat(array[i + 3]),
                'y2': parseFloat(array[i + 4])
            }
            i = i + 5;
            pointList.push(point);
        } else if (array[i] === 'A') {
            let point = {
                'type': 'A',
                'rx': parseFloat(array[i + 1]),
                'ry': parseFloat(array[i + 2]),
                'rotation': parseFloat(array[i + 3]),
                'arc': parseFloat(array[i + 4]),
                'sweep': parseFloat(array[i + 5]),
                'x': parseFloat(array[i + 6]),
                'y': parseFloat(array[i + 7])
            }
            i = i + 8;
            pointList.push(point);
        } else {
            i++;
        }
    }
    return pointList;
}

export const calPathPoint = function (abbreviatedPoint) {
    let pointList = [];

    for (let i = 0; i < abbreviatedPoint.length; i++) {
        let point = abbreviatedPoint[i];
        if (point.type === 'M' || point.type === 'L' || point.type === 'C') {
            let x = 0, y = 0;
            x = point.x;
            y = point.y;
            point.x = converterDpi(x);
            point.y = converterDpi(y);
            pointList.push(point);
        } else if (point.type === 'B') {
            let x1 = point.x1, y1 = point.y1;
            let x2 = point.x2, y2 = point.y2;
            let x3 = point.x3, y3 = point.y3;
            let realPoint = {
                'type': 'B', 'x1': converterDpi(x1), 'y1': converterDpi(y1),
                'x2': converterDpi(x2), 'y2': converterDpi(y2),
                'x3': converterDpi(x3), 'y3': converterDpi(y3)
            }
            pointList.push(realPoint);
        } else if (point.type === 'Q') {
            pointList.push({
                'type': 'Q',
                'x1': converterDpi(point.x1), 'y1': converterDpi(point.y1),
                'x2': converterDpi(point.x2), 'y2': converterDpi(point.y2)
            });
        } else if (point.type === 'A') {
            pointList.push({
                'type': 'A',
                'rx': converterDpi(point.rx), 'ry': converterDpi(point.ry),
                'rotation': point.rotation,
                'arc': point.arc, 'sweep': point.sweep,
                'x': converterDpi(point.x), 'y': converterDpi(point.y)
            });
        }
    }
    return pointList;
}

let MaxScale = 10;

let Scale = MaxScale;

let scaleStack = [];

export const pushScaleContext = function () {
    scaleStack.push({Scale, MaxScale});
}

export const popScaleContext = function () {
    if (scaleStack.length > 0) {
        const ctx = scaleStack.pop();
        Scale = ctx.Scale;
        MaxScale = ctx.MaxScale;
    }
}

export const setMaxPageScal = function (scale) {
    MaxScale = scale > 5 ? 5 : scale;
}

export const setMaxPageScale = setMaxPageScal;

export const setPageScal = function (scale) {
    Scale = scale > 1 ? scale : 1;
    Scale = Scale > MaxScale ? MaxScale : Scale;
}

export const setPageScale = setPageScal;

export const getPageScal = function () {
    return Scale;
}

export const getPageScale = getPageScal;

export const converterDpi = function (mm) {
    return mm * Scale;
}

export const deltaFormatter = function (delta) {
    if (delta.indexOf("g") === -1) {
        let floatList = [];
        for (let f of delta.split(' ')) {
            floatList.push(parseFloat(f));
        }
        return floatList;
    } else {
        const array = delta.split(' ');
        let gFlag = false;
        let gProcessing = false;
        let gItemCount = 0;
        let floatList = [];
        for (const s of array) {
            if ('g' === s) {
                gFlag = true;
            } else {
                if (!s || s.trim().length == 0) {
                    continue;
                }
                if (gFlag) {
                    gItemCount = parseInt(s);
                    gProcessing = true;
                    gFlag = false;
                } else if (gProcessing) {
                    for (let j = 0; j < gItemCount; j++) {
                        floatList.push(parseFloat(s));
                    }
                    gProcessing = false;
                } else {
                    floatList.push(parseFloat(s));
                }
            }
        }
        return floatList;
    }
}

export const calTextPoint = function (textCodes) {
    let x = 0;
    let y = 0;
    let textCodePointList = [];
    if (!textCodes) {
        return textCodePointList;
    }
    for (let textCode of textCodes) {
        if (!textCode) {
            continue
        }
        x = parseFloat(textCode['@_X']);
        y = parseFloat(textCode['@_Y']);

        if (isNaN(x)) {
            x = 0;
        }
        if (isNaN(y)) {
            y = 0;
        }

        let deltaXList = [];
        let deltaYList = [];
        if (textCode['@_DeltaX'] && textCode['@_DeltaX'].length > 0) {
            deltaXList = deltaFormatter(textCode['@_DeltaX']);
        }
        if (textCode['@_DeltaY'] && textCode['@_DeltaY'].length > 0) {
            deltaYList = deltaFormatter(textCode['@_DeltaY']);
        }
        let textStr = textCode['#text'];
        if (textStr) {
            textStr += '';
            textStr = decodeHtml(textStr);
            textStr = textStr.replace(/&#x20;/g, ' ');
            let hasDeltaX = deltaXList.length > 0;
            for (let i = 0; i < textStr.length; i++) {
                if (i > 0 && hasDeltaX) {
                    x += deltaXList[(i - 1)];
                }
                if (i > 0 && deltaYList.length > 0) {
                    y += deltaYList[(i - 1)];
                }
                let text = textStr.substring(i, i + 1);
                let convertedY = converterDpi(y);
                let existingPoint = textCodePointList.find(p => p.y === convertedY);
                if (existingPoint) {
                    existingPoint.text += text;
                    if (i === 0 || hasDeltaX) {
                        existingPoint.x.push(converterDpi(x));
                    }
                } else {
                    let textCodePoint = { 'x': [converterDpi(x)], 'y': convertedY, 'text': text };
                    textCodePointList.push(textCodePoint);
                }
            }
        }
    }
    return textCodePointList;
}

export const replaceFirstSlash = function (str) {
    if (str) {
        if (str.indexOf('/') === 0) {
            str = str.replace('/', '');
        }
    }
    return str;
}

export const getExtensionByPath = function (path) {
    if (!path && typeof path !== "string") return "";
    return path.substring(path.lastIndexOf('.') + 1);
}


let REGX_HTML_DECODE = /&\w+;|&#(\d+);/g;

let HTML_DECODE = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&nbsp;": " ",
    "&quot;": "\"",
    "&copy;": "",
    "&apos;": "'",
    // Add more
};

export const decodeHtml = function (s) {
    s = (s != undefined) ? s : this.toString();
    return (typeof s != "string") ? s :
        s.replace(REGX_HTML_DECODE,
            function ($0, $1) {
                var c = HTML_DECODE[$0];
                if (c == undefined) {
                    // Maybe is Entity Number
                    if (!isNaN($1)) {
                        c = String.fromCharCode(($1 == 160) ? 32 : $1);
                    } else {
                        c = $0;
                    }
                }
                return c;
            });
};

let FONT_FAMILY = {
    '楷体': '楷体, KaiTi, Kai, simkai',
    'kaiti': '楷体, KaiTi, Kai, simkai',
    'Kai': '楷体, KaiTi, Kai',
    'simsun': 'SimSun, simsun, Songti SC',
    '宋体': 'SimSun, simsun, Songti SC',
    '黑体': 'SimHei, STHeiti, simhei',
    '仿宋': 'FangSong, STFangsong, simfang',
    '小标宋体': 'sSun',
    '方正小标宋_gbk': 'sSun',
    '方正小标宋': 'FZXiaoBiaoSong-B05, sSun',
    '仿宋_gb2312': 'FangSong, STFangsong, simfang',
    '楷体_gb2312': '楷体, KaiTi, Kai, simkai',
    'couriernew': 'Courier New',
    'courier new': 'Courier New',
    'timesnewroman': 'Times New Roman',
    'times new roman': 'Times New Roman',
    'arial': 'Arial, Helvetica',
    'helvetica': 'Helvetica, Arial',
    '微软雅黑': 'Microsoft YaHei, 微软雅黑, PingFang SC',
    '华文细黑': 'STXihei',
    '华文楷体': 'STKaiti, 楷体, KaiTi',
    '华文宋体': 'STSong, SimSun',
    '华文仿宋': 'STFangsong, FangSong',
    '华文中宋': 'STZhongsong',
    '华文彩云': 'STCaiyun',
    '隶书': 'LiSu, STLiti',
    '幼圆': 'YouYuan',
    '方正书宋': 'FZShuSong-Z01, SimSun',
    '方正仿宋': 'FZFangSong-Z02, FangSong',
    '方正黑体': 'FZHei-B01, SimHei',
    '方正楷体': 'FZKai-Z03, KaiTi',
};

const lookupFontFamily = function (name) {
    if (!name) return 'sans-serif';
    const lower = name.toLowerCase();
    if (FONT_FAMILY[lower]) {
        return FONT_FAMILY[lower];
    }
    for (let key of Object.keys(FONT_FAMILY)) {
        if (lower.indexOf(key.toLowerCase()) !== -1) {
            return FONT_FAMILY[key];
        }
    }
    return name;
}

export const getFontFamily = function (fontInfo) {
    if (!fontInfo) return 'sans-serif';
    if (typeof fontInfo === 'object' && fontInfo !== null) {
        if (fontInfo.fontFaceFamily) {
            return `"${fontInfo.fontFaceFamily}", ${lookupFontFamily(fontInfo.name)}`;
        }
        return lookupFontFamily(fontInfo.name);
    }
    return lookupFontFamily(fontInfo);
}

export const parseStBox = function (obj) {
    if (obj) {
        let array = obj.split(' ');
        return {
            x: (parseFloat(array[0])), y: (parseFloat(array[1])),
            w: (parseFloat(array[2])), h: (parseFloat(array[3]))
        };
    } else {
        return null;
    }
}

export const parseCtm = function (ctm) {
    let array = ctm.split(' ');
    return array;
}

/**
 * 解析颜色值，支持 RGB、HEX、CMYK、灰度格式
 * @param {string} color - 颜色值字符串
 * @param {string} [colorSpace] - 色彩空间类型（可选，来自 @_ColorSpace）
 */
export const parseColor = function (color, colorSpace) {
    if (color) {
        if (color.indexOf('#') !== -1) {
            color = color.replace(/#/g, '');
            color = color.replace(/ /g, '');
            color = '#' + color.toString();
            return color;
        }
        let array = color.split(' ');
        if (colorSpace === 'CMYK' || array.length === 4) {
            // CMYK 转 RGB: R = 255*(1-C)*(1-K), G = 255*(1-M)*(1-K), B = 255*(1-Y)*(1-K)
            const c = parseFloat(array[0]) / 255;
            const m = parseFloat(array[1]) / 255;
            const y = parseFloat(array[2]) / 255;
            const k = parseFloat(array[3]) / 255;
            const r = Math.round(255 * (1 - c) * (1 - k));
            const g = Math.round(255 * (1 - m) * (1 - k));
            const b = Math.round(255 * (1 - y) * (1 - k));
            return `rgb(${r}, ${g}, ${b})`;
        }
        if (colorSpace === 'GRAY' || array.length === 1) {
            const gray = parseInt(array[0]);
            return `rgb(${gray}, ${gray}, ${gray})`;
        }
        return `rgb(${array[0]}, ${array[1]}, ${array[2]})`
    } else {
        return `rgb(0, 0, 0)`
    }
}

export const converterBox = function (box) {
    return {
        x: converterDpi(box.x), y: converterDpi(box.y),
        w: converterDpi(box.w), h: converterDpi(box.h)
    };
}

/**
 * 将 XML Subpath 元素转换为点列表（非缩略路径描述，GB/T 33190 第 9.3 节）
 * 注意：JSON XML 解析器不保留混合元素类型的出现顺序，
 * 此函数按类型分组处理，适用于大多数实际文档
 */
export const convertXmlSubpathToPoints = function (subpaths) {
    let pointList = [];
    let pathArray = [];
    pathArray = pathArray.concat(subpaths);
    for (const subpath of pathArray) {
        if (!subpath) continue;
        const start = subpath['@_Start'];
        if (start) {
            const coords = start.split(' ');
            pointList.push({type: 'M', x: parseFloat(coords[0]), y: parseFloat(coords[1])});
        }
        let moves = [].concat(subpath['ofd:Move'] || []).filter(Boolean);
        for (const move of moves) {
            const p = move['@_Point1'].split(' ');
            pointList.push({type: 'M', x: parseFloat(p[0]), y: parseFloat(p[1])});
        }
        let lines = [].concat(subpath['ofd:Line'] || []).filter(Boolean);
        for (const line of lines) {
            const p = line['@_Point1'].split(' ');
            pointList.push({type: 'L', x: parseFloat(p[0]), y: parseFloat(p[1])});
        }
        let cubics = [].concat(subpath['ofd:CubicBezier'] || []).filter(Boolean);
        for (const cubic of cubics) {
            const p1 = cubic['@_Point1'].split(' ');
            const p2 = cubic['@_Point2'].split(' ');
            const p3 = cubic['@_Point3'].split(' ');
            pointList.push({
                type: 'B',
                x1: parseFloat(p1[0]), y1: parseFloat(p1[1]),
                x2: parseFloat(p2[0]), y2: parseFloat(p2[1]),
                x3: parseFloat(p3[0]), y3: parseFloat(p3[1])
            });
        }
        let quads = [].concat(subpath['ofd:QuadraticBezier'] || []).filter(Boolean);
        for (const quad of quads) {
            const p1 = quad['@_Point1'].split(' ');
            const p2 = quad['@_Point2'].split(' ');
            pointList.push({
                type: 'Q',
                x1: parseFloat(p1[0]), y1: parseFloat(p1[1]),
                x2: parseFloat(p2[0]), y2: parseFloat(p2[1])
            });
        }
        let arcs = [].concat(subpath['ofd:Arc'] || []).filter(Boolean);
        for (const arc of arcs) {
            const endPoint = arc['@_EndPoint'] || arc['@_Point1'];
            if (endPoint) {
                const ep = endPoint.split(' ');
                pointList.push({
                    type: 'A',
                    rx: parseFloat(arc['@_EllipseX'] || arc['@_RadiusX'] || 0),
                    ry: parseFloat(arc['@_EllipseY'] || arc['@_RadiusY'] || 0),
                    rotation: parseFloat(arc['@_RotationAngle'] || 0),
                    arc: arc['@_LargeArc'] === 'true' ? 1 : 0,
                    sweep: arc['@_SweepDirection'] === 'true' ? 1 : 0,
                    x: parseFloat(ep[0]),
                    y: parseFloat(ep[1])
                });
            }
        }
        if (subpath['ofd:Close'] !== undefined) {
            pointList.push({type: 'C', x: 0, y: 0});
        }
    }
    return pointList;
}

export const Uint8ArrayToHexString = function (arr) {
    let words = [];
    let j = 0;
    for (let i = 0; i < arr.length * 2; i += 2) {
        words[i >>> 3] |= parseInt(arr[j], 10) << (24 - (i % 8) * 4);
        j++;
    }

    // 转换到16进制
    let hexChars = [];
    for (let i = 0; i < arr.length; i++) {
        let bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        hexChars.push((bite >>> 4).toString(16));
        hexChars.push((bite & 0x0f).toString(16));
    }

    return hexChars.join('');
}
