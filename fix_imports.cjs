const fs = require("fs");
const path = require("path");

const filesToFix = [
  "src/pages/Index.tsx",
  "src/components/ExpenseDetailsDrawer.tsx",
  "src/hooks/useBudgetAlerts.ts",
  "src/components/ImportSheet.tsx",
  "src/components/SearchOverlay.tsx",
  "src/components/BudgetsSheet.tsx",
  "src/components/RecurringSheet.tsx",
  "src/components/AddExpenseSheet.tsx"
];

filesToFix.forEach(f => {
  const p = path.join(__dirname, f);
  let content = fs.readFileSync(p, "utf-8");
  
  // Remove the incorrect import
  content = content.replace("getCurrencySymbol,  ", "");
  
  // Add it to the correct import from "@/lib/expenses"
  if (content.includes('@/lib/expenses"')) {
    content = content.replace(/import \{(.*?)\} from "@\/lib\/expenses"/, (match, p1) => {
      // Don't add it twice
      if (p1.includes('getCurrencySymbol')) return match;
      return `import { getCurrencySymbol, ${p1.trim()} } from "@/lib/expenses"`;
    });
  } else {
    // If it doesn't import from expenses, just add it
    content = `import { getCurrencySymbol } from "@/lib/expenses";\n` + content;
  }
  
  fs.writeFileSync(p, content);
});
console.log("Fixed imports");
