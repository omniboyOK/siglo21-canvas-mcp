import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distIndexPath = path.resolve(__dirname, "../dist/index.js");

if (fs.existsSync(distIndexPath)) {
  let content = fs.readFileSync(distIndexPath, "utf8");
  if (!content.startsWith("#!/usr/bin/env node")) {
    content = "#!/usr/bin/env node\n" + content;
    fs.writeFileSync(distIndexPath, content, "utf8");
    console.log("Added shebang to dist/index.js");
  }
}
