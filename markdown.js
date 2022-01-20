function escapeHtml(str){if(!str && str !== 0 && str !== false){return null;} return str.toString().replace(/&(?!(amp|gt|lt|sol|bsol|lbrace|rbrace);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/{/g, '&lbrace;').replace(/}/g, '&rbrace;');}
function unescapeHtml(str){if(!str && str !== 0 && str !== false){return null;} return str.toString().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&lbrace;/g, '{').replace(/&rbrace;/g, '}');}
function escapeRegex(str){return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');}


function compileMarkdown(data){

  // form
  function form_getValue(values, i = 0){
    let val = values[i];
    if(Array.isArray(val)){
      val = val[0];
    }
    if(typeof val === 'object'){
      val = val.value;
    }
    return val;
  }

  data = data.replace(/<form(\s+.*?|)>(.*?)<\/form>/gsi, (_, attrs, body) => {
    return `<form${attrs}>`+body.replace(/\[(\w+)(\*|)(\s+\w+|)(?:\s*((?:\s*\{(?:\s*(?:[\w_-]+:|)"(?:\\[\\"]|.)*?"\*?\s*|\s*(?:[\w_-]+:|)'(?:\\[\\']|.)*?'\*?\s*)*?\}\s*|\s*(?:[\w_-]+:|)"(?:\\[\\"]|.)*?"\*?\s*|\s*(?:[\w_-]+:|)'(?:\\[\\']|.)*?'\*?\s*)*))\](?:\{(.*?)\}|)/gs, (_, type, required, name, values, attrs) => {
      if(!attrs){attrs = '';}
      else{attrs = ' '+attrs;}
      if(name.trim() === ''){name = undefined;}
      else{name = name.trim();}
      let inputName = ` name="${name}"` || '';

      values = values.split(/(\{(?:\s*(?:[\w_-]+:|)"(?:\\[\\"]|.)*?"\*?\s*|\s*(?:[\w_-]+:|)'(?:\\[\\']|.)*?'\*?\s*)*?\}|\s*(?:[\w_-]+:|)"(?:\\[\\"]|.)*?"\*?\s*|\s*(?:[\w_-]+:|)'(?:\\[\\']|.)*?'\*?\s*)/g).filter(v => v !== '').map(value => {
        value = value.trim();
        if(value.startsWith('{') && value.endsWith('}')){
          return value.split(/(\s*(?:[\w_-]+:|)"(?:\\[\\"]|.)*?"\*?\s*|\s*(?:[\w_-]+:|)'(?:\\[\\']|.)*?'\*?\s*)/g).filter(v => v !== '' && v !== '{' && v !== '}').map((val, i) => {
            val = val.trim();
            let key = undefined;
            val = val.replace(/^([\w_-]+):/, (_, k) => {
              key = k;
              return '';
            });
            if(i === 0){
              return val.replace(/^(["'])((?:\\[\\"']|.)*?)\1\*?$/, '$2');
            }
            let def = val.endsWith('*');
            val = val.replace(/^(["'])((?:\\[\\"']|.)*?)\1\*?$/, '$2');
            return {
              key: key || val.replace(/\s/g, ''),
              value: val,
              default: def
            };
          });
        }
        let key = undefined;
        value = value.replace(/^([\w_-]+):/, (_, k) => {
          key = k;
          return '';
        });
        let def = value.endsWith('*');
        value = value.replace(/^(["'])((?:\\[\\"']|.)*?)\1\*?$/, '$2');
        return {
          key: key || value.replace(/\s/g, ''),
          value: value,
          default: def
        };
      });

      if(type === 'hidden' || type === 'hide' || type === 'value'){
        return `<input type="hidden"${inputName} value="${(form_getValue(values) || '').replace(/([\\"])/g, '\\$1')}"${required ? ' required' : ''}${attrs}>`;
      }else if(type === 'submit' || type === 'button'){
        return `<input type="${type}"${inputName} value="${(form_getValue(values) || name || type).replace(/([\\"])/g, '\\$1')}"${required ? ' required' : ''}${attrs}>`;
      }else if(type === 'label'){
        let lFor = '';
        if(name){lFor = ` for="${name}"`;}
        return `<label${lFor}${attrs}>${form_getValue(values) || name || ''}</label>`;
      }else if(type === 'select'){
        values = values.map(value => {
          if(Array.isArray(value)){
            let group = value.shift();
            value = value.map(val => `<option value="${val.key.replace(/([\\"])/g, '\\$1')}"${val.default ? ' selected' : ''}${attrs}>${val.value}</option>`).join('\n');
            return `
            <optgroup label="${group.replace(/([\\"])/g, '\\$1')}">
              ${value}
            </optgroup>
            `;
          }
          return `<option value="${value.key.replace(/([\\"])/g, '\\$1')}"${value.default ? ' selected' : ''}${attrs}>${value.value}</option>`;
        }).join('\n');
        return `
        <select${inputName}"${attrs}${required ? ' required' : ''}${attrs}>
          ${values}
        </select>
        `;
      }else if(type === 'check' || type === 'checkbox' || type === 'accept'){
        let trueValues = ['true', 'selected', 'checked'];
        let val0 = form_getValue(values);
        let val1 = form_getValue(values, 1);
        let label = undefined;
        let checked = false;
        if(val0 && trueValues.includes(val0.toLowerCase())){
          label = val1;
          checked = true;
        }else if(val1 && trueValues.includes(val1.toLowerCase())){
          label = val0;
          checked = true;
        }else if(val0){
          label = val0;
        }
        if(!label && name && name !== ''){
          label = name.replace(/[_-](\w)/g, (_, l) => ' '+l.toUpperCase());
        }
        let labelHTML = '';
        if(label){
          let lFor = '';
          if(name){lFor = ` for="${name}"`;}
          labelHTML = ` <label${lFor}${attrs}>${label}</label>`;
        }
        let acceptClass = '';
        if(type === 'accept'){acceptClass = ' class="accept"';}
        return `<input type="checkbox"${inputName}${acceptClass} value="${(label || '').replace(/([\\"])/g, '\\$1')}"${checked ? ' checked' : ''}${attrs}>${labelHTML}`;
      }else if(type === 'radio'){
        return values.map(value => {
          if(Array.isArray(value)){
            return value.map(val => `<input type="radio"${inputName} id="${val.key.replace(/([\\"])/g, '\\$1')}" value="${val.key.replace(/([\\"])/g, '\\$1')}"${value.default ? ' checked' : ''}><label for="${val.key.replace(/([\\"])/g, '\\$1')}">${val.value}</label>`).join('\n');
          }
          return `<input type="radio"${inputName} id="${value.key.replace(/([\\"])/g, '\\$1')}" value="${value.key.replace(/([\\"])/g, '\\$1')}"${value.default ? ' checked' : ''}${required ? ' required' : ''}${attrs}><label for="${value.key.replace(/([\\"])/g, '\\$1')}"${attrs}>${value.value}</label>`;
        }).join('\n');
      }else if(type === 'textarea' || type === 'textbox' || type === 'list'){
        let listClass = '';
        if(type === 'list'){listClass = ' class="list"';}
        return `<textarea${inputName}${listClass} placeholder="${(form_getValue(values) || '').replace(/([\\"])/g, '\\$1')}"${required ? ' required' : ''}${attrs}>${(form_getValue(values, 1) || '').replace(/<\/textarea>/g, '&lt;/textarea&gt;')}</textarea>`;
      }

      return `<input type="${type.replace(/([\\"])/g, '\\$1')}" placeholder="${(form_getValue(values) || '').replace(/([\\"])/g, '\\$1')}" value="${(form_getValue(values, 1) || '').replace(/([\\"])/g, '\\$1')}"${required ? ' required' : ''}${attrs}>`;
    })+'</form>';
  });


  // fonts
  data = data.replace(/\*\*\*([^*]+)\*\*\*/gs, '<strong><em>$1</em></strong>');
	data = data.replace(/\*\*([^*]+)\*\*/gs, '<strong>$1</strong>');
	data = data.replace(/\*([^*]+)\*/gs, '<em>$1</em>');

  data = data.replace(/__([^_]+)__/gs, '<u>$1</u>');
	data = data.replace(/~~([^~]+)~~/gs, '<s>$1</s>');


  // headers
	data = data.replace(/^\s*(#{1,6})\s*(.+)$/gm, (_, n, cont) => {
    n = n.length;
    return `<h${n}>${cont}</h${n}>`;
  });

  
  // basic
  data = data.replace(/^\s*>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
	data = data.replace(/^([-*_]){3,}$/gm, '<hr>');


  // code
  data = data.replace(/(?:```([\w_$-])[\r\n]+(.*?)```)/gs, (_, lang, body) => `<pre class="highlight"><code lang="${lang}">${escapeHtml(body)}</code></pre>`);
  data = data.replace(/(?:```(.*?)```)/gs, (_, body) => `<pre class="highlight"><code>${escapeHtml(body)}</code></pre>`);
	data = data.replace(/(?:`(.*?)`)/gs, (_, body) => `<code>${escapeHtml(body)}</code>`);


  // embed
  data = data.replace(/\!\[(.*?)\]\((.*?)\)(?:\{(.*?)\}|)/gs, (_, type, src, attrs) => {
    type = type.toLowerCase();
    src = src.split('\n').map(s => s.replace(/([\\"])/g, '\\$1'));
    if(!attrs || attrs.trim() === ''){attrs = '';}
    else if(!attrs.startsWith(' ')){attrs = ' '+attrs;}

    if(['img', 'image', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'ico', 'webp'].includes(type)){
      if(src.length === 1){
        return `<img src="${src[0]}"${attrs}>`;
      }
      return `
      <picture${attrs}>
        ${src.map(s => {
          let st = undefined;
          if(!s.match(/\.\w+$/)){st = type;}
          return `<source src="${s}" type="image/${st || s.replace(/^.*\.(\w+)$/, '$1')}">`
        }).join('\n')}
        <img src="${src[src.length-1]}"${attrs}>
      </picture>
      `;
    }else if(['vid', 'video', 'mp4', 'wav'].includes(type)){
      return `
      <video${attrs}>
        ${src.map(s => {
          let st = undefined;
          if(!s.match(/\.\w+$/)){st = type;}
          return `<source src="${s}" type="video/${st || s.replace(/^.*\.(\w+)$/, '$1')}">`
        }).join('\n')}
      </video>
      `;
    }else if(['audio', 'sound', 'mp3', 'ogg'].includes(type)){
      return `
      <audio${attrs}>
        ${src.map(s => {
          let st = undefined;
          if(!s.match(/\.\w+$/)){st = type;}
          return `<source src="${s}" type="audio/${st || s.replace(/^.*\.(\w+)$/, '$1')}">`
      }).join('\n')}
      </audio>
      `;
    }else if(['iframe', 'embed', 'pdf'].includes(type)){
      if(src.length === 1){
        return `<iframe src="${src[0]}"${attrs}></iframe>`;
      }else{
        let src0 = src.shift();
        includeScripts['iframe_fallback.js'] = true;
        return `
        <iframe src="${src0}" srcFallback="0" srcFallbackList="${JSON.stringify(src)}"${attrs}></iframe>
        `;
      }
    }
  });


  // link
  data = data.replace(/\[(.*?)\]\((.*?)\)(\{.*?\}|)/gs, (_, text, link, target) => {
    if(target && target !== ''){
      target = target.replace(/^\{(.*)\}$/, '$1');
      if(target === '' || target === '_b'){
        target = '_blank';
      }else if(target === '_s'){
        target = '_self';
      }else if(target === '_p'){
        target = '_parent';
      }else if(target === '_t'){
        target = '_top';
      }
      return `<a href="${link.replace(/([\\"])/g, '\\$1')}" target="${target.replace(/([\\"])/g, '\\$1')}">${escapeHtml(text)}</a>`
    }
    return `<a href="${link.replace(/([\\"])/g, '\\$1')}">${escapeHtml(text)}</a>`
  });
  data = data.replace(/([^"'`])((?!["'`])https?:\/\/(?:(?:[\w_-][\w_\-.]+)|)(?:(?:[\w.,@?^=%&:/~+#_-]*[\w.,@?^=%&:/~+#_-])|))/g, (_, q, link) => `${q}<a href="${link.replace(/([\\"])/g, '\\$1')}">${escapeHtml(link)}</a>`);


  // list
  function compileLists(str){

    // ordered list
    str = str.replace(/^([\t ]*)([0-9]+\.)([\t ]*)(.*)$((?:[\r\n]+\1.*$)*)/gm, function(_, sp1, n, sp2, cont, more){
      let lines = more.split(new RegExp(`[\r\n]+${sp1}`, 'g'));
      lines[0] = n + sp2 + cont;

      let dir = undefined;

      let items = [];
      let lastSP = sp1 + ' '.repeat(n.toString().length) + sp2;
      lines.forEach(line => {
        if(line.match(/^[0-9]+\./)){
          let n1 = 0;
          items.push(line.replace(/^([0-9]+)\.([\t ]*)/, (_, n, sp) => {
            n1 = n;
            lastSP = sp1 + ' '.repeat(n.toString().length) + sp;
            return '';
          }));

          if(dir === undefined && items.length > 1){
            if(Number(n.replace(/[^0-9]*/g, '')) <= Number(n1)){
              dir = '';
            }else{
              dir = ' reversed';
            }
          }
          return;
        }

        let regSP = new RegExp(`^${lastSP}`);
        if(line.match(new RegExp(`^${lastSP}`))){
          line = line.replace(regSP, '');
        }else{
          line = line.replace(/^[\t ]+/, '');
        }

        items[items.length-1] += '\n' + line;
      });

      if(dir === undefined){
        dir = '';
      }

      items = items.map(item => `<li>${compileLists(item).replace(/[\r\n]/g, ' ')}</li>`).join('\n');

      return `
        <ol${dir}>
          ${items}
        </ol>
      `;
    });


    // unordered list
    str = str.replace(/^([\t ]*)([-*+])([\t ]*)(.*)$((?:[\r\n]+\1.*$)*)/gm, function(_, sp1, n, sp2, cont, more){
      let lines = more.split(new RegExp(`[\r\n]+${sp1}`, 'g'));
      lines[0] = n + sp2 + cont;

      let items = [];
      let lastSP = sp1 + ' ' + sp2;
      lines.forEach(line => {
        if(line.startsWith(n)){
          items.push(line.replace(/^[-*+]([\t ]*)/, (_, sp) => {
            lastSP = sp1 + ' ' + sp;
            return '';
          }));
          return;
        }

        let regSP = new RegExp(`^${lastSP}`);
        if(line.match(new RegExp(`^${lastSP}`))){
          line = line.replace(regSP, '');
        }else{
          line = line.replace(/^[\t ]+/, '');
        }

        items[items.length-1] += '\n' + line;
      });

      items = items.map(item => `<li>${compileLists(item).replace(/[\r\n]/g, ' ')}</li>`).join('\n');

      return `
        <ul>
          ${items}
        </ul>
      `;
    });

    return str;
  }
  data = compileLists(data);


  // todo: add support for markdown tables
  // https://www.markdownguide.org/extended-syntax/

  //todo: also add checklist, definition list, forms, inputs, and more to markdown syntax

  // table
  data = data.replace(/(?:^{(.*)}$[\r\n]|)^[\t ]*(\|(?:.*?\|)+)[\t ]*$((?:[\r\n]^[\t ]*(?:\|(?:.*?\|)+)[\t ]*$)+)/gm, (_, attrs, row1, rows) => {
    if(!attrs){attrs = '';}
    else{attrs = ' '+attrs;}
    
    rows = rows.split('\n');
    rows[0] = row1;
    rows = rows.map(row => row.split(/[\s\t ]*\|[\s\t ]*/g).filter(i => i.trim() !== ''));
    if(rows[1][0].match(/^-+$/)){
      rows.splice(1, 1);
    }

    let rowSize = 0;
    rows = rows.map((row, i) => {
      if(i === 0){
        rowSize = row.length;
        return '<tr>'+row.map(col => `<th>${col.replace(/^-+$/, '<hr>')}</th>`).join('\n')+'</tr>';
      }
      let altRow = '';
      if(row.length === 0){
        altRow = ' class="blank"';
      }else if(row.length < rowSize){
        altRow = ' class="small"';
      }else if(row.length > rowSize){
        altRow = ' class="big"';
      }
      return `<tr${altRow}>`+row.map(col => `<td>${col.replace(/^-+$/, '<hr>')}</td>`).join('\n')+'</tr></tr>';
    }).join('\n');

    return `<table${attrs}>${rows}</table>`;
  });


  // paragraph
  data = data.replace(/(?:^{(.*)}$[\r\n]|)(^[\w*_~].*$(?:[\r\n]^[\w*_~].*$)*)/gm, (_, attrs, body) => {
    if(!attrs){attrs = '';}
    else{attrs = ' '+attrs;}
    return `<p${attrs}>${body}</p>`;
  });


  return data;
}

module.exports = compileMarkdown;
