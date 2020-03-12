// In God We Trust

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const safeRegex = require('safe-regex');
const LZUTF8 = require('lzutf8');

const singleTagsList = ['meta', 'link', 'img', 'br', 'hr', 'input'];

const styleSheetRegex = /(<(?:link)(?:.*?)(?:rel="stylesheet")(?:[^>]+)?>)/gs;

let mainOptions = false;
let viewsPath = '';
let viewsType = '';
const fileCache = {};

const lazyLoadKey = crypto.randomBytes(16).toString('hex');

const tagFunctions = {
    'each': {hasContent: true, func: function(attrs, content, options){
            if(mainOptions && (mainOptions.noEach || mainOptions.noForEach)){return;}
            let val = getObj(options, attrs[0]);
            if(!val){return;}
            let setVal = false; let setIndex = false;
            if(attrs.includes('as')){setVal = attrs[attrs.indexOf('as')+1];}
            if(attrs.includes('of')){setIndex = attrs[attrs.indexOf('of')+1];}
            let result = '';
            forEach(val, (val, i) => {
                if(!setVal && !setIndex){result += content;}
                result += content.replace(/({{{?)([\w_\-.:\[\]]*?)(=)?(?:"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)(}}}?)/g, (str, open, attr, isAttr, tag, close) => {
                    tag = tag.replace(/[^\w_\-.:\[\]]/g, '').replace(/[.:\[\]]/g, '.').replace(/\.\./g, '.');
                    if(tag.endsWith('.')){tag = tag.substring(0, tag.lastIndexOf('.'));}
                    let tagStart = tag;
                    if(tagStart.includes('.')){tagStart = tagStart.substring(0, tag.indexOf('.'));}
                    if(tagStart !== setVal && tagStart !== setIndex){return str;}
                    if(tag.includes('.')){tag = tag.replace(tagStart+'.', '');}else{tag = '';}
                    let cleanHtml = !(open === '{{{' && close === '}}}');
                    function result(str){if(!str){return '';}str = str.toString();if(str && str.trim() !== ''){if(!cleanHtml){return str;}return escapeHtml(str);}return '';}
                    if(tagStart === setVal){
                        let resultItem = result(getObj(val, tag) || val);
                        if(isAttr){
                            if(attr){return attr+'="'+resultItem+'"';}
                            return tagStart+'="'+resultItem+'"';
                        }return resultItem;
                    }else if(tagStart === setIndex){
                        let resultItem = result(i);
                        if(isAttr){
                            if(attr){return attr+'="'+resultItem+'"';}
                            return tagStart+'="'+resultItem+'"';
                        }return resultItem;
                    }
                    return str;

                    //test regex
                }).replace(/({{{?)(?:#(\w(?:[\w_\-:]+))\s+?(.*?))(}}}?)/g, (str, open, tag, attr, close) => {
                    attr = attr.split(/([ &|])/g).map(attr => {
                        let attrStart = attr;
                        if(attrStart.includes('.')){attrStart = attrStart.substring(0, tag.indexOf('.'));}
                        if(attrStart !== setVal){return attr;}
                        if(attr.includes('.')){attr = '.'+attr.replace(attrStart+'.', '');}else{attr = '';}
                        return attrs[0]+'.'+i+attr;
                    }).join('');
                    return '{{#'+tag+' '+attr+'}}';
                });
            });
            return result;
        }},
    'import': {hasContent: false, func: function(attrs, content, options){
            if(mainOptions && mainOptions.noImports){return;}
            if(attrs){
                let fileType = viewsType || mainOptions.type || mainOptions.extension || 'html';
                if(fileType.startsWith('.')){fileType = fileType.replace('.', '');}
                let filePath = path.join(viewsPath || mainOptions.dir || mainOptions.path || __dirname, attrs[0]+'.'+fileType);
                if(!filePath.startsWith(path.join(viewsPath || mainOptions.dir || mainOptions.path || __dirname))){return null;}
                let result = getFileCache(filePath);
                if(!result){
                    if(fs.existsSync(filePath)){try{result = fs.readFileSync(filePath);}catch(e){result = undefined;}}
                    setFileCache(filePath, result, options);
                }
                if(result){return replaceAllTags(autoCloseTags(result), options);}
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

function compressStr(str){
    if(!str){return undefined;}
    if(typeof str === 'object' || Array.isArray(str)){try{str = JSON.stringify(str);}catch(e){return null;}}
    try{return LZUTF8.compress(str, {outputEncoding: 'StorageBinaryString'});}catch(e){return null;}
}

function decompressStr(str){
    if(!str){return undefined;}
    try{str = LZUTF8.decompress(str, {inputEncoding: 'StorageBinaryString'});}catch(e){return null;}
    try{str = JSON.parse(str);}catch(e){}
    return str;
}

function getFileCache(filePath){
    if(process.env.NODE_ENV !== 'production' && (!mainOptions || !mainOptions.cacheDev)){return false;}
    if(fileCache[filePath] && (new Date().getTime()) <= fileCache[filePath].cache){
        return decompressStr(fileCache[filePath].file);
    }else if(fileCache[filePath]){delete fileCache[filePath];}
    return false;
}

function setFileCache(filePath, data, options){
    if(!fileCache[filePath]){
        if(data){data = data.toString();}
        if((options && options.cache) || (mainOptions && mainOptions.cache)){fileCache[filePath] = {file: compressStr(data), cache: (new Date().getTime())+toTimeMillis(options.cache || mainOptions.cache)};}
    }
}

setInterval(function(){
    forEach(fileCache, (file, filePath) => {
        if((new Date().getTime()) > file.cache){delete fileCache[filePath];}
    });
}, toTimeMillis('10m'));

function engine(filePath, options, callback){
    viewsType = filePath.substr(filePath.lastIndexOf('.'));
    viewsPath = path.join(filePath, '..');
    let fileData = getFileCache(filePath);
    if(fileData){
        let rendered = render(fileData, options);
        return callback(null, rendered);
    }else{
        fs.readFile(filePath, function(err, content){
            if(err){return callback(err);}
            setFileCache(filePath, content, options);
            let rendered = render(content, options);
            return callback(null, rendered);
        });
    }
}

function filterExists(str){return str && str.toString().trim() !== '';}

function render(str, options){
    str = str.toString();

    if(mainOptions && mainOptions.raw){return str;}

    if(!str.startsWith('\n')){str = '\n\r'+str;}
    if(!str.endsWith('\n')){str += '\n\r';}
    str = autoCloseTags(str);

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
            }else{
                setFileCache(template, null, options);
            }
        }
        str = str.replace(/{{{?body}}}?/g, '').replace(/<\/?(!DOCTYPE|html|head|body)((\s+?[^>]*?)|)>/gsi, '');
        if(options.lazyLoad && options.lazyLoad.tag){str = str.replace(new RegExp('<\\/?('+options.lazyLoad.tag.toString().replace(/[^\w_-]/g, '')+')((\\s+?[^>]*?)|)>', 'gsi'), '');}
        if(layout){str = layout.replace(/{{{body}}}/g, str).replace(/{{body}}/g, escapeHtml(str));}
    }

    if(options.lazyLoad && !options.lazyLoad.afterVars && options.lazyLoad.tag){
        let splitRegex = new RegExp('(<'+options.lazyLoad.tag.toString()+'(?:(?:\\s+?[^>]*?)|)>)(.*?)(<\\/'+options.lazyLoad.tag.toString()+'>)', 'gsi');
        if(safeRegex(splitRegex)){
            str = str.split(splitRegex);
            if(str.length > 1 && options.lazyLoad.data && typeof options.lazyLoad.data === 'object' && options.lazyLoad.data.key === lazyLoadKey && options.lazyLoad.data.page > 1){
                str[2] = str[2].split(/{{#lazy[_-]?load}}/gi, options.lazyLoad.data.page);
                if(str[2].length !== options.lazyLoad.data.page){return '';}
                str[2] = str[2][str[2].length-1];
                if(options.lazyLoad.data.contentOnly){str = [str[2]];}
            }else if(str.length > 1){
                str[2] = str[2].split(/{{#lazy[_-]?load}}/gi, 1)[0];
            }
            str = str.join('');
            str = str.replace(/(<\/body>)/gi, lazyLoadScript(options.lazyLoad, options.nonce)+'$1');
        }
    }

    str = replaceAllTags(str, options);

    let ranTagGroup = false;

    str = str.replace(/({{{?)#(\w(?:[\w_\-:])+)(.*?)(}}}?)(.*?)({{{?)\/(\2+)(}}}?)/gs, (str, open, tag, attrs, close, content) => {
        if(!tag){return str;}
        tag = tag.trim();
        if(tag.includes(':')){tag = tag.substring(0, tag.indexOf(':')).trim();}
        if(tag === 'delete'){return '';}
        if(tag.match(/no[_-]?html/gi)){return escapeHtml(content);}
        if(tag.match(/no[_-]?markdown/gi)){return '{{#no-markdown}}\n'+content+'\n{{/no-markdown}}';}
        if(attrs){attrs = attrs.split(' ').filter(filterExists);}
        if(tagFunctions[tag]){
            ranTagGroup = true;
            return tagFunctions[tag].func(attrs, content, options) || '';
        }
        return '';
    });

    function runTagGroups(str, open, tag, attrs, close, content){
        if(!tag){return str;}
        tag = tag.trim();
        if(tag.includes(':')){tag = tag.substring(0, tag.indexOf(':')).trim();}
        if(tag.match(/no[_-]?markdown/gi)){return '{{#no-markdown}}\n'+content+'\n{{/no-markdown}}';}
        if(attrs){attrs = attrs.split(' ').filter(filterExists);}
        if(tagFunctions[tag]){
            ranTagGroup = true;
            return tagFunctions[tag].func(attrs, content, options) || '';
        }
        return '';
    }

    let loops = 100;
    while(ranTagGroup && loops-- > 0){
        ranTagGroup = false;
        str = str.replace(/({{{?)#(\w(?:[\w_\-:])+)(.*?)(}}}?)(.*?)({{{?)\/(\2+)(}}}?)/gs, runTagGroups);
        if(loops < 0){break;}
    }


    if(options.lazyLoad && options.lazyLoad.afterVars && options.lazyLoad.tag){
        let splitRegex = new RegExp('(<'+options.lazyLoad.tag.toString()+'(?:(?:\\s+?[^>]*?)|)>)(.*?)(<\\/'+options.lazyLoad.tag.toString()+'>)', 'gsi');
        if(safeRegex(splitRegex)){
            str = str.split(splitRegex);
            if(str.length > 1 && options.lazyLoad.data && typeof options.lazyLoad.data === 'object' && options.lazyLoad.data.key === lazyLoadKey && options.lazyLoad.data.page > 1){
                str[2] = str[2].split(/{{#lazy[_-]?load}}/gi, options.lazyLoad.data.page);
                if(str[2].length !== options.lazyLoad.data.page){return '';}
                str[2] = str[2][str[2].length-1];
                if(options.lazyLoad.data.contentOnly){str = [str[2]];}
            }else if(str.length > 1){
                str[2] = str[2].split(/{{#lazy[_-]?load}}/gi, 1)[0];
            }
            str = str.join('');
            str = str.replace(/(<\/body>)/gi, lazyLoadScript(options.lazyLoad, options.nonce)+'$1');
        }
    }

    if(!mainOptions || !mainOptions.noMarkdown){
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

    if(!mainOptions || !mainOptions.keepInvalidVars){str = str.replace(/({{{?(?:(?:[^}]+)|)}}}?)/g, '');}

    str = autoCloseTags(str);

    return str.toString().trim();
}

function replaceAllTags(str, options){
    const container = [];
    return str.toString().replace(/({{{?)([^}]+)(}}}?)/g, (str, open, tag, close) => {
        if(!tag){return str;}
        tag = tag.trim();
        if(container.find(item => item.tag === 'no-html')){
            if(tag === '/no-html'){
                while(container[container.length-1].tag !== 'no-html' && container.length > 0){container.pop();}
                container.pop();
                return str;
            }
            return escapeHtml(str);
        }else if(tag === '#no-html'){container.push({tag: 'no-html'}); return str;}

        let cleanHtml = !(open === '{{{' && close === '}}}');
        function result(str){if(!str){return '';}str = str.toString();if(str && str.trim() !== ''){if(!cleanHtml){return str;}return escapeHtml(str);}return '';}

        if(tag.match(/^(?:[#\/](?:delete|lazy[_-]?load|no[_-]?markdown))/i) || tag.match(/^(?:-(\w(?:[\w_\-]+)))/)){return str;}

        if(tag.match(/^(?:else(\s+?\w(?:[\w_\-.:\[\]]+))?)/) && container.find(item => item.tag === 'if' || item.tag === 'unless')){
            tag = tag.replace(/^(?:else((?:\s+?\w[\w_\-.:\[\]]+)|))/, '$1');
            if(!tag || tag.trim() === ''){tag = false;}
            else{tag = tag.toString().split(/([&|])/g).map(tag => tag.toString().trim());}
            let item = false; let index = 0;
            for(let i = container.length-1; i >= 0; i--){
                if(container[i].tag === 'if' || container[i].tag === 'unless'){
                    if(container[i].lastElse === true){break;}
                    item = container[i]; index = i;
                    if(!tag){container[i].lastElse = true;}
                    break;
                }
            }
            if(!item){return '';}
            if(!item.inDelete && item.hasResult){container[index].inDelete = true; return '{{#delete}}';}
            if(!item.hasResult){
                let isTrue = item.tag === 'unless';
                if(!tag){
                    isTrue = true;
                }else{
                    function setVal(val){if(item.tag === 'unless'){isTrue = !val;}isTrue = !!val;}
                    for(let i = 0; i < tag.length; i++){
                        if(isTrue && tag[i] === '|'){
                            break;
                        }else if(!isTrue && tag[i] === '&'){
                            break;
                        }else if(tag[i] !== '&' && tag[i] !== '|'){
                            setVal(getObj(options, tag[i]));
                        }
                    }
                }
                container[index].hasResult = isTrue;
                if(!isTrue && !item.inDelete){
                    container[index].inDelete = true;
                    return '{{#delete}}';
                }else if(isTrue && item.inDelete){
                    container[index].inDelete = false;
                    return '{{/delete}}';
                }
            }
            return '';
        }

        function hasAttrTag(tag){
            for(let i = 0; i < container.length; i++){
                if(container[i].attrs && (container[i].attrs.includes(tag) || container[i].attrs.includes(tag.substring(0, tag.indexOf('.'))))){
                    return true;
                }
            }
            return false;
        }

        if(tag.match(/^(?:(\w(?:[\w_\-]+))\s*?=\s*?"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)/)){
            // var (with attr)
            tag = tag.split(/^(?:(\w(?:[\w_\-]+))\s*?=\s*?"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)/).filter(filterExists);
            if(hasAttrTag(tag[1])){return str;}
            return result(tag[0]+'="'+getObj(options, tag[1])+'"');
        }else if(tag.match(/^(?:=\s*?"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)/)){
            // var (with self attr)
            tag = tag.split(/^(?:=\s*?"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)/).filter(filterExists);
            if(hasAttrTag(tag[0])){return str;}
            return result(tag[0]+'="'+getObj(options, tag[0])+'"');
        }else if(tag.match(/^(?:"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)/)){
            // var (basic)
            tag = tag.split(/^(?:"?\s*?(\w(?:[\w_\-.:\[\]]+))\s*?"?)/).filter(filterExists);
            if(hasAttrTag(tag[0])){return str;}
            return result(getObj(options, tag[0]));
        }else if(tag.match(/^(?:#(if|unless)\s+?(.*?))/)){
            // if/unless open tag
            tag = tag.split(/^(?:#(if|unless)\s+?(.*?))/).filter(filterExists);
            let method = tag.shift();
            if(!tag[0]){return '';}
            tag = tag[0].split(/([&|])/g);
            let isTrue = method === 'unless';
            function setVal(val){if(method === 'unless'){isTrue = !val;}isTrue = !!val;}
            for(let i = 0; i < tag.length; i++){
                if(isTrue && tag[i] === '|'){
                    break;
                }else if(!isTrue && tag[i] === '&'){
                    break;
                }else if(tag[i] !== '&' && tag[i] !== '|'){
                    setVal(getObj(options, tag[i]));
                }
            }
            container.push({tag: method, attrs: false, hasResult: isTrue, inDelete: !isTrue});
            if(!isTrue){return '{{#delete}}';}
            return '';
        }else if(tag.match(/^(?:\/(if|unless))/)){
            // if/unless close tag
            tag = tag.replace(/^(?:\/(if|unless))/, '$1');
            if(container.find(item => item.tag === tag)){
                while(container[container.length-1].tag !== tag && container.length > 0){container.pop();}
                let item = container.pop();
                if(!item){return '';}
                if(item.inDelete){return '{{/delete}}';}
            }
            return '';
        }else if(tag.match(/^(?:#(\w(?:[\w_\-]+))\s+?(.*?))/)){
            // function/container open tag
            tag = tag.split(/^(?:#(\w(?:[\w_\-]+))\s+?(.*?))/).filter(filterExists);
            let method = tag.shift();
            if(!tag[0]){return '';}
            tag = tag[0].split(' ').filter(filterExists);
            if(!tagFunctions[method]){return str;}
            if(tagFunctions[method].hasContent){
                let result = '{{#'+method+':'+container.length+' '+tag.join(' ')+'}}';
                container.push({tag: method, attrs: tag});
                return result;
            }else{return result(tagFunctions[method].func(tag, false, options));}
        }else if(tag.match(/^(?:\/(\w(?:[\w_\-]+)))/)){
            // container close tag
            tag = tag.replace(/^(?:\/(\w(?:[\w_\-]+)))/, '$1');
            if(container.find(item => item.tag === tag)){
                while(container[container.length-1].tag !== tag && container.length > 0){container.pop();}
                container.pop();
                return '{{/'+tag+':'+container.length+'}}';
            }
        }

        return '';
    });
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
        let origUrl = window.location.pathname.toLowerCase().replace(/([^\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
        if(${!lazyLoad.unsafeUrl || true}){origUrl = origUrl.replace(/[^\w_\\-+/]/g, '-');}
        
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
                        let url = window.location.pathname.toLowerCase().replace(/([^\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                        if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\w_\\-+/]/g, '-');}
                        if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
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
                                    if(elm === window){
                                        jQuery('body').append(data.toString());
                                    }else{elm.append(data.toString());}
                                    document.dispatchEvent(onPageLazyLoad);
                                }
                                gettingPage = false;
                                if(hasMorePages && !gettingPage){getNextPage(elm, scrollElm);}
                            },
                            error: function(){
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
                        let url = window.location.pathname.toLowerCase().replace(/([^\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                        if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\w_\\-+/]/g, '-');}
                        if(url !== origUrl){origUrl = url; nextPage = 2; hasMorePages = true;}
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
                                        let newElm = document.createElement('div');
                                        newElm.innerHTML = data.toString();
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
                                    loadingElm.classList.add('lazyload-loading-error');
                                    loadingElm.innerHTML = 'Failed To Load!';
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
                            let url = window.location.pathname.toLowerCase().replace(/([^\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                            if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\w_\\-+/]/g, '-');}
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
                            let url = window.location.pathname.toLowerCase().replace(/([^\w_-])?:(\\/\\/|\\\\\\\\)/gs, '').replace(/(:|\\/\\/:\\\\\\\\)/gs, '').replace(/\\\\/gs, '/');
                            if(${!lazyLoad.unsafeUrl || true}){url = url.replace(/[^\w_\\-+/]/g, '-');}
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
    return path.toString().trim().split(/(?:\.|:|\[([^\]]+)\])/gs).filter(str => str && str.trim() !== '').reduce(function(object, property){if(property && typeof object === 'object' && typeof object[property] !== 'undefined'){return object[property];} return undefined;}, obj);
}

function toNumber(str){
    if(typeof str === 'number'){return str;}
    return Number(str.replace(/[^0-9.]/g, '').split('.', 2).join('.'));
}

function toTimeMillis(str){
    if(typeof str === 'number'){return Number(str);}
    if(!str || typeof str !== 'string' || str.trim() === ''){return NaN;}
    if(str.endsWith('h')){
        return toNumber(str)*3600000;
    }else if(str.endsWith('m')){
        return toNumber(str)*60000;
    }else if(str.endsWith('s')){
        return toNumber(str)*1000;
    }else if(str.endsWith('D')){
        return toNumber(str)*86400000;
    }else if(str.endsWith('M')){
        return toNumber(str)*2628000000;
    }else if(str.endsWith('Y')){
        return toNumber(str)*31536000000;
    }else if(str.endsWith('DE')){
        return toNumber(str)*315360000000;
    }else if(str.endsWith('C') || this.endsWith('CE')){
        return toNumber(str)*3153600000000;
    }else if(str.endsWith('ms')){
        return toNumber(str);
    }else if(str.endsWith('us') || this.endsWith('mic')){
        return toNumber(str)*0.001;
    }else if(str.endsWith('ns')){
        return toNumber(str)*0.000001;
    }
    return toNumber(str);
}


module.exports = (() => {
    let exports = function(options = false){
        mainOptions = options;
        return engine;
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