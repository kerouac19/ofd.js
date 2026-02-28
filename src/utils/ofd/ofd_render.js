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

import {
    calPathPoint,
    calTextPoint,
    converterDpi, convertPathAbbreviatedDatatoPoint,
    convertXmlSubpathToPoints,
    deltaFormatter,
    decodeHtml,
    getFontFamily,
    parseColor,
    parseCtm,
    parseStBox,
    setPageScal,
    converterBox, setMaxPageScal,
} from "@/utils/ofd/ofd_util";

let clipIdCounter = 0;
let gradientIdCounter = 0;
let patternIdCounter = 0;

/**
 * 渲染 Pattern 的 CellContent 内部图元到 SVG 容器
 * CellContent 扩展自 CT_PageBlock，可包含 PathObject/ImageObject/TextObject
 * @param {Object} cellContent - ofd:CellContent 节点
 * @param {Element} container - SVG 容器元素（<g> 或 <pattern>）
 */
const renderPatternCellContent = function (cellContent, container) {
    if (!cellContent) return;
    let cells = [];
    cells = cells.concat(cellContent);
    for (const cell of cells) {
        if (!cell) continue;
        // PathObject
        const pathObjects = cell['ofd:PathObject'];
        if (pathObjects) {
            let arr = [];
            arr = arr.concat(pathObjects);
            for (const po of arr) {
                if (!po) continue;
                const svgEl = renderPathObject({}, po, null, null, converterDpi(0.353), false);
                // 将渲染结果的子元素移入容器，去掉外层 svg 的绝对定位
                while (svgEl.firstChild) {
                    container.appendChild(svgEl.firstChild);
                }
            }
        }
        // ImageObject
        const imageObjects = cell['ofd:ImageObject'];
        if (imageObjects) {
            let arr = [];
            arr = arr.concat(imageObjects);
            for (const io of arr) {
                if (!io) continue;
                // ImageObject 渲染为 div/canvas，需要特殊处理
                // 在 pattern 上下文中，创建简化的 SVG image 元素
                let boundary = parseStBox(io['@_Boundary']);
                boundary = converterBox(boundary);
                const imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                imgEl.setAttribute('x', boundary.x);
                imgEl.setAttribute('y', boundary.y);
                imgEl.setAttribute('width', boundary.w);
                imgEl.setAttribute('height', boundary.h);
                container.appendChild(imgEl);
            }
        }
        // TextObject
        const textObjects = cell['ofd:TextObject'];
        if (textObjects) {
            let arr = [];
            arr = arr.concat(textObjects);
            for (const to of arr) {
                if (!to) continue;
                const svgEl = renderTextObject({}, to, null, null);
                while (svgEl.firstChild) {
                    container.appendChild(svgEl.firstChild);
                }
            }
        }
    }
};

/**
 * 解析 ofd:FillColor 或 ofd:StrokeColor 中的渐变定义，返回 SVG 渐变引用 url(#id) 或普通颜色
 * @param {Object} colorObj - ofd:FillColor 或 ofd:StrokeColor 节点
 * @param {Element} svg - SVG 元素（用于添加 defs）
 * @returns {string|null} CSS 颜色值或渐变引用
 */
const parseColorOrGradient = function (colorObj, svg) {
    if (!colorObj) return null;
    // Pattern 平铺底纹
    const pattern = colorObj['ofd:Pattern'];
    if (pattern) {
        const patId = `ofd-pattern-${patternIdCounter++}`;
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const width = converterDpi(parseFloat(pattern['@_Width']));
        const height = converterDpi(parseFloat(pattern['@_Height']));
        const xStep = pattern['@_XStep'] ? converterDpi(parseFloat(pattern['@_XStep'])) : width;
        const yStep = pattern['@_YStep'] ? converterDpi(parseFloat(pattern['@_YStep'])) : height;
        const reflectMethod = pattern['@_ReflectMethod'] || 'Normal';
        const ctm = pattern['@_CTM'];

        const patEl = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        patEl.setAttribute('id', patId);
        patEl.setAttribute('patternUnits', 'userSpaceOnUse');

        if (ctm) {
            const ctms = parseCtm(ctm);
            patEl.setAttribute('patternTransform', `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(ctms[4])} ${converterDpi(ctms[5])})`);
        }

        // 渲染 CellContent 内容到临时容器
        const cellContentG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        renderPatternCellContent(pattern['ofd:CellContent'], cellContentG);

        if (reflectMethod === 'Normal') {
            patEl.setAttribute('width', xStep);
            patEl.setAttribute('height', yStep);
            patEl.appendChild(cellContentG);
        } else if (reflectMethod === 'Row') {
            // 水平交替翻转：pattern 宽 ×2
            patEl.setAttribute('width', xStep * 2);
            patEl.setAttribute('height', yStep);
            patEl.appendChild(cellContentG);
            const mirrorG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mirrorG.setAttribute('transform', `translate(${xStep * 2}, 0) scale(-1, 1)`);
            const cellCopy = cellContentG.cloneNode(true);
            mirrorG.appendChild(cellCopy);
            patEl.appendChild(mirrorG);
        } else if (reflectMethod === 'Column') {
            // 垂直交替翻转：pattern 高 ×2
            patEl.setAttribute('width', xStep);
            patEl.setAttribute('height', yStep * 2);
            patEl.appendChild(cellContentG);
            const mirrorG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mirrorG.setAttribute('transform', `translate(0, ${yStep * 2}) scale(1, -1)`);
            const cellCopy = cellContentG.cloneNode(true);
            mirrorG.appendChild(cellCopy);
            patEl.appendChild(mirrorG);
        } else if (reflectMethod === 'RowAndColumn') {
            // 两方向翻转：pattern 尺寸 ×2×2
            patEl.setAttribute('width', xStep * 2);
            patEl.setAttribute('height', yStep * 2);
            // 左上：原始
            patEl.appendChild(cellContentG);
            // 右上：水平翻转
            const mirrorH = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mirrorH.setAttribute('transform', `translate(${xStep * 2}, 0) scale(-1, 1)`);
            mirrorH.appendChild(cellContentG.cloneNode(true));
            patEl.appendChild(mirrorH);
            // 左下：垂直翻转
            const mirrorV = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mirrorV.setAttribute('transform', `translate(0, ${yStep * 2}) scale(1, -1)`);
            mirrorV.appendChild(cellContentG.cloneNode(true));
            patEl.appendChild(mirrorV);
            // 右下：水平+垂直翻转
            const mirrorHV = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            mirrorHV.setAttribute('transform', `translate(${xStep * 2}, ${yStep * 2}) scale(-1, -1)`);
            mirrorHV.appendChild(cellContentG.cloneNode(true));
            patEl.appendChild(mirrorHV);
        }

        defs.appendChild(patEl);
        return `url(#${patId})`;
    }
    // 轴向渐变
    const axialShd = colorObj['ofd:AxialShd'];
    if (axialShd) {
        const gradId = `ofd-grad-${gradientIdCounter++}`;
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', gradId);
        // 起止点坐标（OFD 用 mm 单位的绝对坐标，转为 gradientUnits=userSpaceOnUse）
        const startPoint = axialShd['@_StartPoint'];
        const endPoint = axialShd['@_EndPoint'];
        if (startPoint && endPoint) {
            const sp = startPoint.split(' ');
            const ep = endPoint.split(' ');
            grad.setAttribute('x1', converterDpi(parseFloat(sp[0])));
            grad.setAttribute('y1', converterDpi(parseFloat(sp[1])));
            grad.setAttribute('x2', converterDpi(parseFloat(ep[0])));
            grad.setAttribute('y2', converterDpi(parseFloat(ep[1])));
            grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        }
        // 渐变色标
        let segments = [];
        segments = segments.concat(axialShd['ofd:Segment']);
        for (const seg of segments) {
            if (!seg) continue;
            const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop.setAttribute('offset', seg['@_Position'] || '0');
            const segColor = seg['ofd:Color'];
            if (segColor) {
                stop.setAttribute('stop-color', parseColor(segColor['@_Value']));
                if (segColor['@_Alpha']) {
                    const alpha = segColor['@_Alpha'];
                    stop.setAttribute('stop-opacity', alpha > 1 ? alpha / 255 : alpha);
                }
            }
            grad.appendChild(stop);
        }
        defs.appendChild(grad);
        return `url(#${gradId})`;
    }
    // 径向渐变
    const radialShd = colorObj['ofd:RadialShd'];
    if (radialShd) {
        const gradId = `ofd-grad-${gradientIdCounter++}`;
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        grad.setAttribute('id', gradId);
        const startPoint = radialShd['@_StartPoint'];
        const endPoint = radialShd['@_EndPoint'];
        const startRadius = radialShd['@_StartRadius'];
        const endRadius = radialShd['@_EndRadius'];
        if (endPoint) {
            const ep = endPoint.split(' ');
            grad.setAttribute('cx', converterDpi(parseFloat(ep[0])));
            grad.setAttribute('cy', converterDpi(parseFloat(ep[1])));
        }
        if (startPoint) {
            const sp = startPoint.split(' ');
            grad.setAttribute('fx', converterDpi(parseFloat(sp[0])));
            grad.setAttribute('fy', converterDpi(parseFloat(sp[1])));
        }
        if (endRadius) {
            grad.setAttribute('r', converterDpi(parseFloat(endRadius)));
        }
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        let segments = [];
        segments = segments.concat(radialShd['ofd:Segment']);
        for (const seg of segments) {
            if (!seg) continue;
            const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop.setAttribute('offset', seg['@_Position'] || '0');
            const segColor = seg['ofd:Color'];
            if (segColor) {
                stop.setAttribute('stop-color', parseColor(segColor['@_Value']));
                if (segColor['@_Alpha']) {
                    const alpha = segColor['@_Alpha'];
                    stop.setAttribute('stop-opacity', alpha > 1 ? alpha / 255 : alpha);
                }
            }
            grad.appendChild(stop);
        }
        defs.appendChild(grad);
        return `url(#${gradId})`;
    }
    // 普通颜色
    if (colorObj['@_Value']) {
        return parseColor(colorObj['@_Value']);
    }
    return null;
};

/**
 * 为 SVG 元素应用 ofd:Clips 裁剪区域
 * @param {Element} svg - SVG 容器
 * @param {Object} graphicObject - 图元对象（含 ofd:Clips）
 * @param {Object} boundary - 已转换的边界框
 */
const applyClips = function (svg, graphicObject, boundary) {
    const clips = graphicObject['ofd:Clips'];
    if (!clips) return;
    let clipArray = [];
    clipArray = clipArray.concat(clips['ofd:Clip']);
    for (const clip of clipArray) {
        if (!clip) continue;
        let areaArray = [];
        areaArray = areaArray.concat(clip['ofd:Area']);
        for (const area of areaArray) {
            if (!area) continue;
            const clipPath = area['ofd:Path'];
            if (!clipPath) continue;
            const abbreviatedData = clipPath['ofd:AbbreviatedData'];
            if (!abbreviatedData) continue;
            const ctm = clipPath['@_CTM'];
            const points = calPathPoint(convertPathAbbreviatedDatatoPoint(abbreviatedData));
            let d = '';
            for (const point of points) {
                if (point.type === 'M') d += `M${point.x} ${point.y} `;
                else if (point.type === 'L') d += `L${point.x} ${point.y} `;
                else if (point.type === 'B') d += `C${point.x1} ${point.y1} ${point.x2} ${point.y2} ${point.x3} ${point.y3} `;
                else if (point.type === 'Q') d += `Q${point.x1} ${point.y1} ${point.x2} ${point.y2} `;
                else if (point.type === 'A') d += `A${point.rx} ${point.ry} ${point.rotation} ${point.arc} ${point.sweep} ${point.x} ${point.y} `;
                else if (point.type === 'C') d += `Z`;
            }
            const clipId = `ofd-clip-${clipIdCounter++}`;
            let defs = svg.querySelector('defs');
            if (!defs) {
                defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                svg.insertBefore(defs, svg.firstChild);
            }
            const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPathEl.setAttribute('id', clipId);
            const clipPathPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            clipPathPath.setAttribute('d', d);
            if (ctm) {
                const ctms = parseCtm(ctm);
                clipPathPath.setAttribute('transform', `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(ctms[4])} ${converterDpi(ctms[5])})`);
            }
            clipPathEl.appendChild(clipPathPath);
            defs.appendChild(clipPathEl);
            // 给 svg 的所有直接子内容元素应用 clip-path
            for (const child of svg.children) {
                if (child.tagName !== 'defs') {
                    child.setAttribute('clip-path', `url(#${clipId})`);
                }
            }
        }
    }
}

export const renderPageBox = function (screenWidth, pages, document) {
    let pageBoxs = [];
    for (const page of pages) {
        let boxObj = {};
        boxObj['id'] = Object.keys(page)[0];
        boxObj['box'] = calPageBox(screenWidth, document, page);
        pageBoxs.push(boxObj);
    }
    return pageBoxs;
}

export const calPageBox = function (screenWidth, document, page) {
    const area = page[Object.keys(page)[0]]['json']['ofd:Area'];
    let box;
    if (area) {
        const physicalBox = area['ofd:PhysicalBox']
        if (physicalBox) {
            box = (physicalBox);
        } else {
            const applicationBox = area['ofd:ApplicationBox']
            if (applicationBox) {
                box = (applicationBox);
            } else {
                const contentBox = area['ofd:ContentBox']
                if (contentBox) {
                    box = (contentBox);
                }
            }
        }
    } else {
        let documentArea = document['ofd:CommonData']['ofd:PageArea']
        const physicalBox = documentArea['ofd:PhysicalBox']
        if (physicalBox) {
            box = (physicalBox);
        } else {
            const applicationBox = documentArea['ofd:ApplicationBox']
            if (applicationBox) {
                box = (applicationBox);
            } else {
                const contentBox = documentArea['ofd:ContentBox']
                if (contentBox) {
                    box = (contentBox);
                }
            }
        }
    }
    let array = box.split(' ');
    const scale = ((screenWidth - 10) / parseFloat(array[2])).toFixed(1);
    setMaxPageScal(scale);
    setPageScal(scale);
    box = parseStBox( box);
    box = converterBox(box)
    return box;
}

export const calPageBoxScale = function (document, page) {
    const area = page[Object.keys(page)[0]]['json']['ofd:Area'];
    let box;
    if (area) {
        const physicalBox = area['ofd:PhysicalBox']
        if (physicalBox) {
            box = (physicalBox);
        } else {
            const applicationBox = area['ofd:ApplicationBox']
            if (applicationBox) {
                box = (applicationBox);
            } else {
                const contentBox = area['ofd:ContentBox']
                if (contentBox) {
                    box = (contentBox);
                }
            }
        }
    } else {
        let documentArea = document['ofd:CommonData']['ofd:PageArea']
        const physicalBox = documentArea['ofd:PhysicalBox']
        if (physicalBox) {
            box = (physicalBox);
        } else {
            const applicationBox = documentArea['ofd:ApplicationBox']
            if (applicationBox) {
                box = (applicationBox);
            } else {
                const contentBox = documentArea['ofd:ContentBox']
                if (contentBox) {
                    box = (contentBox);
                }
            }
        }
    }
    box = parseStBox( box);
    box = converterBox(box)
    return box;
}

// 根据模板来渲染层节点
const renderLayerFromTemplate = function (tpls, template, pageDiv, fontResObj, drawParamResObj, multiMediaResObj) {
    let array = [];
    const layers = tpls[template['@_TemplateID']]['json']['ofd:Content']['ofd:Layer'];
    array = array.concat(layers);
    for (let layer of array) {
        if (layer) {
            renderLayer(pageDiv, fontResObj, drawParamResObj, multiMediaResObj, layer, false);
        }
    }
}

/**
 * 按 Layer 类型排序：Background(背景层) → Body(正文层) → Foreground(前景层)
 * 同类型按 ZOrder 排序
 */
const LAYER_TYPE_ORDER = {'Background': 0, 'Body': 1, 'Foreground': 2};

const sortLayersByTypeAndZOrder = function (layers) {
    if (!layers || layers.length <= 1) return layers;
    return layers.slice().sort((a, b) => {
        const typeA = LAYER_TYPE_ORDER[a['@_Type']] !== undefined ? LAYER_TYPE_ORDER[a['@_Type']] : 1;
        const typeB = LAYER_TYPE_ORDER[b['@_Type']] !== undefined ? LAYER_TYPE_ORDER[b['@_Type']] : 1;
        if (typeA !== typeB) return typeA - typeB;
        const zA = parseFloat(a['@_ZOrder']) || 0;
        const zB = parseFloat(b['@_ZOrder']) || 0;
        return zA - zB;
    });
}

export const renderPage = function (pageDiv, page, tpls, fontResObj, drawParamResObj, multiMediaResObj) {
    const pageId = Object.keys(page)[0];
    const template = page[pageId]['json']['ofd:Template'];

    // 收集所有模板层
    let templateLayers = [];
    if (Array.isArray(template)) {
        template.sort((a, b) => (parseFloat(a['@_ZOrder']) || 0) - (parseFloat(b['@_ZOrder']) || 0));
        template.forEach(item => {
            if (item && tpls[item['@_TemplateID']]) {
                const layers = tpls[item['@_TemplateID']]['json']['ofd:Content']['ofd:Layer'];
                templateLayers = templateLayers.concat(layers);
            }
        });
    } else if (template && tpls[template['@_TemplateID']]) {
        const layers = tpls[template['@_TemplateID']]['json']['ofd:Content']['ofd:Layer'];
        templateLayers = templateLayers.concat(layers);
    }

    // 收集内容层
    let contentLayers = [];
    const pageLayers = page[pageId]?.json?.['ofd:Content']?.['ofd:Layer'];
    if (pageLayers) {
        contentLayers = contentLayers.concat(pageLayers);
    }

    // 合并所有层并按类型和 ZOrder 排序后渲染
    let allLayers = templateLayers.concat(contentLayers).filter(Boolean);
    allLayers = sortLayersByTypeAndZOrder(allLayers);
    for (let layer of allLayers) {
        renderLayer(pageDiv, fontResObj, drawParamResObj, multiMediaResObj, layer, false);
    }
    if (page[pageId].stamp) {
        for (const stamp of page[pageId].stamp) {
          if (stamp.type === 'ofd') {
            renderSealPage(pageDiv, stamp.obj.pages, stamp.obj.tpls, true, stamp.stamp.stampAnnot, stamp.obj.fontResObj, stamp.obj.drawParamResObj, stamp.obj.multiMediaResObj, stamp.stamp.sealObj.SES_Signature, stamp.stamp.signedInfo);
          } else if (stamp.type === 'png') {
              let sealBoundary = converterBox(stamp.obj.boundary);
              const oid = Array.isArray(stamp.stamp.stampAnnot)?stamp.stamp.stampAnnot[0]['pfIndex']:stamp.stamp.stampAnnot['pfIndex'];
              let element = renderImageOnDiv(pageDiv.style.width, pageDiv.style.height, stamp.obj.img, sealBoundary, stamp.obj.clip, true, stamp.stamp.sealObj.SES_Signature, stamp.stamp.signedInfo,oid);
              pageDiv.appendChild(element);
          }
        }
    }
    if (page[pageId].annotation) {
        for (const annotation of page[pageId].annotation) {
            renderAnnotation(pageDiv, annotation, fontResObj, drawParamResObj, multiMediaResObj);
        }
    }
}

const renderAnnotation = function (pageDiv, annotation, fontResObj, drawParamResObj, multiMediaResObj) {
    const zIndex = annotation['pfIndex'] != null ? annotation['pfIndex'] : 0;
    let div = document.createElement('div');
    div.setAttribute('style', `overflow: hidden;z-index:${zIndex};position:relative;`)
    let boundary = annotation['appearance']?.['@_Boundary'];
    if (boundary) {
        let divBoundary = converterBox(parseStBox(boundary));
        div.setAttribute('style', `overflow: hidden;z-index:${zIndex};position:absolute; left: ${divBoundary.x}px; top: ${divBoundary.y}px; width: ${divBoundary.w}px; height: ${divBoundary.h}px`)
    }
    const contentLayer = annotation['appearance'];
    renderLayer(div, fontResObj, drawParamResObj, multiMediaResObj, contentLayer, false);
    if (annotation.actions && annotation.actions.length > 0) {
        for (const action of annotation.actions) {
            if (action.type === 'URI') {
                div.style.cursor = 'pointer';
                div.addEventListener('click', () => window.open(action.uri, '_blank'));
            } else if (action.type === 'Goto') {
                div.style.cursor = 'pointer';
                div.setAttribute('data-goto-page', action.pageId);
            }
        }
    }
    pageDiv.appendChild(div);
}

const renderSealPage = function (pageDiv, pages, tpls, isStampAnnot, stampAnnot, fontResObj, drawParamResObj, multiMediaResObj, SES_Signature, signedInfo) {
    for (const page of pages) {
        const pageId = Object.keys(page)[0];
        let stampAnnotBoundary = {x: 0, y: 0, w: 0, h: 0};
        if (isStampAnnot && stampAnnot) {
            stampAnnotBoundary = stampAnnot.boundary;
        }
        let divBoundary = converterBox(stampAnnotBoundary);
        let div = document.createElement('div');
        div.setAttribute("name","seal_img_div");
        div.setAttribute('style', `cursor: pointer; position:relative; left: ${divBoundary.x}px; top: ${divBoundary.y}px; width: ${divBoundary.w}px; height: ${divBoundary.h}px`)
        div.setAttribute('data-ses-signature', `${JSON.stringify(SES_Signature)}`);
        div.setAttribute('data-signed-info', `${JSON.stringify(signedInfo)}`);
        const template = page[pageId]['json']['ofd:Template'];
        if (template) {
            const layers = tpls[template['@_TemplateID']]['json']['ofd:Content']['ofd:Layer'];
            let array = [];
            array = array.concat(layers);
            for (let layer of array) {
                if (layer) {
                    renderLayer(div, fontResObj, drawParamResObj, multiMediaResObj, layer,  isStampAnnot);
                }
            }
        }
        const contentLayers = page[pageId]['json']['ofd:Content']['ofd:Layer'];
        let array = [];
        array = array.concat(contentLayers);
        for (let contentLayer of array) {
            if (contentLayer) {
                renderLayer(div, fontResObj, drawParamResObj, multiMediaResObj, contentLayer, isStampAnnot);
            }
        }
        pageDiv.appendChild(div);
    }
}

const renderLayer = function (pageDiv, fontResObj, drawParamResObj, multiMediaResObj, layer, isStampAnnot) {
    let fillColor = null;
    let strokeColor = null;
    let lineWith = converterDpi(0.353);
    let drawParam = layer?.['@_DrawParam'];
    if (drawParam && Object.keys(drawParamResObj).length > 0 && drawParamResObj[drawParam]) {
        if (drawParamResObj[drawParam]['relative']) {
            drawParam = drawParamResObj[drawParam]['relative'];
            if (drawParamResObj[drawParam]['FillColor']) {
                fillColor = parseColor(drawParamResObj[drawParam]['FillColor']);
            }
            if (drawParamResObj[drawParam]['StrokeColor']) {
                strokeColor = parseColor(drawParamResObj[drawParam]['StrokeColor']);
            }
            if (drawParamResObj[drawParam]['LineWidth']) {
                lineWith = converterDpi(drawParamResObj[drawParam]['LineWidth']);
            }
        }
        if (drawParamResObj[drawParam]['FillColor']) {
            fillColor = parseColor(drawParamResObj[drawParam]['FillColor']);
        }
        if (drawParamResObj[drawParam]['StrokeColor']) {
            strokeColor = parseColor(drawParamResObj[drawParam]['StrokeColor']);
        }
        if (drawParamResObj[drawParam]['LineWidth']) {
            lineWith = converterDpi(drawParamResObj[drawParam]['LineWidth']);
        }
    }
    renderBlockContent(pageDiv, fontResObj, drawParamResObj, multiMediaResObj, layer, fillColor, strokeColor, lineWith, isStampAnnot);
}

const renderBlockContent = function (pageDiv, fontResObj, drawParamResObj, multiMediaResObj, block, fillColor, strokeColor, lineWith, isStampAnnot) {
    if (!block) return;
    const imageObjects = block['ofd:ImageObject'];
    let imageObjectArray = [];
    imageObjectArray = imageObjectArray.concat(imageObjects);
    for (const imageObject of imageObjectArray) {
        if (imageObject) {
            let element = renderImageObject(pageDiv.style.width, pageDiv.style.height, multiMediaResObj, imageObject)
            pageDiv.appendChild(element);
        }
    }
    const pathObjects = block['ofd:PathObject'];
    let pathObjectArray = [];
    pathObjectArray = pathObjectArray.concat(pathObjects);
    for (const pathObject of pathObjectArray) {
        if (pathObject) {
            let svg = renderPathObject(drawParamResObj, pathObject, fillColor, strokeColor, lineWith, isStampAnnot)
            pageDiv.appendChild(svg);
        }
    }
    const textObjects = block['ofd:TextObject'];
    let textObjectArray = [];
    textObjectArray = textObjectArray.concat(textObjects);
    for (const textObject of textObjectArray) {
        if (textObject) {
            let svg = renderTextObject(fontResObj, textObject, fillColor, strokeColor);
            pageDiv.appendChild(svg);
        }
    }
    const pageBlocks = block['ofd:PageBlock'];
    if (pageBlocks) {
        let blockArray = [];
        blockArray = blockArray.concat(pageBlocks);
        for (const subBlock of blockArray) {
            if (subBlock) {
                renderBlockContent(pageDiv, fontResObj, drawParamResObj, multiMediaResObj, subBlock, fillColor, strokeColor, lineWith, isStampAnnot);
            }
        }
    }
}

export const renderImageObject = function (pageWidth, pageHeight, multiMediaResObj, imageObject){
    let boundary = parseStBox(imageObject['@_Boundary']);
    boundary = converterBox(boundary);
    const resId = imageObject['@_ResourceID'];
    const ctm = imageObject['@_CTM'];
    const alpha = imageObject['@_Alpha'];
    const imageMask = imageObject['@_ImageMask'];

    // Substitution: 主资源不可用时使用替代资源
    let effectiveResId = resId;
    if (!multiMediaResObj[resId]) {
        const subId = imageObject['@_Substitution'];
        if (subId && multiMediaResObj[subId]) {
            effectiveResId = subId;
        } else {
            return document.createElement('div');
        }
    }

    let ctmStyle = '';
    if (ctm) {
        const ctms = parseCtm(ctm);
        ctmStyle = `transform:matrix(${ctms[0]},${ctms[1]},${ctms[2]},${ctms[3]},${converterDpi(ctms[4])}px,${converterDpi(ctms[5])}px);`;
    }
    let opacityStyle = '';
    if (alpha) {
        opacityStyle = `opacity:${alpha > 1 ? alpha / 255 : alpha};`;
    }
    let element;

    // ImageMask: 图像作为模板掩模，用 FillColor 着色
    if (imageMask === 'true' || imageMask === true) {
        const fillColor = imageObject['ofd:FillColor'];
        const maskColor = fillColor ? parseColor(fillColor['@_Value']) : 'rgb(0, 0, 0)';
        element = renderImageMask(multiMediaResObj[effectiveResId], boundary, maskColor, imageObject['pfIndex'], ctmStyle, opacityStyle);
    } else if (multiMediaResObj[effectiveResId].format === 'gbig2') {
        const img = multiMediaResObj[effectiveResId].img;
        const width = multiMediaResObj[effectiveResId].width;
        const height = multiMediaResObj[effectiveResId].height;
        element = renderImageOnCanvas(img, width, height, boundary, imageObject['pfIndex'], ctmStyle, opacityStyle);
    } else {
        element = renderImageOnDiv(pageWidth, pageHeight, multiMediaResObj[effectiveResId].img, boundary, false, false, null, null, imageObject['pfIndex'], ctmStyle, opacityStyle);
    }
    const border = imageObject['ofd:Border'];
    if (border) {
        const bw = border['@_LineWidth'] ? converterDpi(parseFloat(border['@_LineWidth'])) : 1;
        const bc = border['ofd:BorderColor'] ? parseColor(border['ofd:BorderColor']['@_Value']) : 'rgb(0,0,0)';
        element.style.border = `${bw}px solid ${bc}`;
    }
    return element;
}

/**
 * 渲染 ImageMask 掩模图像：图像数据定义掩模区域，黑色像素用 FillColor 填充，白色像素透明。
 * 使用 SVG <mask> 元素实现 stencil masking 效果。
 */
const renderImageMask = function (mediaRes, boundary, maskColor, oid, ctmStyle, opacityStyle) {
    const maskId = `image-mask-${oid || Math.random().toString(36).substr(2, 9)}`;
    const svgNS = 'http://www.w3.org/2000/svg';
    const xlinkNS = 'http://www.w3.org/1999/xlink';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('version', '1.1');
    svg.setAttribute('width', boundary.w);
    svg.setAttribute('height', boundary.h);
    svg.setAttribute('style', `position:absolute;left:${boundary.x}px;top:${boundary.y}px;z-index:${oid || 0};${ctmStyle || ''}${opacityStyle || ''}`);

    const defs = document.createElementNS(svgNS, 'defs');
    const mask = document.createElementNS(svgNS, 'mask');
    mask.setAttribute('id', maskId);

    if (mediaRes.format === 'gbig2') {
        // JBIG2 格式：用 canvas 生成 data URL
        const imgWidth = mediaRes.width;
        const imgHeight = mediaRes.height;
        const arr = new Uint8ClampedArray(4 * imgWidth * imgHeight);
        for (let i = 0; i < mediaRes.img.length; i++) {
            arr[4 * i] = mediaRes.img[i];
            arr[4 * i + 1] = mediaRes.img[i];
            arr[4 * i + 2] = mediaRes.img[i];
            arr[4 * i + 3] = 255;
        }
        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        canvas.getContext('2d').putImageData(new ImageData(arr, imgWidth, imgHeight), 0, 0);
        const maskImage = document.createElementNS(svgNS, 'image');
        maskImage.setAttributeNS(xlinkNS, 'href', canvas.toDataURL());
        maskImage.setAttribute('width', boundary.w);
        maskImage.setAttribute('height', boundary.h);
        mask.appendChild(maskImage);
    } else {
        const maskImage = document.createElementNS(svgNS, 'image');
        maskImage.setAttributeNS(xlinkNS, 'href', mediaRes.img);
        maskImage.setAttribute('width', boundary.w);
        maskImage.setAttribute('height', boundary.h);
        mask.appendChild(maskImage);
    }

    defs.appendChild(mask);
    svg.appendChild(defs);

    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('width', boundary.w);
    rect.setAttribute('height', boundary.h);
    rect.setAttribute('fill', maskColor);
    rect.setAttribute('mask', `url(#${maskId})`);
    svg.appendChild(rect);

    return svg;
}

const renderImageOnCanvas = function (img, imgWidth, imgHeight, boundary, oid, ctmStyle, opacityStyle){
    const arr = new Uint8ClampedArray(4 * imgWidth * imgHeight);
    for (var i = 0; i < img.length; i++) {
        arr[4 * i] = img[i];
        arr[4 * i + 1] = img[i];
        arr[4 * i + 2] = img[i];
        arr[4 * i + 3] = 255;
    }
    let imageData = new ImageData(arr, imgWidth, imgHeight);
    let canvas = document.createElement('canvas');
    canvas.width = imgWidth;
    canvas.height = imgHeight;
    let context = canvas.getContext('2d');
    context.putImageData(imageData, 0, 0);
    canvas.setAttribute('style', `position:absolute;left: ${boundary.x}px; top: ${boundary.y}px; width: ${boundary.w}px; height: ${boundary.h}px;z-index: ${oid};${ctmStyle || ''}${opacityStyle || ''}`)
    return canvas;
}

export const renderImageOnDiv = function (pageWidth, pageHeight, imgSrc, boundary, clip, isStampAnnot, SES_Signature, signedInfo, oid, ctmStyle, opacityStyle) {
    let div = document.createElement('div');
    if(isStampAnnot)
    {
        div.setAttribute("name","seal_img_div");
        div.setAttribute('data-ses-signature', `${JSON.stringify(SES_Signature)}`);
        div.setAttribute('data-signed-info', `${JSON.stringify(signedInfo)}`);
    }
    let img = document.createElement('img');
    img.src = imgSrc;
    img.setAttribute('width', '100%');
    img.setAttribute('height', '100%');
    div.appendChild(img);
    const pw = parseFloat(pageWidth.replace('px', ''));
    const ph = parseFloat(pageHeight.replace('px', ''));
    const w = boundary.w > pw ? pw : boundary.w;
    const h = boundary.h > ph ? ph : boundary.h;
    let c = '';
    if (clip) {
        clip = converterBox(clip);
        c = `clip: rect(${clip.y}px, ${clip.w + clip.x}px, ${clip.h + clip.y}px, ${clip.x}px)`
    }
    div.setAttribute('style', `cursor: pointer; overflow: hidden; position: absolute; left: ${c ? boundary.x : boundary.x < 0 ? 0 : boundary.x}px; top: ${c ? boundary.y : boundary.y < 0 ? 0 : boundary.y}px; width: ${w}px; height: ${h}px; ${c};z-index: ${oid};${ctmStyle || ''}${opacityStyle || ''}`)
    return div;
}

/**
 * 解析 CGTransform 元素，构建字符位置 → 字形索引的映射
 * @returns {Map<number, number|number[]>} charIndex → glyphIndex（-1 表示被连字吞并需跳过）
 */
const parseCGTransformMap = function (cgTransforms) {
    let arr = [];
    arr = arr.concat(cgTransforms);
    const map = new Map();
    for (const cg of arr) {
        if (!cg) continue;
        const codePosition = parseInt(cg['@_CodePosition']) || 0;
        const codeCount = parseInt(cg['@_CodeCount']) || 1;
        const glyphCount = parseInt(cg['@_GlyphCount']) || codeCount;
        const glyphsStr = cg['ofd:Glyphs'];
        if (!glyphsStr) continue;
        const glyphs = glyphsStr.toString().split(' ').map(s => parseInt(s)).filter(n => !isNaN(n));

        if (codeCount === glyphCount) {
            for (let i = 0; i < codeCount && i < glyphs.length; i++) {
                map.set(codePosition + i, glyphs[i]);
            }
        } else if (glyphCount < codeCount) {
            // 连字：多字符 → 少字形，前 glyphCount 个字符分配字形，其余标记跳过
            for (let i = 0; i < glyphCount && i < glyphs.length; i++) {
                map.set(codePosition + i, glyphs[i]);
            }
            for (let i = glyphCount; i < codeCount; i++) {
                map.set(codePosition + i, -1);
            }
        } else {
            // 分解：少字符 → 多字形，第一个字符承载所有字形索引
            map.set(codePosition, glyphs);
            for (let i = 1; i < codeCount; i++) {
                map.set(codePosition + i, -1);
            }
        }
    }
    return map;
}

/**
 * 计算每个字符的独立坐标位置（用于 CGTransform 逐字形渲染）
 */
const computeCharPositions = function (textCodes) {
    let positions = [];
    let globalIndex = 0;
    for (let textCode of textCodes) {
        if (!textCode) continue;
        let x = parseFloat(textCode['@_X']) || 0;
        let y = parseFloat(textCode['@_Y']) || 0;
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
            for (let i = 0; i < textStr.length; i++) {
                if (i > 0 && deltaXList.length > 0) {
                    x += deltaXList[i - 1];
                }
                if (i > 0 && deltaYList.length > 0) {
                    y += deltaYList[i - 1];
                }
                positions.push({
                    x: converterDpi(x),
                    y: converterDpi(y),
                    char: textStr[i],
                    globalIndex: globalIndex++
                });
            }
        }
    }
    return positions;
}

/**
 * 使用 opentype.js 将字形索引渲染为 SVG <path> 元素
 */
const renderTextWithCGTransform = function (svg, textCodes, cgTransforms, fontObj, fontSize,
    fillColor, strokeColor, fillOpacity, ctm, hScale, textObject) {
    const glyphMap = parseCGTransformMap(cgTransforms);
    const charPositions = computeCharPositions(textCodes);
    const color = fillColor || strokeColor || 'rgb(0, 0, 0)';
    const isStroke = textObject['@_Stroke'] === 'true';

    let g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (ctm) {
        const ctms = parseCtm(ctm);
        g.setAttribute('transform', `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(ctms[4])} ${converterDpi(ctms[5])})`);
    }
    if (hScale) {
        const firstX = charPositions.length > 0 ? charPositions[0].x : 0;
        g.setAttribute('transform', `matrix(${hScale}, 0, 0, 1, ${(1 - hScale) * firstX}, 0)`);
    }

    for (const pos of charPositions) {
        const entry = glyphMap.get(pos.globalIndex);
        if (entry === -1) continue;

        let glyphIndices;
        if (entry !== undefined) {
            glyphIndices = Array.isArray(entry) ? entry : [entry];
        } else {
            const glyph = fontObj.charToGlyph(pos.char);
            glyphIndices = glyph ? [glyph.index] : [];
        }

        let xOffset = 0;
        for (const glyphIndex of glyphIndices) {
            if (glyphIndex <= 0) continue;
            const glyph = fontObj.glyphs.get(glyphIndex);
            if (!glyph || !glyph.path) continue;

            const path = glyph.getPath(pos.x + xOffset, pos.y, fontSize);
            const pathData = path.toPathData(2);
            if (!pathData || pathData === '') continue;

            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', pathData);
            if (isStroke && strokeColor) {
                pathEl.setAttribute('stroke', strokeColor);
                pathEl.setAttribute('fill', 'none');
            } else {
                pathEl.setAttribute('fill', color);
            }
            pathEl.setAttribute('fill-opacity', fillOpacity);
            g.appendChild(pathEl);

            if (glyphIndices.length > 1) {
                const advanceWidth = glyph.advanceWidth || fontObj.unitsPerEm;
                xOffset += (advanceWidth / fontObj.unitsPerEm) * fontSize;
            }
        }
    }
    svg.appendChild(g);
}

export const renderTextObject = function (fontResObj, textObject, defaultFillColor, defaultStrokeColor) {
    let defaultFillOpacity = 1;
    let boundary = parseStBox(textObject['@_Boundary']);
    boundary = converterBox(boundary);
    const ctm = textObject['@_CTM'];
    const hScale = textObject['@_HScale'];
    const font = textObject['@_Font'];
    const weight = textObject['@_Weight'];
    const italic = textObject['@_Italic'];
    const readDirection = parseInt(textObject['@_ReadDirection']) || 0;
    const charDirection = parseInt(textObject['@_CharDirection']) || 0;
    const size = converterDpi(parseFloat(textObject['@_Size']));
    let array = [];
    array = array.concat(textObject['ofd:TextCode']);
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('version', '1.1');
    const fillColor = textObject['ofd:FillColor'];
    if (fillColor) {
        defaultFillColor = parseColor(fillColor['@_Value']);
        let alpha = fillColor['@_Alpha'];
        if (alpha) {
            defaultFillOpacity = alpha > 1 ? alpha / 255 : alpha;
        }
    }

    const cgTransforms = textObject['ofd:CGTransform'];
    const fontInfo = fontResObj[font];
    const fontObj = fontInfo && typeof fontInfo === 'object' ? fontInfo.fontObj : null;

    if (cgTransforms && fontObj) {
        renderTextWithCGTransform(svg, array, cgTransforms, fontObj, size,
            defaultFillColor, defaultStrokeColor, defaultFillOpacity,
            ctm, hScale, textObject);
    } else {
        const textCodePointList = calTextPoint(array);
        for (const textCodePoint of textCodePointList) {
            if (textCodePoint && textCodePoint.x.length > 0 && !isNaN(textCodePoint.x[0])) {
                let text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', textCodePoint.x.join(' '));
                text.setAttribute('y', textCodePoint.y);
                text.innerHTML = textCodePoint.text;
                if (ctm) {
                    const ctms = parseCtm(ctm);
                    text.setAttribute('transform', `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(ctms[4])} ${converterDpi(ctms[5])})`)
                }
                if (hScale) {
                    text.setAttribute('transform', `matrix(${hScale}, 0, 0, 1, ${(1-hScale)*textCodePoint.x[0]}, 0)`)
                }
                text.setAttribute('fill', defaultFillColor || defaultStrokeColor || 'rgb(0, 0, 0)');
                text.setAttribute('fill-opacity', defaultFillOpacity);
                if (textObject['@_Stroke'] === 'true' && defaultStrokeColor) {
                    text.setAttribute('stroke', defaultStrokeColor);
                }
                let fontStyle = italic === 'true' ? 'font-style:italic;' : '';
                let writingMode = '';
                if (readDirection === 90 || readDirection === 270) {
                    writingMode = 'writing-mode:tb;';
                }
                let charRotate = '';
                if (charDirection && charDirection !== 0) {
                    charRotate = `glyph-orientation-vertical:${charDirection};`;
                }
                text.setAttribute('style', `font-weight: ${weight};font-size:${size}px;font-family: ${getFontFamily(fontResObj[font])};${fontStyle}${writingMode}${charRotate}`)
                svg.appendChild(text);
            }
        }
    }

    let width = boundary.w;
    let height = boundary.h;
    let left = boundary.x;
    let top = boundary.y;
    svg.setAttribute('style', `overflow:visible;position:absolute;width:${width}px;height:${height}px;left:${left}px;top:${top}px;z-index:${textObject['pfIndex']}`);
    applyClips(svg, textObject, boundary);
    return svg;
}

export const renderPathObject = function (drawParamResObj, pathObject, defaultFillColor, defaultStrokeColor, defaultLineWith, isStampAnnot) {
    let boundary = parseStBox(pathObject['@_Boundary']);
    boundary = converterBox(boundary);
    let lineWidth = pathObject['@_LineWidth'];
    const abbreviatedData = pathObject['ofd:AbbreviatedData'];
    const subpaths = pathObject['ofd:Subpath'];
    if (!abbreviatedData && !subpaths) {
        let emptySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        return emptySvg;
    }
    const points = abbreviatedData
        ? calPathPoint(convertPathAbbreviatedDatatoPoint(abbreviatedData))
        : calPathPoint(convertXmlSubpathToPoints(subpaths));
    const ctm = pathObject['@_CTM'];
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('version', '1.1');
    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (lineWidth) {
        defaultLineWith = converterDpi(lineWidth);
    }
    let joinStyle = pathObject['@_Join'];
    let capStyle = pathObject['@_Cap'];
    let dashPattern = pathObject['@_DashPattern'];
    let dashOffset = pathObject['@_DashOffset'];
    let miterLimit = pathObject['@_MiterLimit'];
    const drawParam = pathObject['@_DrawParam'];
    if (drawParam && drawParamResObj[drawParam]) {
        let dp = drawParamResObj[drawParam];
        if (dp.relative && drawParamResObj[dp.relative]) {
            let relDp = drawParamResObj[dp.relative];
            if (relDp.FillColor && !pathObject['ofd:FillColor']) defaultFillColor = parseColor(relDp.FillColor);
            if (relDp.StrokeColor && !pathObject['ofd:StrokeColor']) defaultStrokeColor = parseColor(relDp.StrokeColor);
            if (relDp.LineWidth) lineWidth = relDp.LineWidth;
            if (relDp.Join && !joinStyle) joinStyle = relDp.Join;
            if (relDp.Cap && !capStyle) capStyle = relDp.Cap;
            if (relDp.DashPattern && !dashPattern) dashPattern = relDp.DashPattern;
            if (relDp.DashOffset && !dashOffset) dashOffset = relDp.DashOffset;
            if (relDp.MiterLimit && !miterLimit) miterLimit = relDp.MiterLimit;
        }
        if (dp.FillColor && !pathObject['ofd:FillColor']) defaultFillColor = parseColor(dp.FillColor);
        if (dp.StrokeColor && !pathObject['ofd:StrokeColor']) defaultStrokeColor = parseColor(dp.StrokeColor);
        if (dp.LineWidth) {
            defaultLineWith = converterDpi(dp.LineWidth);
        }
        if (!joinStyle && dp.Join) joinStyle = dp.Join;
        if (!capStyle && dp.Cap) capStyle = dp.Cap;
        if (!dashPattern && dp.DashPattern) dashPattern = dp.DashPattern;
        if (!dashOffset && dp.DashOffset) dashOffset = dp.DashOffset;
        if (!miterLimit && dp.MiterLimit) miterLimit = dp.MiterLimit;
    }
    if (ctm) {
        const ctms = parseCtm(ctm);
        path.setAttribute('transform', `matrix(${ctms[0]} ${ctms[1]} ${ctms[2]} ${ctms[3]} ${converterDpi(ctms[4])} ${converterDpi(ctms[5])})`)
    }
    let strokeStyle = '';
    let strokeOpacity = '';
    let fillOpacity = '';
    const strokeColor = pathObject['ofd:StrokeColor'];
    if (strokeColor) {
        const gradOrColor = parseColorOrGradient(strokeColor, svg);
        if (gradOrColor) defaultStrokeColor = gradOrColor;
        if (strokeColor['@_Alpha']) {
            let alpha = strokeColor['@_Alpha'];
            strokeOpacity = `stroke-opacity:${alpha > 1 ? alpha / 255 : alpha};`;
        }
    }
    let fillStyle = 'fill: none;';
    const fillColor = pathObject['ofd:FillColor'];
    if (fillColor) {
        const gradOrColor = parseColorOrGradient(fillColor, svg);
        if (gradOrColor) defaultFillColor = gradOrColor;
        if (fillColor['@_Alpha']) {
            let alpha = fillColor['@_Alpha'];
            fillOpacity = `fill-opacity:${alpha > 1 ? alpha / 255 : alpha};`;
        }
    }
    if (defaultLineWith > 0 && !defaultStrokeColor) {
        defaultStrokeColor = defaultFillColor;
        if (!defaultStrokeColor) {
            defaultStrokeColor = 'rgb(0, 0, 0)';
        }
    }
    let lineJoin = '';
    if (joinStyle === 'Bevel') lineJoin = 'stroke-linejoin:bevel;';
    else if (joinStyle === 'Round') lineJoin = 'stroke-linejoin:round;';
    else if (joinStyle === 'Miter') lineJoin = 'stroke-linejoin:miter;';
    let lineCap = '';
    if (capStyle === 'Round') lineCap = 'stroke-linecap:round;';
    else if (capStyle === 'Square') lineCap = 'stroke-linecap:square;';
    else if (capStyle === 'Butt') lineCap = 'stroke-linecap:butt;';
    let dashStyle = '';
    if (dashPattern) {
        const dashes = dashPattern.split(' ').map(v => converterDpi(parseFloat(v))).join(' ');
        dashStyle = `stroke-dasharray:${dashes};`;
        if (dashOffset) {
            dashStyle += `stroke-dashoffset:${converterDpi(parseFloat(dashOffset))};`;
        }
    }
    let miterStyle = '';
    if (miterLimit) {
        miterStyle = `stroke-miterlimit:${miterLimit};`;
    }
    strokeStyle = `stroke:${defaultStrokeColor};stroke-width:${defaultLineWith}px;${strokeOpacity}${lineJoin}${lineCap}${dashStyle}${miterStyle}`;
    if (pathObject['@_Stroke'] == 'false') {
        strokeStyle = ``;
    }
    if (pathObject['@_Fill'] != 'false') {
        let fallbackFill = pathObject['@_Fill'] === 'true' ? 'rgb(0, 0, 0)' : 'none';
        fillStyle = `fill:${isStampAnnot ? 'none' : defaultFillColor || fallbackFill};${fillOpacity}`;
    }
    const rule = pathObject['@_Rule'];
    let fillRule = '';
    if (rule === 'Even-Odd') {
        fillRule = 'fill-rule:evenodd;';
    } else if (rule === 'NonZero') {
        fillRule = 'fill-rule:nonzero;';
    }
    path.setAttribute('style', `${strokeStyle};${fillStyle}${fillRule}`)
    let d = '';
    for (const point of points) {
        if (point.type === 'M') {
            d += `M${point.x} ${point.y} `;
        } else if (point.type === 'L') {
            d += `L${point.x} ${point.y} `;
        } else if (point.type === 'B') {
            d += `C${point.x1} ${point.y1} ${point.x2} ${point.y2} ${point.x3} ${point.y3} `;
        } else if (point.type === 'Q') {
            d += `Q${point.x1} ${point.y1} ${point.x2} ${point.y2} `;
        } else if (point.type === 'A') {
            d += `A${point.rx} ${point.ry} ${point.rotation} ${point.arc} ${point.sweep} ${point.x} ${point.y} `;
        } else if (point.type === 'C') {
            d += `Z`;
        }
    }
    path.setAttribute('d', d);
    svg.appendChild(path);
    let width = isStampAnnot ? boundary.w : Math.ceil(boundary.w);
    let height = isStampAnnot ? boundary.h : Math.ceil(boundary.h);
    let left = boundary.x;
    let top = boundary.y;
    svg.setAttribute('style', `overflow:visible;position:absolute;width:${width}px;height:${height}px;left:${left}px;top:${top}px;z-index:${pathObject['pfIndex']}`);
    applyClips(svg, pathObject, boundary);
    return svg;
}
