const { execSync } = require('child_process');

try {
  console.log("Finding process on port 3000...");
  const output = execSync('netstat -ano | findstr :3000').toString();
  const lines = output.split('\n');
  const pids = new Set();
  lines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length > 4 && parts[1].includes(':3000')) {
      pids.add(parts[4]);
    }
  });

  pids.forEach(pid => {
    if (pid !== '0') {
      console.log(`Killing PID ${pid}`);
      try {
        execSync(`taskkill /F /PID ${pid}`);
      } catch (e) {
        console.log(`Could not kill PID ${pid}`);
      }
    }
  });

  console.log("Running prisma generate...");
  execSync('npx prisma generate', { stdio: 'inherit' });
  
  console.log("Done! You can now start npm run dev.");
} catch(err) {
  console.error("Error:", err.message);
}
