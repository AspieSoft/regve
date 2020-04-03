## Regex View Engine

![npm](https://img.shields.io/npm/v/regve)
![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/regve)
![GitHub top language](https://img.shields.io/github/languages/top/aspiesoft/regve)
![NPM](https://img.shields.io/npm/l/regve)

![npm](https://img.shields.io/npm/dw/regve)
![npm](https://img.shields.io/npm/dm/regve)
![GitHub last commit](https://img.shields.io/github/last-commit/aspiesoft/regve)

[![paypal](https://img.shields.io/badge/buy%20me%20a%20coffee-paypal-blue)](https://buymeacoffee.aspiesoft.com/)

This view engine avoids throwing errors on undefined values.
The engine instead, simply hides undefined (or falsy) values.

The engine also has an (optional) easy to use, page lazy load system.
Info on how to set up lazy loading is towards the bottom of this page.

The view engine runs mainly through regex functions, to try and gain improved speed and performance.

The syntax of this view engine is similar to handlebars, but with a few unique changes. (So remember to read the documentation)

This view engine has some (optional) basic markdown like features, by using regex to replace markdown with html.
You can add variables and use if and each statements.
You can also import other views into the current view.
You can choose any html tag name, and have it automatically moved to a different location.

The if statements support & (and) | (or) operators, as will as the ! (not) operator.
If statements also support < = > and you can check if a var is equal to a 'string'.

There are also some shortened methods for doing common tasks in a simpler way.

Most of the regex in this npm module, was manually checked with the safe-regex module.

### Installation

```shell script
npm install regve
```

### Setup

```js
// express

const express = require('express');
const regve = require('regve');

const app = express();

app.engine('html', regve({/* global options */}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

app.use(function(req, res, next){
    res.render('index', {title: 'example', content: "<h2>Hello, World!</h2>"});
});


// render from string

const regve = require('regve');

regve({/* global options */});

let html = '#Hello, {{name}}!';

html = regve.render(html, {name: 'World'});

console.log(html);
```

### You can also define a template you want to use

```js
regve({template: 'layout'});
```

### Other options you might need if Not using express

```js
// if your Not using express, you can still define the the views path and file type in another way
path = require('path');
regve({
    dir: path.join(__dirname, 'views'),
    type: 'html'
});
```

### Usage

```js
// to disable everything, and send raw html, just set the raw option to true
// note: cache will still run if set
app.engine('html', regve({raw: true}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
```

```html
<!-- add vars -->
{{title}}

<!--add vars with objects-->
{{title.default}}
{{title.1}}

<!-- add html -->
<!-- {{{3}}} allows html and {{2}} escapes html -->
{{{content}}}


<!-- set attributes if the value exists -->
<script src="/script.js" {{nonce=nonce_key}}></script>
<!-- or if the attribute is named after the var -->
<script src="/script.js" {{=nonce}}></script>
<!-- or if your ide auto adds quotes -->
<script src="/script.js" {{nonce="nonce_key"}}></script>
<script src="/script.js" {{="nonce"}}></script>
<!-- for all of those, the result html will look something like this -->
<script src="/script.js" nonce="12345"></script>


<!-- if/unless statements -->
{{#if title}}
    <title>{{title}}</title>
{{else}}
    <title>default title</title>
{{/if}}

<!-- the '!' (not) operator -->
<!-- this is used instead of an 'unless' function -->
{{#if !content}}
    no content
{{else}}
    {{{content}}}
{{/if}}

<!-- if statements also support else if -->
{{#if title1}}
    <title>{{title1}}</title>
{{else title2}}
    <title>{{title2}}</title>
{{else}}
    <title>Default Title</title>
{{/if}}

<!-- if statements also support '&' (and) '|' (or) operators -->
{{#if name & url}}
    <a {{href="url"}}>{{name}}</a>
{{else name | url}}
    <!-- unset tags are simply removed, and do Not throw an error -->
    {{name}} {{url}}
{{/if}}

<!-- you can also use the '|' operator in vars, similar to how you would in javascript -->
{{{myContent | myBackupContent}}}
<html {{lang="selected-lang|default-lang"}}></html>

<!-- you can use the '|' operator in first level each statements as well -->
<!-- note: you must Not include spaces in each statements -->
{{#each items|itemsDefault as item}}
    {{item}}
    <br>
{{/each}}

<!-- the '|' operator is also supported in any custom function (without spaces) -->

<!-- if equal operator -->
{{#if item = 'item1'}} <!-- if item === string -->
    this is the first item
{{else item = defaultItem}} <!-- if item === var -->
    this is {{defaultItem}}
{{else !item}}
    there is no item
{{/if}}

<!-- if not equal operator -->
{{#if item != 'item1'}} <!-- if item !== string (same with var) -->
    this is Not the first item
{{/if}}

<!-- note: number strings will be converted to numbers when checking equality ('1' = '01' & '1' = '1.0' output: true) -->

<!-- if < (or) > operators -->
{{#if '1' < '2'}}
    true
{{/if}}

{{#if '1' > '2'}}
    false
{{/if}}

{{#if '1' <= '1'}}
    true
{{/if}}
{{#if '1' < '1'}}
    false
{{/if}}

{{#if '2' >= '1'}}
    true
{{/if}}
{{#if '2' > '2'}}
    false
{{/if}}


<!-- | 'string' operator -->
<!-- you can use quotes to set a var | a fallback to a string, similar to how it works in javascript -->
{{test | 'default'}}

<!-- if you surround a var with quotes, it will be in quotes if it exists -->
{{"test"}}


<!-- each statements -->
<!-- in js {list: {userID1: 'username1', userID2: 'user2'}} -->
{{#each list as item of index}}
    {{index}} = {{item}}
{{/each}}

<!-- you can also include from object (outputs the name of the object your running on) -->
{{#each list as item of index from object}}
    {{object}} <!-- output: list -->
    {{index}} = {{item}}
{{/each}}

<!-- these attrs can be in any order (or undefined), as long as the object your running on is first -->
{{#each list from object of index as item}}
    {{object}}:
    {{index}} = {{item}}
{{/each}}

<!-- each statements with objects -->
<!-- in js {list: [{id: 'userID1', name: 'username1'}, {id: 'userID2', name: 'user2'}]} -->
{{#each list as item of index}}
    {{item.id}} = {{item.name}}
{{/each}}

<!-- each statements can have if statements inside -->
{{#each list as item}}
    {{#if item}}
        <a href="{{item.url}}">{{item.name}}</a>
    {{/if}}
{{/each}}

<!-- supports nested each statements -->
<!-- in js {menus: {main: [{url: '/', name: 'Home'}, {url: '/youtube', name: 'YouTube'}], youtube: [{url: '/youtube/video', name: 'Video'}]}} -->
{{#each menus as menu of type}}
    <div {{="type"}}>
        <!-- pulls reference from "as menu" -->
        {{#each menu as item}}
            <a {{href="item.url"}}>{{item.name}}</a>
        {{/each}}
    </div>
{{/each}}

<!-- you can run 2 or more each statements at the same time with the & (and) operator (no spaces) -->
{{#each list1&list2 as item of index from list}}
    {{list}}:
    {{index}} = {{item}}
    {{#if list = 'list1'}}
        this is the first list
    {{/if}}
    <br>
{{/each}}


<!-- creating vars -->
{{$myVar = 'a new var'}}
{{$myVar2 = menu|menus.0}}
<!-- or set in template -->
regve.render('index', {$: {myVar: 'a new var default'});

<!-- using vars -->
{{$myVar}} <!-- output: a new var -->
{{$myVar2}} <!-- output: menu (or) menus.0 (just like normal objects) -->

<!-- import another view -->
<!-- must be {{{3}}} to allow html -->
{{{#import header}}}


<!-- disable markdown -->
{{#no-markdown}}
    markdown will not run in here
{{/no-markdown}}

<!-- escape html -->
{{#no-html}}
    html should not run here
    Do Not rely on this for html security
    The purpose of this, is so an admin can display html without running it
{{/no-html}}

<!-- delete -->
{{#delete}}
    This text will be removed before rendering
    Do Not rely on this for security
    The purpose of this, is for the engine to remove the right content from if else statements in bulk
{{/delete}}


<!-- basic markdown support -->
<!-- note: markdown is not escaped in objects, but it is limited so your users can use it in comments -->
#h1
##h2
###h3
####h4
#####h5
######h6

--- = <hr>

<!-- auto clickable http and https links -->
https://example.com = <a href="https://example.com">https://example.com</a>
<!-- only runs if url is Not in "quotes" -->
<a href="https://example.com">example</a> = <a href="https://example.com">example</a>

`p tag` = <p>p tag</p>

pre tag also supported with 3 ` but this readme is written in markdown, so I can not display it.

*italic*
**bold**
***bold italic***
__underlined__
~~strike through~~
```

### How to extract/move tags

```js
//you can add any tag name. custom tags also work
//note: style tag also includes stylesheets. <link rel="stylesheet" href="/style.css">
app.engine('html', regve({extract: ['script', 'style', 'link', 'meta']}));
```

```html
<!-- from: -->
<script src="script.js"></script>
<meta content="unwanted meta tag">
some other text
{{-script}}

<!-- to: -->
some other text
<script src="script.js"></script>
```

### Cache views into memory

```js
// this can help reduce the number of calls to fs.reaFile()
// note: the cache is also reset on server restart
// note: the cache value is case sensitive

app.engine('html', regve({cache: '2h'})); // 2 hours

// or if you have a small number of views that never change
app.engine('html', regve({cache: '1Y'})); // 1 Year

// or for a daily cache
app.engine('html', regve({cache: '1D'})); // 1 Day

// the cache only runs on production. to run the cache in development, set the cacheDev option
app.engine('html', regve({cache: '2m', cacheDev: true})); // 2 minutes (also runs in development)
```

### run functions before and after render (express)
```js
// in express, you can set a callback function, just before, or just after res.render() runs
// the data is the file data before or after rendered
// you can also return the data, with some modifications, to override the original data (must be type string)
// returning nothing will leave the result alone
// data will be returned as a buffer, so you may need to use data.toString() to modify it

regve({onBeforeRender: function(data){
    // this will run before res.render() runs
    return data;
}});

regve({onAfterRender: function(data){
    // this will run after res.render() runs
    return data;
}});

// you can also run these functions by setting options

res.render('index', {onBeforeRender: function(data){
    // this will run before res.render() runs
    return data;
}});

res.render('index', {onAfterRender: function(data){
    // this will run after res.render() runs
    return data;
}});
```

### Other options

```js
// to increase performance, you can globally skip some of the unused parts of the view engine
// you can also add these to res.render({/* options */});
app.engine('regve', regve({
    noImports: true,
    noEach: true,
    noMarkdown: true
}));

// by default, the view engine will remove any unused vars
// you can disable this feature by setting the keepInvalidVars option
app.engine('html', regve({keepInvalidVars: true}));
```

### Creating your own template functions

```js
let hasContent = true || false; // default = false
regve.addFunction('name', function(attrs, content, options){
    // attrs is an array of items added after the tag name, separated by spaces
    // example: {{#name attr1 attr2 attr3}}
    
    // content only exists if hasContent is true
    // if hasContent is true, than you will need to close the tag with {{/name}}
    // example: {{#name attrs}} content {{/name}}
    
    // options are the vars you set when adding the template
    // example: res.render('index', {/* options */});
    
    // when your done, you need to return the new content
    // if you return nothing, the content is simply removed
    return content;
}, hasContent);
```

### Defining single type html elements

```js
// this module automatically closes any open tags, but it defines the tags that should not close
// example: <div> should be closed with </div>, but <input> should Not be closed with </input>
// if you notice any tags that should Not close were missed, you can add them with this function
regve.defineSingleTagType('input');
regve.defineSingleTagType('img');
regve.defineSingleTagType('br');
```

### Lazy Loading Pages

```js
// lazy loading a page as the user scrolls down, is one of the more advanced options this view engine has to offer
// this option is disabled by default, and can be enabled per page render

// express example

const express = require('express');
const regve = require('regve');

const app = express();

// you may also need to set up a module to get post body, (or use optional get method)
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json({type: ['json']}));

app.engine('html', regve({/* global options */}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

app.post(function(req, res){
    // compatible with nonce script key (set with {{nonce}}) (even if random per click, will send original key in ajax call)
    // the nonce key (if set) is pulled from its own script tag to a temp 'let' variable when running an ajax call, to preserve the way google hides the key in console 'elements' on a script tag
    res.render('index', {lazyLoad: {tag: 'body', method: 'post', data: req.body.lazyLoadData}});
});

app.get(function(req, res){
    // method 'post' will use app.post when sending ajax request to server for next piece of the page
    // method 'get' is optional
    res.render('index', {lazyLoad: {tag: 'body', method: 'post'}});
});

app.get(function(req, res){
    // you can also set the 'lazyLoad.scrollElm' option and append to a different tag than you scrolled to
    // this is useful if you want to have a footer scroll with the content, and stay at the bottom when new content is added
    // 'scrollElm' can be a class, id, or tag name
    res.render('index', {lazyLoad: {tag: 'main', scrollElm: 'body'}});
});

app.get(function(req, res){
    // by default, the lazyLoad option will run before any variables are added or functions are run, allowing unused parts of the lazy loaded template to be removed before rendering
    // you can disable this if needed, by setting the 'afterVars' option to true
    // setting this can be useful if you have a variable that adds the {{#lazyload}} tag dynamically
    res.render('index', {lazyLoad: {afterVars: true}});
});

// if you only have specific vars that need to load early, you can set the 'earlyVars' option
// note: 'earlyVars' will only run on basic html var objects. This will skip attributes and escaped vars
res.render('index', {lazyLoad: {earlyVars: ['myContent', 'myScripts', 'myStyles.mainStyle']}});

// data parameter is required for the method that ajax requests to, so it can get the next piece of the page
```

#### inside the template, and the tag you choose, use {{#lazyload}} to separate lazy loaded instances

```html
<!-- recommended, but Not dependent (optional) -->
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js"></script>
<!-- if jQuery is not defined, XMLHttpRequest method will be used as a fallback -->

<body>
    <header>The Header</header>
    <main>
        <h2>Hello, World!</h2>
        <br>
        <div style="height: 120vh;">
            lazy load 1
        </div>
    {{#lazyload}}
        <div style="height: 120vh;">
            lazy load 2
        </div>
    {{#lazyload}}
        <div style="height: 120vh;">
            lazy load 3
        </div>
    {{#lazyload}}
        <div style="height: 120vh;">
            lazy load 4
        </div>
    {{#lazyload}}
        <div style="height: 120vh;">
            lazy load 5
        </div>
    ####No More Info To LazyLoad
    </main>
    <footer>The Footer</footer>
</body>
```

### Lazy Load Event Listener

```js
// client side javascript, there is a custom event listener you can use
// this event listener is triggered every time a new page (new content) is lazy loaded
document.addEventListener('onPageLazyLoad', function(e){
    // getPage() returns the numbered section loaded, based on separation between {{#lazyload}} tag occurrences
    console.log('page', e.detail.getPage());
});
```

### Auto Ad Insert

```js
// you can easily and automatically place your ads into your website
// this method will place ads by page distance, running on client side, and updating with scrolling for lazy load compatibility
// note: autoAdInsert 'tag' and 'scrollElm' are similar to lazyLoad 'tag' and 'scrollElm'
res.render('index', {autoAdInsert: {tag: 'body', scrollElm: 'window', distance: '120%', topPadding: 1, content: '<h3>My Ad</h3>'}});

// autoAdInsert 'distance' can be a percentage of the window height, or an absolute number
res.render('index', {autoAdInsert: {distance: '20%'}});
res.render('index', {autoAdInsert: {distance: 320}});

// you can embed html
res.render('index', {autoAdInsert: {content: '<iframe src="/my/ad/url"></iframe>'}});
// or run a script on insert
let onAdInsertScript = `
e.detail.insertAd('<iframe src="/my/ad/url?adNumber='+e.detail.getAdNumber()+'"></iframe>');
`;
res.render('index', {autoAdInsert: {onInsert: onAdInsertScript}});
// you can also add a client side event listener
document.addEventListener('onAdInsert', e => {
    e.detail.insertAd('<iframe src="/my/ad/url?adNumber='+e.detail.getAdNumber()+'"></iframe>');
});

// autoAdInsert 'topPadding' is used to decide how far down the page, before the first ad shows
// a 'topPadding' greater than 1 will try to wait for a specific scroll height before inserting the first ad
res.render('index', {autoAdInsert: {topPadding: 10}});
// a 'topPadding' of 0 will put the first ad at the top of the page
res.render('index', {autoAdInsert: {topPadding: 0}});

// when ads are placed, they go between each child element inside the 'tag' option you specify
// by default, the ads avoid going inside the child elements
// you can also scan the child elements content by setting the 'includeInnerChildren' option to true
res.render('index', {autoAdInsert: {includeInnerChildren: true}});
```
