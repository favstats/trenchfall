// Static TDZ guard, parser-based: flags Program-level references to const/let
// bindings that occur before their declaration. This is the bug class that
// shipped two boot crashes (WANDER, softDot).
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {fullAncestor} from 'acorn-walk';
const src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const ast=parse(src,{ecmaVersion:'latest',sourceType:'module',locations:true});
const decl=new Map(); // name -> line of program-level const/let declaration
for(const node of ast.body){
  if(node.type==='VariableDeclaration')
    for(const d of node.declarations)
      if(d.id.type==='Identifier')decl.set(d.id.name,d.id.loc.start.line);
}
const FN=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
const problems=[];
fullAncestor(ast,(node,_state,ancestors)=>{
  if(node.type!=='Identifier')return;
  const dl=decl.get(node.name);
  if(!dl||node.loc.start.line>=dl)return;
  if(ancestors.some(a=>FN.has(a.type)))return;       // deferred until call time
  // shadowing: a nested block redeclares the name before this use
  for(const a of ancestors){
    const body=a.type==='BlockStatement'?a.body:
      (a.type==='ForStatement'&&a.init&&a.init.type==='VariableDeclaration')?[a.init]:null;
    if(!body)continue;
    for(const st of body)
      if(st.type==='VariableDeclaration')
        for(const d2 of st.declarations)
          if(d2.id.type==='Identifier'&&d2.id.name===node.name&&d2.id.loc.start.line<=node.loc.start.line)return;
  }
  const parent=ancestors[ancestors.length-2];
  if(parent&&((parent.type==='Property'&&parent.key===node&&!parent.computed)||
    (parent.type==='MemberExpression'&&parent.property===node&&!parent.computed)))return;
  problems.push(`line ${node.loc.start.line}: "${node.name}" used before declaration (line ${dl})`);
});
if(problems.length){
  console.error('TDZ PROBLEMS:');for(const p of problems)console.error(' ',p);
  process.exit(1);
}
console.log('load order OK ('+decl.size+' top-level bindings, parser-verified)');
