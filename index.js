// In God We Trust

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const safeRegex = require('safe-regex');
const memoryCache = require('obj-memory-cache');

const localCache = memoryCache.newCache();

const singleTagsList = ['meta', 'link', 'img', 'br', 'hr', 'input'];

const styleSheetRegex = /(<(?:link)(?:.*?)(?:rel="stylesheet")(?:[^>]+)?>)/gs;

let mainOptions = {};
let viewsPath = '';
let viewsType = '';

const lazyLoadKey = crypto.randomBytes(16).toString('hex');

const tagFunctions = {
    'if': {hasContent: true, func: function(attrs, content, options){
            if(!isDefined(content)){return;}
            attrs = [attrs.join(' ')];
            content = content.split(/({{{?else(?:\s*?[^}]*|)}}}?)/g).map(attr => {
                if(attr.match(/({{{?else(?:\s*?[^}]*|)}}}?)/g)){
                    attr = attr.replace(/{{{?else(\s*?[^}]*|)}}}?/g, '$1');
                    if(!attr || attr.trim() === ''){attr = true;}
                    attrs.push(attr);
                    return undefined;
                }return attr;
            }).filter(str => str !== undefined);
            if(!attrs.includes(true)){attrs.push(true);}
            for(let i = 0; i < attrs.length; i++){
                if(attrs[i] === true || checkTrue(attrs[i])){
                    return content[i] || false;
                }
            }
            function checkTrue(attrs){
                attrs = attrs.split(/[&|]/g);
                let isTrue = false;
                for(let i = 0; i < attrs.length; i++){
                    attrs[i] = attrs[i].trim();
                    if(attrs[i] !== ''){
                        if(isTrue && attrs[i] === '|'){
                            break;
                        }else if(!isTrue && attrs[i] === '&'){
                            break;
                        }else if(attrs[i] !== '&' && attrs[i] !== '|'){
                            isTrue = runIfStatement(attrs[i], options);
                        }
                    }
                }
                return isTrue;
            }
        }},
    'each': {hasContent: true, attrs: ['as', 'of', 'from'], func: function(attrs, content, options){
            if((mainOptions && (mainOptions.noEach || mainOptions.noForEach)) || options.noEach || options.noForEach){return;}
            let objAttr = attrs[0]; delete attrs[0];
            if(objAttr.includes('&')){objAttr = objAttr.split('&');}
            else{objAttr = [objAttr];}
            let result = '';
            for(let a = 0; a < objAttr.length; a++){
                let val = getObj(options, objAttr[a]);
                if(val){
                    forEach(val, (val, i) => {
                        if(!attrs.as && !attrs.of){result += content;}
                        result += content.replace(/({{{?)([\w_\-.:\[\]|]*?=|)(?:"?\s*?((?:\w|\$)(?:[^"}]*))"?)(}}}?)/g, (str, open, attr, tag, close) => {
                            tag = tag.replace(/[.:\[\]]/g, '.').replace(/\.\./g, '.');
                            if(tag.endsWith('.')){tag = tag.substring(0, tag.lastIndexOf('.'));}
                            let tagStart = tag;
                            if(tagStart.includes('.')){tagStart = tagStart.substring(0, tag.indexOf('.'));}
                            if(!Object.values(attrs).includes(tagStart)){return str;}
                            if(tag.includes('.')){tag = tag.replace(tagStart+'.', '');}else{tag = '';}
                            let cleanHtml = !(open === '{{{' && close === '}}}');
                            function result(str){
                                let resultItem = '';
                                if(str || str === 0){str = str.toString(); if(str && str.trim() !== ''){if(!cleanHtml){resultItem = str;}else{resultItem = escapeHtml(str);}}}
                                if(attr && attr.trim() !== ''){
                                    if(attr.trim() !== '='){return attr+'"'+resultItem+'"';}
                                    return tagStart+'="'+resultItem+'"';
                                }return resultItem;
                            }
                            if(tagStart === attrs.as){
                                return result(getObj(val, tag) || val);
                            }else if(tagStart === attrs.of){
                                return result(i);
                            }else if(tagStart === attrs.from){
                                return result(objAttr[a]);
                            }return str;
                        }).replace(/({{{?)(?:#(\w(?:[\w_\-:]+))\s+?(.*?))(}}}?)/g, (str, open, tag, attr, close) => {
                            attr = attr.split(/([ &|=<>])/g).map(attr => {
                                let attrStart = attr;
                                if(attrStart.includes('.')){attrStart = attrStart.substring(0, tag.indexOf('.'));}

                                if(attrStart  === attrs.from){return '\''+objAttr[a]+'\'';}

                                if(attrStart !== attrs.as){return attr;}
                                if(attr.includes('.')){attr = '.'+attr.replace(attrStart+'.', '');}else{attr = '';}
                                return objAttr[a]+'.'+i+attr;
                            }).join('');
                            return '{{#'+tag+' '+attr+'}}';
                        });
                    });
                }
            }
            return result;
        }},
    'import': {hasContent: false, func: function(attrs, content, options, init = false){
            if((mainOptions && mainOptions.noImports) || options.noImports){return;}
            if(attrs && attrs[0]){
                let fileType = viewsType || mainOptions.type || mainOptions.extension || 'html';
                if(fileType.startsWith('.')){fileType = fileType.replace('.', '');}
                let filePath = path.join(viewsPath || mainOptions.dir || mainOptions.path || __dirname, attrs[0]+'.'+fileType);
                if(!filePath.startsWith(path.join(viewsPath || mainOptions.dir || mainOptions.path || __dirname))){return null;}
                let result = getFileCache(filePath);
                if(!result){
                    if(fs.existsSync(filePath)){try{result = fs.readFileSync(filePath);}catch(e){result = undefined;}}
                    setFileCache(filePath, result, options);
                }
                if(result && !init){return runAllTags(autoCloseTags(result), options);}
                if(result){return autoCloseTags(result);}
            }
        }}
};

function addFunction(name, func, hasContent = false){
    if(!name || !func || typeof name !== 'string' || name.trim() === '' || typeof func !== 'function' || typeof hasContent !== 'boolean'){return null;}
    name = name.toString().trim();
    if(['if', 'unless', 'each', 'import'].includes(name)){return null;}
    tagFunctions[name] = {hasContent, func};
    return true;
}

function defineSingleTagType(name){
    if(!name || typeof name !== 'string' || name.trim() === ''){return null;}
    if(!singleTagsList.includes(name)){singleTagsList.push(name);}
    return true;
}

function getFileCache(filePath){
    return localCache.get('template_file_cache:'+filePath);
}

function setFileCache(filePath, data, options){
    if(data){data = data.toString();}
    localCache.set('template_file_cache:'+filePath, data, {expire: options.cache || mainOptions.cache});
}

function engine(filePath, options, callback){
    viewsType = filePath.substr(filePath.lastIndexOf('.'));
    viewsPath = path.join(filePath, '..');
    let fileData = getFileCache(filePath);
    if(fileData){
        if(mainOptions && typeof mainOptions.onBeforeRender === 'function'){
            let beforeRendered = mainOptions.onBeforeRender(Buffer.from(fileData, 'utf8'));
            if(beforeRendered && typeof beforeRendered === 'string'){fileData = beforeRendered;}
        }else if(options && typeof options.onBeforeRender === 'function'){
            let beforeRendered = options.onBeforeRender(Buffer.from(fileData, 'utf8'));
            if(beforeRendered && typeof beforeRendered === 'string'){fileData = beforeRendered;}
        }
        let rendered = render(fileData, options);
        if(mainOptions && typeof mainOptions.onAfterRender === 'function'){
            let afterRendered = mainOptions.onAfterRender(Buffer.from(rendered, 'utf8'));
            if(afterRendered && typeof afterRendered === 'string'){rendered = afterRendered;}
        }else if(options && typeof options.onAfterRender === 'function'){
            let afterRendered = options.onAfterRender(Buffer.from(rendered, 'utf8'));
            if(afterRendered && typeof afterRendered === 'string'){rendered = afterRendered;}
        }
        return callback(null, rendered.toString());
    }else{
        fs.readFile(filePath, function(err, content){
            if(err){return callback(err);}
            setFileCache(filePath, content, options);
            if(mainOptions && typeof mainOptions.onBeforeRender === 'function'){
                let beforeRendered = mainOptions.onBeforeRender(content);
                if(beforeRendered && typeof beforeRendered === 'string'){content = beforeRendered;}
            }else if(options && typeof options.onBeforeRender === 'function'){
                let beforeRendered = options.onBeforeRender(content);
                if(beforeRendered && typeof beforeRendered === 'string'){content = beforeRendered;}
            }
            let rendered = render(content, options);
            if(mainOptions && typeof mainOptions.onAfterRender === 'function'){
                let afterRendered = mainOptions.onAfterRender(Buffer.from(rendered, 'utf8'));
                if(afterRendered && typeof afterRendered === 'string'){rendered = afterRendered;}
            }else if(options && typeof options.onAfterRender === 'function'){
                let afterRendered = options.onAfterRender(Buffer.from(rendered, 'utf8'));
                if(afterRendered && typeof afterRendered === 'string'){rendered = afterRendered;}
            }
            return callback(null, rendered.toString());
        });
    }
}

function filterExists(str){return (str || str === 0) && str.toString().trim() !== '';}
function isDefined(val){
    if((typeof val === 'string' && val.trim() === '') || (typeof val === 'object' && Object.keys(val).length <= 0) || (Array.isArray(val) && val.length <= 0)){return false;}
    return !!(val || val === 0 || val === false);
}

function render(str, options){
    str = str.toString();

    if(mainOptions && mainOptions.raw){return str;}

    if(!str.startsWith('\n')){str = '\n\r'+str;}
    if(!str.endsWith('\n')){str += '\n\r';}
    str = autoCloseTags(str);

    if(options){
        let opts = {};
        forEach(options, (opt, i) => {
            if(typeof opt === 'function'){return;}
            if(['string', 'number', 'boolean', 'object'].includes(typeof opt) || Array.isArray(opt)){opts[i] = opt;}
        }); options = opts;
    }else{options = {};}
    if(!options['$']){options['$'] = {};}

    if(options.lazyLoad && typeof options.lazyLoad !== 'object'){options.lazyLoad = {method: 'post', tag: 'body', data: false};}
    if(options.lazyLoad){
        options.lazyLoad.data = options.lazyLoad.data || false;
        if(options.lazyLoad.data && typeof options.lazyLoad.data === 'string'){try{options.lazyLoad.data = JSON.parse(options.lazyLoad.data);}catch(e){options.lazyLoad.data = false;}}
        if(options.lazyLoad.data && typeof options.lazyLoad.data === 'object'){
            options.nonce = options.nonce || options.lazyLoad.data.nonce;
            options.lazyLoad.method = options.lazyLoad.method || options.lazyLoad.data.method || 'post';
            options.lazyLoad.tag = options.lazyLoad.tag || options.lazyLoad.data.tag || 'body';
            options.lazyLoad.scrollElm = options.lazyLoad.scrollElm || options.lazyLoad.data.scrollElm || false;
            options.lazyLoad.afterVars = options.lazyLoad.afterVars || options.lazyLoad.data.afterVars || false;
        }else{
            options.lazyLoad.method = options.lazyLoad.method || 'post';
            options.lazyLoad.tag = options.lazyLoad.tag || 'body';
        }
    }

    if(mainOptions && (mainOptions.template || mainOptions.layout)){
        let template =  mainOptions.template || mainOptions.layout;
        let layout = getFileCache(template);
        if(!layout){
            let fileType = viewsType || mainOptions.type || mainOptions.extension || 'html';
            if(fileType.startsWith('.')){fileType = fileType.replace('.', '');}
            let filePath = path.join(viewsPath || mainOptions.dir || mainOptions.path || __dirname, template+'.'+fileType);
            if(filePath.startsWith(path.join(viewsPath || mainOptions.dir || mainOptions.path || __dirname))){
                try{layout = fs.readFileSync(filePath).toString();}catch(e){layout = undefined;}
                if(layout && layout.trim() === ''){layout = undefined;}
                if(layout){
                    if(!layout.startsWith('\n')){layout = '\n\r'+layout;}
                    if(!layout.endsWith('\n')){layout += '\n\r';}
                    layout = autoCloseTags(layout);
                }
                setFileCache(template, layout, options);
            }else{setFileCache(template, null, options);}
        }
        str = str.replace(/{{{?body}}}?/g, '').replace(/<\/?(!DOCTYPE|html|head|body)((\s+?[^>]*?)|)>/gsi, '');
        if(options.lazyLoad && options.lazyLoad.tag){str = str.replace(new RegExp('<\\/?('+options.lazyLoad.tag.toString().replace(/[^\w_-]/g, '')+')((\\s+?[^>]*?)|)>', 'gsi'), '');}
        if(layout){str = layout.replace(/{{{body}}}/g, str).replace(/{{body}}/g, escapeHtml(str));}
    }

    function runNoHtmlTags(str, keepTags){
        str = str.replace(/{{{?#(no[_-]?html).*?}}}?(.*?){{{?\/(\1).*?}}}?/gsi, (str, tag, content) => {
            if(!content || content.trim() === ''){return '';}
            let result = escapeHtml(content);
            if(keepTags){result = '{{#no-html}}'+result+'{{/no-html}}';}
            return result;
        });
        return str;
    }
    str = runNoHtmlTags(str, true);

    if((!mainOptions || !mainOptions.noImports) && !options.noImports){
        str = str.replace(/({{{)#import (.*?)(}}})/gsi, (str, open, attr, close) => {
            if(!attr || attr.trim() === ''){return '';}
            attr = attr.trim();
            if(tagFunctions['import']){return runNoHtmlTags(tagFunctions['import'].func([attr], false, options, true).toString());}
            return '';
        });
    }

    if(options.lazyLoad && options.lazyLoad.earlyVars){
        forEach(options.lazyLoad.earlyVars, earlyVar => {
            if(!earlyVar || typeof earlyVar !== 'string' || earlyVar.trim() === ''){return;}
            earlyVar = earlyVar.toString();
            let regex = new RegExp('{{{\\s*?"?('+earlyVar+')"?\\s*?}}}', 'gs');
            if(safeRegex(regex)){
                str = str.replace(regex, (str, tag) => {
                    if(!tag || tag.trim() === ''){return str;}
                    let result = getObj(options, tag);
                    if(result && result.toString().trim() !== ''){return result;}
                    return str;
                });
            }
        });
    }

    str = removeComments(str);

    if(options.lazyLoad && !options.lazyLoad.afterVars && options.lazyLoad.tag){
        let splitRegex = new RegExp('(<'+options.lazyLoad.tag.toString()+'(?:(?:\\s+?[^>]*?)|)>)(.*?)(<\\/'+options.lazyLoad.tag.toString()+'>)', 'gsi');
        if(safeRegex(splitRegex)){
            str = str.split(splitRegex);
            if(str.length > 1 && options.lazyLoad.data && typeof options.lazyLoad.data === 'object' && options.lazyLoad.data.key === lazyLoadKey && options.lazyLoad.data.page > 1){
                let pageNum = Number(options.lazyLoad.data.page);
                str[2] = str[2].split(/{{#lazy[_-]?load}}/gi, pageNum);
                if(str[2].length !== options.lazyLoad.data.page){return '';}
                str[2] = str[2][pageNum-1];
                if(!str[2][pageNum] || str[2][pageNum].trim() === ''){str[2] += '<no-more-lazyload-content></no-more-lazyload-content>';}
                if(options.lazyLoad.data.contentOnly){str = [str[2]];}
            }else if(str.length > 1){
                let strParts = str[2].split(/{{#lazy[_-]?load}}/gi, 2);
                str[2] = strParts[0];
                if(!strParts[1] || strParts[1].trim() === ''){str[2] += '<no-more-lazyload-content></no-more-lazyload-content>';}
            }else if(!/{{#lazy[_-]?load}}/i.test(str[2])){str[2] += '<no-more-lazyload-content></no-more-lazyload-content>';}
            str = str.join('');
            if(str.includes('</body>')){str = str.replace(/(<\/body>)/gi, lazyLoadScript(options.lazyLoad, options.nonce)+'$1');}
            else{str += lazyLoadScript(options.lazyLoad, options.nonce);}
        }
    }

    str = runAllTags(str, options);

    str = runNoHtmlTags(str);

    if(options.lazyLoad && options.lazyLoad.afterVars && options.lazyLoad.tag){
        let splitRegex = new RegExp('(<'+options.lazyLoad.tag.toString()+'(?:(?:\\s+?[^>]*?)|)>)(.*?)(<\\/'+options.lazyLoad.tag.toString()+'>)', 'gsi');
        if(safeRegex(splitRegex)){
            str = str.split(splitRegex);
            if(str.length > 1 && options.lazyLoad.data && typeof options.lazyLoad.data === 'object' && options.lazyLoad.data.key === lazyLoadKey && options.lazyLoad.data.page > 1){
                let pageNum = Number(options.lazyLoad.data.page);
                str[2] = str[2].split(/{{#lazy[_-]?load}}/gi, pageNum);
                if(str[2].length !== options.lazyLoad.data.page){return '';}
                str[2] = str[2][pageNum-1];
                if(!str[2][pageNum] || str[2][pageNum].trim() === ''){str[2] += '<no-more-lazyload-content></no-more-lazyload-content>';}
                if(options.lazyLoad.data.contentOnly){str = [str[2]];}
            }else if(str.length > 1){
                let strParts = str[2].split(/{{#lazy[_-]?load}}/gi, 2);
                str[2] = strParts[0];
                if(!strParts[1] || strParts[1].trim() === ''){str[2] += '<no-more-lazyload-content></no-more-lazyload-content>';}
            }else if(!/{{#lazy[_-]?load}}/i.test(str[2])){str[2] += '<no-more-lazyload-content></no-more-lazyload-content>';}
            str = str.join('');
            if(str.includes('</body>')){str = str.replace(/(<\/body>)/gi, lazyLoadScript(options.lazyLoad, options.nonce)+'$1');}
            else{str += lazyLoadScript(options.lazyLoad, options.nonce);}
        }
    }

    if((!mainOptions || !mainOptions.noMarkdown) && !options.noMarkdown){
        let mdRegex = /({{{?#no[_-]?markdown}}}?(?:.*?){{{?\/no[_-]?markdown}}}?|<script(?:(?:\s+?[^>]*?)|)>(?:.*?)<\/script>|<style(?:(?:\s+?[^>]*?)|)>(?:.*?)<\/style>)/gsi;
        let mdMarkdownRegex = /{{{?#no[_-]?markdown}}}?(.*?){{{?\/no[_-]?markdown}}}?/gsi;
        str = str.split(mdRegex).map(md => {
            if(md.match(mdMarkdownRegex)){return md.replace(mdMarkdownRegex, '$1');}
            else if(md.match(mdRegex)){return md;}
            return basicMarkdown(md);
        }).join('');
    }

    if(options.autoAdInsert){str = str.replace(/(<\/body>)/gi, autoAdInsertScript(options.autoAdInsert, options.nonce)+'$1');}

    if(mainOptions && mainOptions.extract){str = extractTags(str, mainOptions.extract, false);}

    if((!mainOptions || !mainOptions.keepInvalidVars) && !options.keepInvalidVars){str = str.replace(/({{{?(?:(?:[^}]+)|)}}}?)/g, '');}

    str = autoCloseTags(str);

    return str.toString().trim();
}


function removeComments(str){
    return str.replace(/<!--\s+?(?!@|!)(.*?)-->/gs, str => {
        if(str.includes('license') || str.includes('licence') || str.includes('(c)') || str.includes('copyright')){
            return str;
        }return '';
    });
}


function runAllTags(str, options){
    //str = indexContainerTagFunctions(str);
    str = runContainerTagFunctions(str, options);
    str = runBasicTagFunctions(str, options);
    str = runVarTags(str, options);
    return str;
}

function indexContainerTagFunctions(str){
    let tagLevels = {};
    return str.toString().replace(/({{{?)([#/])([\w_\-]+)(?::[0-9]|)([^}]*)(}}}?)/g, (str, open, type, tag, attrs, close) => {
        if(!tagLevels[tag]){tagLevels[tag] = 0;}
        if(type === '#'){tagLevels[tag]++;}
        let result = open+type+tag+':'+tagLevels[tag]+attrs+close;
        if(type === '/'){tagLevels[tag]--;}
        if(tagLevels[tag] < 0){return '';}
        return result;
    });
}

function runContainerTagFunctions(str, options){
    let opts = {...options};
    let tagData = {level: 0};
    let replaceContentList = [];
    str = str.toString().replace(/({{{?)([#/$])([\w_\-]+)(:[0-9]|)([^}]*)(}}}?)/g, (thisStr, open, type, tag, tagIndex, attrs, close, regexIndex) => {
        if(tag.trim().match(/(no[_-]?markdown|no[_-]?html|lazy[_-]?load)/gi)){return thisStr;}
        attrs = attrs.trim();
        if(type === '$' && attrs.startsWith('=')){
            opts['$'][tag] = getObj(opts, attrs) || undefined;
        }else if(type === '#' && tagData.level <= 0){
            if(tagFunctions[tag] && tagFunctions[tag].hasContent){
                tagData.level = 1;
                tagData.func = tag;
                tagData.index = tagIndex;
                tagData.attrs = attrs;
                tagData.cleanHtml = !(open === '{{{' && close === '}}}');
                tagData.attrTypes = tagFunctions[tag].attrs || false;
                tagData.regexIndex = regexIndex;
                tagData.strLength = thisStr.length;
                tagData.thisStr = thisStr;
                //return '';
            }
        }else if(type === '/' && tag === tagData.func && tagIndex === tagData.index && tagData.level <= 1){
            if(typeof tagFunctions[tag].func === 'function'){
                let attrs = tagData.attrs.split(' ').map(attr => attr.trim()).filter(filterExists);
                if(tagData.attrTypes){
                    let newAttrs = {};
                    forEach(tagData.attrTypes, attrType => {
                        let index = attrs.indexOf(attrType);
                        if(!index){index = attrs.indexOf(attrType+':');}
                        if(index !== -1 && attrs[index+1]){
                            newAttrs[attrType] = attrs[index+1];
                            attrs[index] = undefined; attrs[index+1] = undefined;
                        }
                    });
                    let nextIndex = 0;
                    forEach(attrs, attr => {
                        if(!attr){return;}
                        let i = nextIndex++;
                        while(newAttrs[i] && nextIndex < 1000){i = nextIndex++; if(nextIndex > 1000){break;}}
                        if(attr && !newAttrs[i]){newAttrs[i] = attr;}
                    });
                    attrs = newAttrs;
                }
                let tagContent = str.substring(tagData.regexIndex+tagData.strLength, regexIndex);
                let result = tagFunctions[tag].func(attrs, tagContent, opts, tagData.cleanHtml && !(open === '{{{' && close === '}}}'));
                let replaceStr = tagData.thisStr+tagContent+thisStr;
                tagData = {level: 0};
                if(isDefined(result)){
                    if(typeof result === 'object'){
                        if(result.options){result.opts = result.options;}
                        if(result.opts){Object.assign(opts, result.opts);}
                        replaceContentList.push([replaceStr, runContainerTagFunctions(result.content || result.result || tagContent || '', opts) || '']);
                        //return runContainerTagFunctions(result.content || result.result || tagContent || '', opts) || '';
                    }
                    replaceContentList.push([replaceStr, runContainerTagFunctions(result || '', opts) || '']);
                    //return runContainerTagFunctions(result || '', opts) || '';
                }//return '';
            }
        }else if(tagData.level > 0){
            if(type === '#' && tag === tagData.func){tagData.level++;}
            else if(type === '/' && tag === tagData.func){tagData.level--;}
        }return thisStr;
    });

    //todo: improve temp fix (for performance)
    for(let i = 0; i < replaceContentList.length; i++){str = str.replace(replaceContentList[i][0], replaceContentList[i][1]);}

    return str;
}

function runBasicTagFunctions(str, options){
    let opts = {...options};
    return str.toString().replace(/({{{?)([#$])([\w_\-]+)(:[0-9]|)([^}]*)(}}}?)/g, (str, open, type, tag, tagIndex, attrs, close) => {
        if(tag.trim().match(/(no[_-]?markdown|no[_-]?html|lazy[_-]?load)/gi)){return str;}
        attrs = attrs.trim();
        if(type === '$' && attrs.startsWith('=')){
            opts['$'][tag] = getObj(opts, attrs) || undefined;
        }else if(type === '#' && tagFunctions[tag] && !tagFunctions[tag].hasContent && typeof tagFunctions[tag].func === 'function'){
            attrs = attrs.split(' ').map(attr => attr.trim()).filter(filterExists);
            if(tagFunctions[tag].attrs){
                let newAttrs = {};
                forEach(tagFunctions[tag].attrs, attrType => {
                    let index = attrs.indexOf(attrType);
                    if(!index){index = attrs.indexOf(attrType+':');}
                    if(index && attrs[index+1]){
                        newAttrs[attrType] = attrs[index+1];
                        delete attrs[index]; delete attrs[index+1];
                    }
                });
                let nextIndex = 0;
                forEach(attrs, attr => {
                    let i = nextIndex++;
                    while(newAttrs[i] && nextIndex < 1000){i = nextIndex++; if(nextIndex > 1000){break;}}
                    if(attr && !newAttrs[i]){newAttrs[i] = attr;}
                });
                attrs = newAttrs;
            }
            let result = tagFunctions[tag].func(attrs, null, opts, !(open === '{{{' && close === '}}}'));
            if(isDefined(result)){
                if(typeof result === 'object'){
                    if(result.options){result.opts = result.options;}
                    if(result.opts){Object.assign(opts, result.opts);}
                    return result.content || result.result || '';
                }return result;
            }return '';
        }return str;
    });
}

function runVarTags(str, options){
    let opts = {...options};
    return str.toString().replace(/({{{?)((?:[\w_\-:$]+)\s*?=\s*?|\s*?=\s*?|)([^}]+)(}}}?)/g, (str, open, type, tag, close) => {
        if(tag && tag.trim() !== ''){
            let result = '';
            tag = tag.trim(); let isQuote = false;
            if(tag.startsWith('-') || tag.startsWith('#') || tag.startsWith('/')){return str;}
            if(tag.startsWith('"') && tag.endsWith('"')){tag = tag.substring(tag.indexOf('"')+1, tag.lastIndexOf('"')); isQuote = true;}
            if(type){type = type.trim().replace(/\s/g, '');}
            let obj = getObj(opts, tag);
            if(type.startsWith('$') && type.includes('=')){
                if(isQuote){obj = '"'+obj.toString()+'"';}
                opts['$'][type.replace(/[$=]/g, '')] = obj;
                return '';
            }
            if(type === '='){result = tag.split('|', 1)[0]+'='; isQuote = true;}
            else if(type.includes('=')){result = type; isQuote = true;}
            if(isDefined(obj)){
                if(isQuote){result += '"';}
                if(!(open === '{{{' && close === '}}}')){result += escapeHtml(obj);}
                else{result += autoCloseTags(removeComments(obj));}
                if(isQuote){result += '"';}
                return result;
            }return '';
        }return str;
    });
}

function runIfStatement(val, options){

    function getVars(separator){
        let t = val.split(separator);
        if(t[0]){
            t[0] = getObj(options, t[0].toString().trim());
            if(t[0] && t[0].toString().match(/[0-9.]/) && !isNaN(Number(t[0].toString().replace(/'/g, '')))){t[0] = Number(t[0].toString().replace(/'/g, ''));}
        }
        if(t[1]){
            t[1] = getObj(options, t[1].toString().trim());
            if(t[1] && t[1].toString().match(/[0-9.]/) && !isNaN(Number(t[1].toString().replace(/'/g, '')))){t[1] = Number(t[1].toString().replace(/'/g, ''));}
        }return [t[0], t[1]];
    }

    if(val.includes('<=')){
        let t = getVars('<=');
        return t[0] <= t[1];
    }else if(val.includes('>=')){
        let t = getVars('>=');
        return t[0] >= t[1];
    }else if(val.includes('<')){
        let t = getVars('<');
        return t[0] < t[1];
    }else if(val.includes('>')){
        let t = getVars('>');
        return t[0] > t[1];
    }else if(val.includes('!=')){
        let t = getVars('!=');
        return t[0] !== t[1];
    }else if(val.includes('=')){
        let t = getVars('=');
        return t[0] === t[1];
    }else{
        if(val.startsWith('!')){
            return !getObj(options, val.replace('!', ''));
        }else{return !!getObj(options, val);}
    }
}

function lazyLoadScript(lazyLoad, nonceKey){
    lazyLoad.origMethod = lazyLoad.method; lazyLoad.origTag = lazyLoad.tag; lazyLoad.origScrollElm = lazyLoad.scrollElement || lazyLoad.scrollElm;
    lazyLoad.method = lazyLoad.method.toString().replace(/[^\w]/g, '').toUpperCase();
    if(lazyLoad.method !== 'POST' && lazyLoad.method !== 'GET'){lazyLoad.method === 'POST';}
    lazyLoad.tag = lazyLoad.tag.toString().replace(/[^\w_-]/g, '').toLowerCase();
    if(lazyLoad.tag === 'body' || lazyLoad.tag === 'window' || lazyLoad.tag === 'document'){
        lazyLoad.tag = 'window';
    }else{lazyLoad.tag = "'"+lazyLoad.tag+"'";}
    if(lazyLoad.scrollElement){lazyLoad.scrollElm = lazyLoad.scrollElement;}
    if(lazyLoad.scrollElm){
        lazyLoad.scrollElm = lazyLoad.scrollElm.toString().replace(/[^\w_\-.#]/g, '').toLowerCase();
        if(lazyLoad.scrollElm === 'body' || lazyLoad.scrollElm === 'window' || lazyLoad.scrollElm === 'document'){
            lazyLoad.scrollElm = 'window';
        }else{lazyLoad.scrollElm = "'"+lazyLoad.scrollElm+"'";}
    }
    let nonce = lazyLoad.nonce || nonceKey || false;
    if(nonce && typeof nonce === 'string' && nonce.trim() !== ''){
        nonce = ' nonce="'+nonce+'"';
    }else{nonce = '';}
    let script = `
    <script id="lazy-load-page-script"${nonce} async defer>
    ;(function(){
        let nextPage = 2;
        let hasMorePages = true;
        let gettingPage = false;
        let origUrl = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
        if(${!lazyLoad.unsafeUrl || true}){origUrl = origUrl.replace(/[^\\w_\\-+/]/g, '-');}
        
        (function(){
            if(typeof window.CustomEvent === "function"){return false;}
            function CustomEvent(event, params){
                params = params || {bubbles: false, cancelable: false, detail: null};
                let evt = document.createEvent('CustomEvent');
                evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
                return evt;
            }
            window.CustomEvent = CustomEvent;
        })();
        
        const onPageLazyLoad = new CustomEvent('onPageLazyLoad', {
            detail: {
                getPage: function(){return nextPage-1;}
            }
        });
        
        document.dispatchEvent(onPageLazyLoad);
        
        function loadPageAjax(jQuery){
            jQuery(document).ready(function(){
                function getNextPage(elm, scrollElm){
                    let totalScrollHeight = (scrollElm.prop('scrollHeight') || document.body.scrollHeight) - scrollElm.innerHeight();
                    let currentScrollHeight = scrollElm.scrollTop();
                    if(!gettingPage && totalScrollHeight - currentScrollHeight < 200){
                        gettingPage = true;
                        let url = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                        if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\\w_\\-+/]/g, '-');}
                        if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
                        let noMoreLazyLoadContent = document.getElementsByTagName('no-more-lazyload-content');
                        if(noMoreLazyLoadContent.length > 0){
                            for(let i = 0; i < noMoreLazyLoadContent.length; i++){noMoreLazyLoadContent[i].remove();}
                            hasMorePages = false;
                            return;
                        }
                        let loadingElm = document.createElement('p');
                        loadingElm.classList.add('lazyload-loading');
                        loadingElm.innerText = 'Loading...';
                        if(elm === jQuery(window)){
                            jQuery('body').append(loadingElm);
                        }else{elm.append(loadingElm);}
                        let thisNonceKey = document.getElementById('lazy-load-page-script').getAttribute('nonce') || false;
                        if(!thisNonceKey || thisNonceKey.toString().trim() === ''){thisNonceKey = false;}
                        jQuery.ajax({
                            url: url,
                            method: '${lazyLoad.method}',
                            dataType: 'html',
                            data: {lazyLoadData: '{"page": '+(nextPage++)+', "contentOnly": true, "key": "${lazyLoadKey}", "nonce": "'+thisNonceKey+'", "tag": "${lazyLoad.origTag}", "scrollElm": "${lazyLoad.origScrollElm}", "method": "${lazyLoad.origMethod}", "afterVars": "${lazyLoad.afterVars}"}'},
                            timeout: 15000,
                            success: function(data){
                                loadingElm.remove();
                                if(!data || data.toString().trim() === ''){
                                    hasMorePages = false;
                                }else{
                                    data = data.toString();
                                    if(data.includes('<no-more-lazyload-content></no-more-lazyload-content>')){
                                        hasMorePages = false;
                                        data = data.replace(/<no-more-lazyload-content><\\/no-more-lazyload-content>/g, '');
                                    }
                                    if(elm === window){
                                        jQuery('body').append(data);
                                    }else{elm.append(data.toString());}
                                    document.dispatchEvent(onPageLazyLoad);
                                }
                                gettingPage = false;
                                if(hasMorePages && !gettingPage){getNextPage(elm, scrollElm);}
                            },
                            error: function(xhr){
                                console.log(xhr.status);
                                loadingElm.classList.add('lazyload-loading-error');
                                loadingElm.innerHTML = 'Failed To Load!';
                                hasMorePages = false;
                                gettingPage = false;
                            }
                        });
                    }
                }
                getNextPage(jQuery(${lazyLoad.tag}), jQuery(${lazyLoad.scrollElm || lazyLoad.tag}));
                jQuery(${lazyLoad.scrollElm || lazyLoad.tag}).on('scroll', function(){
                    if(hasMorePages && !gettingPage){
                        getNextPage(jQuery(${lazyLoad.tag}), jQuery(${lazyLoad.scrollElm || lazyLoad.tag}));
                    }else if(!gettingPage){
                        let url = window.location.pathname.toLowerCase().replace(/([^\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                        if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\w_\\-+/]/g, '-');}
                        if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
                    }
                });
            });
        }
        
        function loadPageXml(){
            document.addEventListener('DOMContentLoaded', function(){
                const body = document.body || document.getElementsByTagName('body')[0];
                function getNextPage(elm, scrollElm){
                    let totalScrollHeight = (scrollElm.scrollHeight || body.scrollHeight) - (scrollElm.innerHeight || scrollElm.clientHeight);
                    let currentScrollHeight = scrollElm.scrollTop || window.scrollY;
                    if(!gettingPage && totalScrollHeight - currentScrollHeight < 200){
                        gettingPage = true;
                        let url = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                        if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\\w_\\-+/]/g, '-');}
                        if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
                        let noMoreLazyLoadContent = document.getElementsByTagName('no-more-lazyload-content');
                        if(noMoreLazyLoadContent.length > 0){
                            for(let i = 0; i < noMoreLazyLoadContent.length; i++){noMoreLazyLoadContent[i].remove();}
                            hasMorePages = false;
                            return;
                        }
                        let loadingElm = document.createElement('p');
                        loadingElm.classList.add('lazyload-loading');
                        loadingElm.innerText = 'Loading...';
                        if(elm === window){
                            body.appendChild(loadingElm);
                        }else{elm.appendChild(loadingElm);}
                        let thisNonceKey = document.getElementById('lazy-load-page-script').getAttribute('nonce') || false;
                        if(!thisNonceKey || thisNonceKey.toString().trim() === ''){thisNonceKey = false;}
                        const xhr = new XMLHttpRequest();
                        xhr.onreadystatechange = function(){
                            if(xhr.readyState == XMLHttpRequest.DONE){
                                if(xhr.status == 200){
                                    let data = xhr.responseText;
                                    loadingElm.remove();
                                    if(!data || data.toString().trim() === ''){
                                        hasMorePages = false;
                                    }else{
                                        data = data.toString();
                                        if(data.includes('<no-more-lazyload-content></no-more-lazyload-content>')){
                                            hasMorePages = false;
                                            data = data.replace(/<no-more-lazyload-content><\\/no-more-lazyload-content>/g, '');
                                        }
                                        let newElm = document.createElement('div');
                                        newElm.innerHTML = data;
                                        if(elm === window){
                                            body.appendChild(newElm);
                                        }else{elm.appendChild(newElm);}
                                        document.dispatchEvent(onPageLazyLoad);
                                    }
                                    gettingPage = false;
                                    totalScrollHeight = (scrollElm.scrollHeight || body.scrollHeight) - (scrollElm.innerHeight || scrollElm.clientHeight);
                                    currentScrollHeight = scrollElm.scrollTop || window.scrollY;
                                    if(hasMorePages && !gettingPage){getNextPage(elm, scrollElm);}
                                }else{
                                    if(xhr.status == 404){
                                        loadingElm.remove();
                                    }else{
                                        loadingElm.classList.add('lazyload-loading-error');
                                        loadingElm.innerHTML = 'Failed To Load!';
                                    }
                                    hasMorePages = false;
                                    gettingPage = false;
                                }
                            }
                        };
                        if('${lazyLoad.method}' === 'GET'){
                            xhr.open('GET', url+'?lazyLoadData={"page": '+(nextPage++)+', "contentOnly": true, "key": "${lazyLoadKey}", "nonce": "'+thisNonceKey+'", "tag": "${lazyLoad.origTag}", "scrollElm": "${lazyLoad.origScrollElm}", "method": "${lazyLoad.origMethod}", "afterVars": "${lazyLoad.afterVars}"}', true);
                            xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                            xhr.send();
                        }else{
                            xhr.open('POST', url, true);
                            xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                            xhr.send('lazyLoadData={"page": '+(nextPage++)+', "contentOnly": true, "key": "${lazyLoadKey}", "nonce": "'+thisNonceKey+'", "tag": "${lazyLoad.origTag}", "scrollElm": "${lazyLoad.origScrollElm}", "method": "${lazyLoad.origMethod}", "afterVars": "${lazyLoad.afterVars}"}');
                        }
                    }
                }
                if(${lazyLoad.scrollElm || lazyLoad.tag} === window){
                    getNextPage(document.getElementsByTagName(${lazyLoad.tag})[0], window);
                    document.addEventListener('scroll', function(){
                        if(hasMorePages && !gettingPage){
                            getNextPage(document.getElementsByTagName(${lazyLoad.tag})[0], window);
                        }else if(!gettingPage){
                            let url = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                            if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\\w_\\-+/]/g, '-');}
                            if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
                        }
                    });
                }else{
                    let scrollElm = false;
                    let scrollElmTag = ${lazyLoad.scrollElm || lazyLoad.tag};
                    if(scrollElmTag.startsWith('#')){scrollElm = document.getElementById(scrollElmTag.replace('#', ''));}
                    else if(scrollElmTag.startsWith('.')){scrollElm = document.getElementsByClassName(scrollElmTag.replace('.', ''))[0];}
                    else{scrollElm = document.getElementsByTagName(scrollElmTag)[0];}
                    getNextPage(document.getElementsByTagName(${lazyLoad.tag})[0], scrollElm);
                    scrollElm.addEventListener('scroll', function(){
                        if(hasMorePages && !gettingPage){
                            getNextPage(document.getElementsByTagName(${lazyLoad.tag})[0], scrollElm);
                        }else if(!gettingPage){
                            let url = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                            if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\\w_\\-+/]/g, '-');}
                            if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
                        }
                    });
                }
            });
        }
        if(typeof $ === 'function' || typeof $ === 'object'){
            loadPageAjax($);
        }else if(typeof jQuery === 'function' || typeof jQuery === 'object'){
            loadPageAjax(jQuery);
        }else if(typeof jquery === 'function' || typeof jquery === 'object'){
            loadPageAjax(jquery);
        }else{
            loadPageXml();
        }
    })();
    </script>
    `;
    //todo: add terser module and attempt minify script (make optional dependency)
    return script;
}

function autoAdInsertScript(autoAdInsert, nonceKey){
    autoAdInsert.origTag = autoAdInsert.tag; autoAdInsert.origScrollElm = autoAdInsert.scrollElement || autoAdInsert.scrollElm;
    if(autoAdInsert.tag === 'body' || autoAdInsert.tag === 'window' || autoAdInsert.tag === 'document'){
        autoAdInsert.tag = "'body'";
    }else{autoAdInsert.tag = "'"+autoAdInsert.tag+"'";}
    if(autoAdInsert.scrollElement){autoAdInsert.scrollElm = autoAdInsert.scrollElement;}
    if(autoAdInsert.scrollElm){
        autoAdInsert.scrollElm = autoAdInsert.scrollElm.toString().replace(/[^\w_\-.#]/g, '').toLowerCase();
        if(autoAdInsert.scrollElm === 'body' || autoAdInsert.scrollElm === 'window' || autoAdInsert.scrollElm === 'document'){
            autoAdInsert.scrollElm = 'window';
        }else{autoAdInsert.scrollElm = "'"+autoAdInsert.scrollElm+"'";}
    }
    if(autoAdInsert.distance){
        autoAdInsert.distance = autoAdInsert.distance.toString().replace(/[^0-9.%]/g, '');
        if(autoAdInsert.distance.includes('%')){autoAdInsert.distance = "'"+autoAdInsert.distance+"'";}
    }else{autoAdInsert.distance = "'120%'";}
    if(autoAdInsert.topPadding || autoAdInsert.topPadding === 0){
        autoAdInsert.topPadding = autoAdInsert.topPadding.toString().replace(/[^0-9.]/g, '');
    }else{autoAdInsert.topPadding = '1';}
    let onAdInsert = '';
    if(autoAdInsert.onInsert){
        let insertContent = '';
        if(autoAdInsert.content){insertContent = ` e.detail.insertAd('${autoAdInsert.content}');`;}
        onAdInsert = `document.addEventListener('onAdInsert', e => {${autoAdInsert.onInsert}${insertContent}});`;
    }else if(autoAdInsert.content){onAdInsert = `document.addEventListener('onAdInsert', e => {e.detail.insertAd('${autoAdInsert.content}');});`;}
    let nonce = autoAdInsert.nonce || nonceKey || false;
    if(nonce && typeof nonce === 'string' && nonce.trim() !== ''){
        nonce = ' nonce="'+nonce+'"';
    }else{nonce = '';}
    let script = `
    <script id="auto-ad-insert-script"${nonce} async defer>
    ;(function(){
        
        ${onAdInsert}
        
        const useUnsafeUrl = ${!!autoAdInsert.unsafeUrl || false};
        const loadElement = ${autoAdInsert.tag || "'body'"};
        const scrollElement = ${autoAdInsert.scrollElm || autoAdInsert.tag || 'window'};
        
        const useInnerChildren = ${!!autoAdInsert.includeInnerChildren || false};
    
        let adDistance = ${autoAdInsert.distance};
        let adTopPadding = ${autoAdInsert.topPadding};
    
        let origUrl = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
        if(!useUnsafeUrl){origUrl = origUrl.replace(/[^\\w_\\-+/]/g, '-');}
    
        let loadAdNumber = 1;
        let lastAdScrollHeight = 0;
    
        if(typeof adDistance === 'string'){
            if(adDistance.endsWith('%')){
                adDistance = Number(adDistance.replace(/[^0-9.]/g, ''));
                adDistance = adDistance*window.innerHeight/100;
            }else{adDistance = Number(adDistance.replace(/[^0-9.]/g, ''));}
        }
        adDistance = Math.round(adDistance*100)/100;
    
        let adInsertInfo = {};
        function insertAd(content){
        let ad = document.createElement('div');
        ad.classList = 'ad auto-ad';
        ad.innerHTML = content;
        if(lastAdScrollHeight <= 0 && adTopPadding <= 0){
            adInsertInfo.child.parentNode.insertBefore(ad, adInsertInfo.child);
        }else if(adInsertInfo.child.nextSibling){
            adInsertInfo.child.parentNode.insertBefore(ad, adInsertInfo.child.nextSibling);
        }else{adInsertInfo.child.parentNode.appendChild(ad);}
        if(ad.scrollHeight > 0){lastAdScrollHeight += ad.scrollHeight;}
    }
    
        (function(){
            if(typeof window.CustomEvent === "function"){return false;}
            function CustomEvent(event, params){
            params = params || {bubbles: false, cancelable: false, detail: null};
                let evt = document.createEvent('CustomEvent');
                evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
                return evt;
            }
            window.CustomEvent = CustomEvent;
        })();
    
        const onAdInsert = new CustomEvent('onAdInsert', {
            detail: {
                insertAd: insertAd,
                getAdNumber: function(){return loadAdNumber;},
                getLastScrollHeight: function(){return lastAdScrollHeight;},
                getAdDistance: function(){return adDistance;},
                getAdTopPadding: function(){return adTopPadding;}
            }
        });
        
        function loadAd(){
            document.addEventListener('DOMContentLoaded', function(){
                const body = document.body || document.getElementsByTagName('body')[0];
                function loadAd(elm, scrollElm){
                    let totalScrollHeight = (scrollElm.scrollHeight || body.scrollHeight) - (scrollElm.innerHeight || scrollElm.clientHeight);
                    let currentScrollHeight = scrollElm.scrollTop || window.scrollY;
                    if(totalScrollHeight < 0){totalScrollHeight = (scrollElm.innerHeight || scrollElm.clientHeight);}
                    if(totalScrollHeight > lastAdScrollHeight){
                        findAdSpot(elm);
                            function findAdSpot(elm){
                                let foundElm = false;
                                let children = elm.children;
                                for(let i = 0; i < children.length; i++){
                                    if(children[i].tagName && !children[i].classList.contains('ad')){
                                        if(useInnerChildren && children[i].hasChildNodes()){
                                            foundElm = findAdSpot(children[i]);
                                        }
                                        if(foundElm){break;}
                                        let scrollHeight = currentScrollHeight + children[i].getBoundingClientRect().top;
                                        if(scrollHeight >= lastAdScrollHeight){
                                            foundElm = true;
                                            if(scrollHeight >= adTopPadding){
                                                adInsertInfo = {elm: elm, child: children[i]};
                                                document.dispatchEvent(onAdInsert);
                                            }break;
                                        }
                                    }
                                }return foundElm;
                            }
                        lastAdScrollHeight += adDistance;
                        loadAd(elm, scrollElm);
                    }
                }
    
                if(scrollElement === window){
                    loadAd(document.getElementsByTagName(loadElement)[0], window);
                    document.addEventListener('scroll', function(){
                        loadAd(document.getElementsByTagName(loadElement)[0], window);
                        let url = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                        if(!useUnsafeUrl){url = url.replace(/[^\\w_\\-+/]/g, '-');}
                        if(url !== origUrl){origUrl = url; loadAdNumber = 1; lastAdScrollHeight = 0;}
                    });
                }else{
                    let scrollElm = false;
                    if(scrollElement.startsWith('#')){scrollElm = document.getElementById(scrollElement.replace('#', ''));}
                        else if(scrollElement.startsWith('.')){scrollElm = document.getElementsByClassName(scrollElement.replace('.', ''))[0];}
                        else{scrollElm = document.getElementsByTagName(scrollElement)[0];}
                        loadAd(document.getElementsByTagName(loadElement)[0], scrollElm);
                        scrollElm.addEventListener('scroll', function(){
                            loadAd(document.getElementsByTagName(loadElement)[0], scrollElm);
                            let url = window.location.pathname.toLowerCase().replace(/([^\\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                            if(!useUnsafeUrl){url = url.replace(/[^\\w_\\-+/]/g, '-');}
                            if(url !== origUrl){origUrl = url; loadAdNumber = 1; lastAdScrollHeight = 0;}
                        });
                    }
                });
        }
        loadAd();
    })();
    </script>
    `;
    //todo: add terser module and attempt minify script (make optional dependency)
    return script;
}

function extractTags(str, tags, autoCloseTags = true){
    str = str.toString();
    if(autoCloseTags){str = autoCloseTags(str);}
    forEach(tags, tag => {
        let tagList = [];
        let regex = false;
        if(singleTagsList.includes(tag)){
            regex = new RegExp('(<(?:'+tag+')(?:(?:\\s+?[^>]*?)|)>)', 'gsi');
        }else{regex = new RegExp('(<(?:'+tag+')(?:(?:\\s+?[^>]*?)|)>(?:.*?)<\\/(?:'+tag+')>)', 'gsi');}
        if(!safeRegex(regex)){return;}
        let tagRegex = new RegExp('{{-'+tag+'}}', 'gi');
        if(!safeRegex(tagRegex)){return;}
        if(tag === 'style'){
            str = str.split(styleSheetRegex).map(t => {
                if(t.match(styleSheetRegex)){
                    tagList.push(t);
                    return '';
                }return t;
            }).join('');
        }
        str = str.split(regex).map(t => {
            if(t.match(regex) && (tag !== 'link' || !t.match(styleSheetRegex))){
                tagList.push(t);
                return '';
            }return t;
        }).join('');
        str = str.replace(tagRegex, tagList.join('\n'));
    });
    return str;
}

function basicMarkdown(str){
    if(!str && str !== 0 && str !== false){return null;}

    str = str.toString();

    str = str.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    str = str.replace(/&ast;&ast;&ast;((?!&ast;).+)&ast;&ast;&ast;/g, '<strong><em>$1</em></strong>');
    str = str.replace(/&ast;&ast;((?!&ast;).+)&ast;&ast;/g, '<strong>$1</strong>');
    str = str.replace(/&ast;((?!&ast;).+)&ast;/g, '<em>$1</em>');

    str = str.replace(/__([^_]+)__/g, '<u>$1</u>');
    str = str.replace(/~~([^~]+)~~/gs, '<s>$1</s>');

    str = str.replace(/######(.+)/g, '<h6>$1</h6>');
    str = str.replace(/#####(.+)/g, '<h5>$1</h5>');
    str = str.replace(/####(.+)/g, '<h4>$1</h4>');
    str = str.replace(/###(.+)/g, '<h3>$1</h3>');
    str = str.replace(/##(.+)/g, '<h2>$1</h2>');
    str = str.replace(/#(.+)/g, '<h1>$1</h1>');

    str = str.replace(/[\n\r]--([-]+)[\n\r]/g, '<hr>');

    str = str.replace(/(?:```(.+?)```|&grave;&grave;&grave;(.*?)&grave;&grave;&grave;)/gs, '<pre>$1</pre>');
    str = str.replace(/(?:`(.+?)`|&grave;(.*?)&grave;)/gs, '<p>$1</p>');

    str = str.replace(/([^"'])((?!["'])https?:\/\/(?:(?:[\w_-][\w_\-.]+)|)(?:(?:[\w.,@?^=%&:/~+#_-]*[\w.,@?^=%&:/~+#_-])|))/g, '$1<a href="$2">$2</a>');

    return str;
}

function autoCloseTags(str){
    if(!str && str !== 0 && str !== false){return null;}

    str = escapeInvalidTags(str);

    if(!singleTagsList || singleTagsList.length < 1){return str.toString();}

    const skipTagsList = singleTagsList.join('|');

    let tagOpenings = [];

    let tagRegex = new RegExp('(<\/?(?![^A-Za-z0-9_\-]|\!DOCTYPE|'+skipTagsList+')(?:(?:\\s+?[^>]*?)|)>)', 'gsi');
    if(!safeRegex(tagRegex)){return str.toString();}

    str = str.split(tagRegex).map(tag => {
        if(tag.match(tagRegex)){
            let tagName = tag.replace(/<\/?([A-Za-z0-9_-]+).*?>/gsi, '$1');
            if(tag.startsWith('</')){
                if(tagOpenings.length <= 0){
                    return '';
                }else if(tagOpenings[tagOpenings.length-1] === tagName){
                    tagOpenings.pop();
                    return '</'+tagName+'>';
                }else{
                    let closeTags = '';
                    while(tagOpenings.length > 0 && tagOpenings[tagOpenings.length-1] !== tagName){
                        closeTags += '</'+tagOpenings[tagOpenings.length-1]+'>';
                        tagOpenings.pop();
                    }
                    return closeTags;
                }
            }else{
                tagOpenings.push(tagName);
            }
        }
        return tag;
    });
    while(tagOpenings.length > 0){
        str.push('</'+tagOpenings[tagOpenings.length-1]+'>');
        tagOpenings.pop();
    }
    str = str.join('');

    return str.toString();
}

function escapeInvalidTags(str){if(!str && str !== 0 && str !== false){return null;} return str.toString().replace(/<\/?([A-Za-z0-9_-]+)([^>]+)(<|.$)/gsi, '&lt;$1$2$3');}
function stripInvalidTags(str){if(!str && str !== 0 && str !== false){return null;} return str.toString().replace(/<\/?([A-Za-z0-9_-]+)([^>]+)(<|.$)/gsi, '$2$3');}

function escapeHtml(str){if(!str && str !== 0 && str !== false){return null;} return str.toString().replace(/&(?!(amp|gt|lt|sol|bsol|lbrace|rbrace);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/{/g, '&lbrace;').replace(/}/g, '&rbrace;');}
function unescapeHtml(str){if(!str && str !== 0 && str !== false){return null;} return str.toString().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&lbrace;/g, '{').replace(/&rbrace;/g, '}');}

function forEach(obj, callback){
    if(typeof obj === 'string'){obj = [obj];}
    if(obj && typeof obj === 'object'){
        let keys = Object.keys(obj);
        for(let i = 0; i < keys.length; i++){
            callback(obj[keys[i]], keys[i], obj);
        }
    }else if(obj && Array.isArray(obj)){
        for(let i = 0; i < obj.length; i++){
            callback(obj[i], i, obj);
        }
    }
}

function getObj(obj, path){
    if(!obj || !path || (typeof obj !== 'object' && !Array.isArray(obj)) || (typeof path !== 'string' && typeof path !== 'number' && typeof path !== 'boolean')){return null;}
    path = path.toString().split('|');
    for(let i = 0; i < path.length; i++){
        path[i] = path[i].trim();
        if(path[i].match(/^(["'])(.*?)(\1)/)){return path[i].replace(/^(["'])(.*?)(\1)/, '$2');}
        path[i] = path[i].split(/(?:\.|:|\[([^\]]+)\])/gs).filter(str => str && str.trim() !== '');
        function findVarInObj(object, property){if(property && typeof object === 'object' && typeof object[property] !== 'undefined'){return object[property];} return undefined;}
        let result = undefined;
        if(path[i][0].startsWith('$') && typeof obj['$'] === 'object'){
            path[i][0] = path[i][0].replace('$', '');
            result = path[i].reduce(findVarInObj, obj['$']);
        }else if(!path[i][0].startsWith('$')){result = path[i].reduce(findVarInObj, obj);}
        if(result){return result;}
    }return undefined;
}


module.exports = (() => {
    let exports = function(options = false){
        if(typeof options === 'object'){
            Object.assign(mainOptions, options);
            if(options.cacheDev || options.cacheDev === false){memoryCache.cacheDevelopment(options.cacheDev);}
        }return engine;
    };
    exports.render = render;
    exports.addFunction = addFunction;
    exports.defineSingleTagType = defineSingleTagType;
    exports.basicMarkdown = basicMarkdown;
    exports.escapeHtml = escapeHtml;
    exports.unescapeHtml = unescapeHtml;
    exports.escapeInvalidTags = escapeInvalidTags;
    exports.stripInvalidTags = stripInvalidTags;
    return exports;
})();
