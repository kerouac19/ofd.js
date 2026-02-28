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

import {pipeline} from "@/utils/ofd/pipeline";
import JsZip from "jszip";
import {parseStBox, getExtensionByPath, replaceFirstSlash} from "@/utils/ofd/ofd_util";
let parser = require('ofd-xml-parser');
import {Jbig2Image} from '../jbig2/jbig2';
import {parseSesSignature} from "@/utils/ofd/ses_signature_parser";

let opentype = null;
try {
    opentype = require('opentype.js');
} catch (e) {
    // opentype.js 不可用时，CGTransform 字形路径渲染将自动降级
}

export const unzipOfd = function (file) {
    return new Promise((resolve, reject) => {
        JsZip.loadAsync(file)
            .then(function (zip) {
                resolve(zip);
            }, function (e) {
                reject(e);
            });
    });
}

export const getDocRoots = async function (zip) {
    const data = await getJsonFromXmlContent(zip, 'OFD.xml');
    const docbodys = data['json']['ofd:OFD']['ofd:DocBody'];
    let array = [];
    array = array.concat(docbodys);
    return [zip, array]
}

export const parseSingleDoc = async function ([zip, array]) {
    let docs = [];
    for (let docbody of array) {
        if (docbody) {
            let res = await doGetDocRoot(zip, docbody);
            res = await getDocument(res);
            res = await getDocumentRes(res);
            res = await getPublicRes(res);
            res = await getTemplatePage(res);
            res = await getPage(res);
            docs.push(res);
        }
    }
    return docs;
}

export const doGetDocRoot = async function (zip, docbody) {
    let docRoot = docbody['ofd:DocRoot'];
    docRoot = replaceFirstSlash(docRoot);
    const doc = docRoot.split('/')[0];
    const docInfo = docbody['ofd:DocInfo'] || {};
    const signatures = docbody['ofd:Signatures'];
    const stampAnnot = await getSignature(zip, signatures, doc);
    let stampAnnotArray = {};
    for (const stamp of stampAnnot) {
        if (stamp.sealObj && Object.keys(stamp.sealObj).length > 0) {
            if (stamp.sealObj.type === 'ofd') {
                const stampObjs = await getSealDocumentObj(stamp);
                for (let stampObj of stampObjs) {
                    stamp.stampAnnot.boundary = parseStBox(stamp.stampAnnot['@_Boundary']);
                    //console.log(stamp.stampAnnot.boundary)
                    stamp.stampAnnot.pageRef = stamp.stampAnnot['@_PageRef'];
                    if (!stampAnnotArray[stamp.stampAnnot['@_PageRef']]) {
                        stampAnnotArray[stamp.stampAnnot['@_PageRef']] = [];
                    }
                    stampAnnotArray[stamp.stampAnnot['@_PageRef']].push({type: 'ofd', obj: stampObj, stamp});
                }
            } else if (stamp.sealObj.type === 'png') {
                let img = 'data:image/png;base64,' + btoa(String.fromCharCode.apply(null, stamp.sealObj.ofdArray));
                let stampArray = [];
                stampArray = stampArray.concat(stamp.stampAnnot);
                for (const annot of stampArray) {
                    if (annot) {
                        const stampObj = {img, pageId: annot['@_PageRef'], 'boundary': parseStBox(annot['@_Boundary']), 'clip': parseStBox(annot['@_Clip'])};
                        if (!stampAnnotArray[annot['@_PageRef']]) {
                            stampAnnotArray[annot['@_PageRef']] = [];
                        }
                        stampAnnotArray[annot['@_PageRef']].push({type: 'png', obj: stampObj, stamp});
                    }
                }
            }
        }
    }
    return [zip, doc, docRoot, stampAnnotArray, docInfo];
}

export const getDocument = async function ([zip, doc, docRoot, stampAnnot, docInfo]) {
    const data = await getJsonFromXmlContent(zip, docRoot);
    const documentObj = data['json']['ofd:Document'];
    let annotations = documentObj['ofd:Annotations'];
    let array = [];
    let annoBase;
    if (annotations) {
        if (annotations.indexOf('/') !== -1) {
            annoBase = annotations.substring(0, annotations.indexOf('/'));
        }
        if (annotations.indexOf(doc) === -1) {
            annotations = `${doc}/${annotations}`;
        }
        if (zip.files[annotations]) {
            annotations = await getJsonFromXmlContent(zip, annotations);
            array = array.concat(annotations['json']['ofd:Annotations']['ofd:Page']);
        }
    }
    const annotationObjs = await getAnnotations(annoBase, array, doc, zip)
    const outlines = parseOutlines(documentObj['ofd:Outlines']);
    const bookmarks = parseBookmarks(documentObj['ofd:Bookmarks']);
    const attachments = await getAttachmentList(zip, doc, documentObj);
    const docMeta = {docInfo, outlines, bookmarks, attachments};
    return [zip, doc, documentObj, stampAnnot, annotationObjs, docMeta];
}

const getAnnotations = async function (annoBase, annotations, doc, zip) {
    let annotationObjs = {};
    for (let anno of annotations) {
        if (!anno) {
            continue
        }
        const pageId = anno['@_PageID'];
        let fileLoc = anno['ofd:FileLoc'];
        fileLoc = replaceFirstSlash(fileLoc);
        if (annoBase && fileLoc.indexOf(annoBase) === -1) {
            fileLoc = `${annoBase}/${fileLoc}`;
        }
        if (fileLoc.indexOf(doc) === -1) {
            fileLoc = `${doc}/${fileLoc}`;
        }

        if (zip.files[fileLoc]) {
            const data = await getJsonFromXmlContent(zip, fileLoc);

            let array = [];
            array = array.concat(data['json']['ofd:PageAnnot']['ofd:Annot']);
            if (!annotationObjs[pageId]) {
                annotationObjs[pageId] = [];
            }
            for (let i = 0; i < array.length; i++) {
                let annot = array[i];
                if (!annot) {
                    continue
                }
                const type = annot['@_Type'];
                const visible = annot['@_Visible'] ? annot['@_Visible']:true;
                const appearance = annot['ofd:Appearance'];
                const parsedActions = parseActions(annot['ofd:Actions']);
                let appearanceObj = {type, appearance, visible, pfIndex: i, actions: parsedActions};
                annotationObjs[pageId].push(appearanceObj);
            }
        }
    }
    return annotationObjs;
}

const parseActions = function (actionsObj) {
    if (!actionsObj) return [];
    let result = [];
    let actionArray = [];
    actionArray = actionArray.concat(actionsObj['ofd:Action']);
    for (const action of actionArray) {
        if (!action) continue;
        if (action['ofd:URI']) {
            result.push({type: 'URI', uri: action['ofd:URI']});
        } else if (action['ofd:Goto']) {
            const dest = action['ofd:Goto']['ofd:Dest'];
            if (dest) {
                result.push({
                    type: 'Goto',
                    pageId: dest['@_PageID'],
                    left: parseFloat(dest['@_Left']) || 0,
                    top: parseFloat(dest['@_Top']) || 0
                });
            }
        }
    }
    return result;
}

const parseOutlines = function (outlinesObj) {
    if (!outlinesObj) return [];
    let result = [];
    let elems = [];
    elems = elems.concat(outlinesObj['ofd:OutlineElem']);
    for (const elem of elems) {
        if (!elem) continue;
        result.push(parseOutlineElem(elem));
    }
    return result;
}

const parseOutlineElem = function (elem) {
    const title = elem['@_Title'] || '';
    const actions = parseActions(elem['ofd:Actions']);
    let children = [];
    if (elem['ofd:OutlineElem']) {
        let childElems = [];
        childElems = childElems.concat(elem['ofd:OutlineElem']);
        for (const child of childElems) {
            if (!child) continue;
            children.push(parseOutlineElem(child));
        }
    }
    return {title, actions, children};
}

const parseBookmarks = function (bookmarksObj) {
    if (!bookmarksObj) return [];
    let result = [];
    let bmArray = [];
    bmArray = bmArray.concat(bookmarksObj['ofd:Bookmark']);
    for (const bm of bmArray) {
        if (!bm) continue;
        const name = bm['@_Name'] || '';
        const dest = bm['ofd:Dest'];
        let bookmark = {name};
        if (dest) {
            bookmark.pageId = dest['@_PageID'];
            bookmark.left = parseFloat(dest['@_Left']) || 0;
            bookmark.top = parseFloat(dest['@_Top']) || 0;
        }
        result.push(bookmark);
    }
    return result;
}

const getAttachmentList = async function (zip, doc, documentObj) {
    let attachmentsPath = documentObj['ofd:Attachments'];
    if (!attachmentsPath) return [];
    if (typeof attachmentsPath !== 'string') return [];
    attachmentsPath = replaceFirstSlash(attachmentsPath);
    if (attachmentsPath.indexOf(doc) === -1) {
        attachmentsPath = `${doc}/${attachmentsPath}`;
    }
    if (!zip.files[attachmentsPath]) return [];
    const data = await getJsonFromXmlContent(zip, attachmentsPath);
    const attachmentsObj = data['json']['ofd:Attachments'];
    if (!attachmentsObj) return [];
    let result = [];
    let attArray = [];
    attArray = attArray.concat(attachmentsObj['ofd:Attachment']);
    for (const att of attArray) {
        if (!att) continue;
        result.push({
            id: att['@_ID'],
            name: att['@_Name'],
            format: att['ofd:Format'],
            size: att['ofd:Size'],
            fileLoc: att['ofd:FileLoc'],
            creationDate: att['ofd:CreationDate'],
            modDate: att['ofd:ModDate']
        });
    }
    return result;
}

export const getDocumentRes = async function ([zip, doc, Document, stampAnnot, annotationObjs, docMeta]) {
    let documentResPath = Document['ofd:CommonData']['ofd:DocumentRes'];
    let fontResObj = {};
    let drawParamResObj = {};
    let multiMediaResObj = {};
    if (documentResPath) {
        if (documentResPath.indexOf(doc) == -1) {
            documentResPath = `${doc}/${documentResPath}`;
        }
        if (zip.files[documentResPath]) {
            const data = await getJsonFromXmlContent(zip, documentResPath);
            const documentResObj = data['json']['ofd:Res'];
            fontResObj = await getFont(documentResObj, zip, doc);
            drawParamResObj = await getDrawParam(documentResObj);
            multiMediaResObj = await getMultiMediaRes(zip, documentResObj, doc);
        }
    }
    return [zip, doc, Document, stampAnnot, annotationObjs, docMeta, fontResObj, drawParamResObj, multiMediaResObj];
}

export const getPublicRes = async function ([zip, doc, Document, stampAnnot, annotationObjs, docMeta, fontResObj, drawParamResObj, multiMediaResObj]) {
    let publicResPath = Document['ofd:CommonData']['ofd:PublicRes'];
    if (publicResPath) {
        if (publicResPath.indexOf(doc) == -1) {
            publicResPath = `${doc}/${publicResPath}`;
        }
        if (zip.files[publicResPath]) {
            const data = await getJsonFromXmlContent(zip, publicResPath);
            const publicResObj = data['json']['ofd:Res'];
            let fontObj = await getFont(publicResObj, zip, doc);
            fontResObj = Object.assign(fontResObj, fontObj);
            let drawParamObj = await getDrawParam(publicResObj);
            drawParamResObj = Object.assign(drawParamResObj, drawParamObj);
            let multiMediaObj = await getMultiMediaRes(zip, publicResObj, doc);
            multiMediaResObj = Object.assign(multiMediaResObj, multiMediaObj);
        }
    }
    return [zip, doc, Document, stampAnnot, annotationObjs, docMeta, fontResObj, drawParamResObj, multiMediaResObj];
}

export const getTemplatePage = async function ([zip, doc, Document, stampAnnot, annotationObjs, docMeta, fontResObj, drawParamResObj, multiMediaResObj]) {
    let templatePages = Document['ofd:CommonData']['ofd:TemplatePage'];
    let array = [];
    array = array.concat(templatePages);
    let tpls = {};
    for (const templatePage of array) {
        if (templatePage) {
            let pageObj = await parsePage(zip, templatePage, doc);
            tpls[Object.keys(pageObj)[0]] = pageObj[Object.keys(pageObj)[0]];
        }
    }
    return [zip, doc, Document, stampAnnot, annotationObjs, docMeta, tpls, fontResObj, drawParamResObj, multiMediaResObj];
}

export const getPage = async function ([zip, doc, Document, stampAnnot, annotationObjs, docMeta, tpls, fontResObj, drawParamResObj, multiMediaResObj]) {
    let pages = Document['ofd:Pages']['ofd:Page'];
    let array = [];
    array = array.concat(pages);
    let res = [];
    for (const page of array) {
        if (page) {
            let pageObj = await parsePage(zip, page, doc);
            const pageId = Object.keys(pageObj)[0];
            const currentPageStamp = stampAnnot[pageId];
            if (currentPageStamp) {
                pageObj[pageId].stamp = currentPageStamp;
            }
            const annotationObj = annotationObjs[pageId];
            if (annotationObj) {
                pageObj[pageId].annotation = annotationObj;
            }
            res.push(pageObj);
        }
    }
    return {
        'doc': doc,
        'document': Document,
        'pages': res,
        'tpls': tpls,
        'stampAnnot': stampAnnot,
        fontResObj,
        drawParamResObj,
        multiMediaResObj,
        zip,
        docMeta
    };
}

const getFont = async function (res, zip, doc) {
    const fonts = res['ofd:Fonts'];
    let fontResObj = {};
    if (fonts) {
        let fontArray = [];
        fontArray = fontArray.concat(fonts['ofd:Font']);
        const baseLoc = res['@_BaseLoc'] || '';
        for (const font of fontArray) {
            if (font) {
                const name = font['@_FamilyName'] || font['@_FontName'];
                const fontFile = font['ofd:FontFile'];
                let fontObj = null;
                let fontFaceFamily = null;

                if (fontFile && zip && opentype) {
                    try {
                        let filePath = fontFile;
                        if (baseLoc && filePath.indexOf(baseLoc) === -1) {
                            filePath = `${baseLoc}/${filePath}`;
                        }
                        if (doc && filePath.indexOf(doc) === -1) {
                            filePath = `${doc}/${filePath}`;
                        }
                        if (zip.files[filePath]) {
                            const buffer = await zip.files[filePath].async('arraybuffer');
                            fontObj = opentype.parse(buffer);
                            if (typeof document !== 'undefined') {
                                fontFaceFamily = `ofd-embedded-${font['@_ID']}`;
                                const blob = new Blob([buffer], {type: 'font/ttf'});
                                const url = URL.createObjectURL(blob);
                                const style = document.createElement('style');
                                style.textContent = `@font-face { font-family: "${fontFaceFamily}"; src: url("${url}") format("truetype"); }`;
                                document.head.appendChild(style);
                            }
                        }
                    } catch (e) {
                        console.warn(`Failed to parse embedded font ${name}:`, e.message);
                    }
                }

                fontResObj[font['@_ID']] = {
                    name: name,
                    fontObj: fontObj,
                    fontFaceFamily: fontFaceFamily
                };
            }
        }
    }
    return fontResObj;
}

const getDrawParam = async function (res) {
    const drawParams = res['ofd:DrawParams'];
    let drawParamResObj = {};
    if (drawParams) {
        let array = [];
        array = array.concat(drawParams['ofd:DrawParam']);
        for (const item of array) {
            if (item) {
                drawParamResObj[item['@_ID']] = {
                    'LineWidth': item['@_LineWidth'],
                    'FillColor': item['ofd:FillColor'] ? item['ofd:FillColor']['@_Value'] : '',
                    'StrokeColor': item['ofd:StrokeColor'] ? item['ofd:StrokeColor']['@_Value'] : "",
                    'relative': item['@_Relative'],
                    'Join': item['@_Join'],
                    'Cap': item['@_Cap'],
                    'DashOffset': item['@_DashOffset'],
                    'DashPattern': item['@_DashPattern'],
                    'MiterLimit': item['@_MiterLimit'],
                };
            }
        }
    }
    return drawParamResObj;
}

const getMultiMediaRes = async function (zip, res, doc) {
    const multiMedias = res['ofd:MultiMedias'];
    let multiMediaResObj = {};
    if (multiMedias) {
        let array = [];
        array = array.concat(multiMedias['ofd:MultiMedia']);
        for (const item of array) {
            if (item) {
                let file = item['ofd:MediaFile'];
                if (res['@_BaseLoc']) {
                    if (file.indexOf(res['@_BaseLoc']) === -1) {
                        file = `${res['@_BaseLoc']}/${file}`
                    }
                }
                if (file.indexOf(doc) === -1) {
                    file = `${doc}/${file}`
                }
                if (item['@_Type'].toLowerCase() === 'image') {
                    const format = item['@_Format'];
                    const ext = getExtensionByPath(file);
                    if ((format && (format.toLowerCase() === 'gbig2' || format.toLowerCase() === 'jb2')) || ext && (ext.toLowerCase() === 'jb2' || ext.toLowerCase() === 'gbig2')) {
                        const jbig2 = await parseJbig2ImageFromZip(zip, file);
                        multiMediaResObj[item['@_ID']] = jbig2;
                    } else {
                        const img = await parseOtherImageFromZip(zip, file);
                        multiMediaResObj[item['@_ID']] = {img, 'format': 'png'};
                    }
                } else {
                    multiMediaResObj[item['@_ID']] = file;
                }
            }
        }
    }
    return multiMediaResObj;
}

const parsePage = async function (zip, obj, doc) {
    let pagePath = obj['@_BaseLoc'];
    if (pagePath.indexOf(doc) == -1) {
        pagePath = `${doc}/${pagePath}`;
    }
    const data = await getJsonFromXmlContent(zip, pagePath);
    let pageObj = {};
    pageObj[obj['@_ID']] = {'json': data['json']['ofd:Page'], 'xml': data['xml']};
    return pageObj;
}

const getSignature = async function (zip, signatures, doc) {
    let stampAnnot = [];
    if (signatures) {
        signatures = replaceFirstSlash(signatures);
        if (signatures.indexOf(doc) === -1) {
            signatures = `${doc}/${signatures}`
        }
        if (zip.files[signatures]) {
            const signaturesBase = signatures.substring(0, signatures.lastIndexOf('/'));
            let data = await getJsonFromXmlContent(zip, signatures);
            let signature = data['json']['ofd:Signatures']['ofd:Signature'];
            let signatureArray = [];
            signatureArray = signatureArray.concat(signature);
            for (const sign of signatureArray) {
                if (sign) {
                    let signatureLoc = sign['@_BaseLoc'];
                    let signatureID = sign['@_ID'];
                    signatureLoc = replaceFirstSlash(signatureLoc);
                    if (signatureLoc.indexOf(doc) === -1) {
                        signatureLoc = `${signaturesBase}/${signatureLoc}`;
                    }
                    if (!zip.files[signatureLoc] && signatureLoc.indexOf(doc) === -1) {
                        signatureLoc = `${doc}/${signatureLoc}`;
                    }
                    stampAnnot.push(await getSignatureData(zip, signatureLoc, signatureID));
                }
            }
        }
    }
    return stampAnnot;
}

const getFileData = async function (zip, name){
    return zip.files[name].async('uint8array');
}

const getSignatureData = async function (zip, signature, signatureID) {
    const data = await getJsonFromXmlContent(zip, signature);
    let signedValue = (data['json']['ofd:Signature']['ofd:SignedValue'])
    signedValue = signedValue.toString().replace('/', '');
    if (!zip.files[signedValue]) {
        signedValue = `${signature.substring(0, signature.lastIndexOf('/'))}/${signedValue}`
    }
    let sealObj = await parseSesSignature(zip, signedValue);
    const checkMethod = data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:References']['@_CheckMethod'];
    global.toBeChecked = new Map();
    let arr = new Array();
    let references = [];
    references = references.concat(data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:References']['ofd:Reference']);
    for (const reference of references) {
        if (!reference || Object.keys(reference).length === 0 || Object.keys(reference['@_FileRef']).length === 0) {
            continue;
        }
        const hashed = reference['ofd:CheckValue'];
        const key = reference['@_FileRef'].replace('/', '');
        let fileData = await getFileData(zip, key);
        arr.push({fileData, hashed, checkMethod});
    }
    global.toBeChecked.set(signatureID, arr);
    return {
        'stampAnnot': data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:StampAnnot'],
        'sealObj': sealObj,
        'signedInfo':{
            'signatureID': signatureID,
            'VerifyRet':sealObj.verifyRet,
            'Provider':data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:Provider'],
            'SignatureMethod':data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:SignatureMethod'],
            'SignatureDateTime':data['json']['ofd:Signature']['ofd:SignedInfo']['ofd:SignatureDateTime'],
        },
    };
}

const getSealDocumentObj = function (stampAnnot) {
    return new Promise((resolve, reject) => {
        pipeline.call(this, async () => await unzipOfd(stampAnnot.sealObj.ofdArray), getDocRoots, parseSingleDoc)
            .then(res => {
                resolve(res)
            })
            .catch(res => {
                reject(res);
            });
    });
}

const getJsonFromXmlContent = async function (zip, xmlName) {
    return new Promise((resolve, reject) => {
        zip.files[xmlName].async('string').then(function (content) {
            let ops = {
                attributeNamePrefix: "@_",
                ignoreAttributes: false,
                parseNodeValue: false,
                trimValues: false
            };
            let jsonObj = parser.parse(content, ops);
            let result = {'xml': content, 'json': jsonObj};
            resolve(result);
        }, function error(e) {
            reject(e);
        })
    });
}

const parseJbig2ImageFromZip = async function (zip, name) {
    return new Promise((resolve, reject) => {
        zip.files[name].async('uint8array').then(function (bytes) {
            let jbig2 = new Jbig2Image();
            const img = jbig2.parse(bytes);
            resolve({img, width: jbig2.width, height: jbig2.height, format: 'gbig2'});
        }, function error(e) {
            reject(e);
        })
    });
}

const parseOtherImageFromZip = async function (zip, name) {
    return new Promise((resolve, reject) => {
        zip.files[name].async('base64').then(function (bytes) {
            const img = 'data:image/png;base64,' + bytes;
            resolve(img);
        }, function error(e) {
            reject(e);
        })
    });
}


