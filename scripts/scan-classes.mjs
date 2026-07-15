import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(walk(filePath));
      } else {
        if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
          results.push(filePath);
        }
      }
    }
  } catch (e) {

  }
  return results;
}

const files = [...walk('app'), ...walk('components')];
const allClasses = new Set();


const classNameRegex = /className=(?:\{`|'|")([^`'"]+)(?:`\}|'|")/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = classNameRegex.exec(content)) !== null) {
    const classes = match[1].split(/\s+/);
    for (let cls of classes) {
      if (cls && !cls.includes('${') && !cls.includes('?')) {
        allClasses.add(cls.trim());
      }
    }
  }
}

fs.writeFileSync('all-classes.json', JSON.stringify(Array.from(allClasses), null, 2));
console.log(`Scanned ${files.length} files. Found ${allClasses.size} unique static classes.`);
