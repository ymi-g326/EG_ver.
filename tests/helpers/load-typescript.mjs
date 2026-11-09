import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cache=new Map();
export function moduleUrl(url) {
  const path=fileURLToPath(url);
  if(cache.has(path))return cache.get(path);
  let code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  code=code.replace(/from ["'](\.[^"']+)["']/g,(_,name)=>`from ${JSON.stringify(moduleUrl(new URL(name.endsWith('.ts')?name:name+'.ts',url)))}`);
  const compiled='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(path,compiled);return compiled;
}
