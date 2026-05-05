const fs = require("fs");
const path = require("path");

const files = [
  "src/pages/Index.tsx",
  "src/hooks/useBudgetAlerts.ts",
  "src/components/ExpenseDetailsDrawer.tsx",
  "src/components/ExpenseRow.tsx",
  "src/components/SearchOverlay.tsx",
  "src/components/ImportSheet.tsx",
  "src/components/WeeklyView.tsx",
  "src/components/BudgetsSheet.tsx",
  "src/components/MonthlyView.tsx",
  "src/components/AddExpenseSheet.tsx",
  "src/components/RecurringSheet.tsx"
];

files.forEach(f => {
  const p = path.join(__dirname, f);
  let content = fs.readFileSync(p, "utf-8");
  
  // Ensure getCurrencySymbol is imported if we are going to use it
  if (!content.includes("getCurrencySymbol")) {
    content = content.replace('import {', 'import { getCurrencySymbol, ');
  }
  
  // Replace standalone ₹ with {getCurrencySymbol()}
  content = content.replace(/>₹</g, '>{getCurrencySymbol()}<');
  content = content.replace(/"₹"/g, 'getCurrencySymbol()');
  content = content.replace(/'₹'/g, 'getCurrencySymbol()');
  
  // Replace ₹${ with ${getCurrencySymbol()}${
  content = content.replace(/₹\$\{/g, '${getCurrencySymbol()}${');
  
  // Replace ₹{ with {getCurrencySymbol()}{
  content = content.replace(/₹\{/g, '{getCurrencySymbol()}{');
  
  fs.writeFileSync(p, content);
});
console.log("Replaced currency symbols");
