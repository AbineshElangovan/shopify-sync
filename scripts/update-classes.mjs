import fs from 'fs';

function updateFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\.sk-box/g, '.ys-sk-box');
  content = content.replace(/className="sk-box"/g, 'className="ys-sk-box"');
  
  content = content.replace(/\.sk-spinner/g, '.ys-sk-spinner');
  content = content.replace(/className="sk-spinner"/g, 'className="ys-sk-spinner"');
  
  content = content.replace(/\.sk-ping/g, '.ys-sk-ping');
  content = content.replace(/className="sk-ping"/g, 'className="ys-sk-ping"');
  
  content = content.replace(/\.sync-ring/g, '.ys-sync-ring');
  content = content.replace(/className="sync-ring"/g, 'className="ys-sync-ring"');
  
  fs.writeFileSync(file, content);
}

updateFile('components/common/PageLoader.tsx');
updateFile('app/settings/page.tsx');
updateFile('app/products/page.tsx');
updateFile('app/page.tsx');
console.log('Done updating classes.');
