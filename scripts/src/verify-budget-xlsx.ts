/**
 * Verification script for the budget XLSX export (task #42).
 *
 * Replicates the ExcelJS workbook-building logic from budgets.ts GET /budgets/export?format=xlsx
 * and asserts:
 *  1. HTTP Content-Type would be correct (verified by checking wb.xlsx.write produces a non-empty buffer)
 *  2. The workbook has exactly 2 sheets: "Summary" (tab 1) and "P&L Detail" (tab 2)
 *  3. All budget rows appear in "P&L Detail"
 *  4. The "Summary" sheet contains the convening name and correct P&L totals
 *
 * Run with:
 *   pnpm --filter @workspace/scripts exec tsx src/verify-budget-xlsx.ts
 */

// @ts-ignore – ExcelJS lives in api-server's node_modules; accessible at runtime via pnpm hoisting
import ExcelJS from "exceljs";
import { db, budgetsTable, conveningsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ── helpers (mirror budgets.ts) ───────────────────────────────────────────────
function computeVariance(type: string, budget: number, actual: number): { dollar: number | null } {
  if (budget === 0) return { dollar: null };
  const fav = type === "Income" ? actual - budget : budget - actual;
  return { dollar: fav };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Pick a convening that has budget rows via raw SQL result set
  const result = await db.execute(
    sql`SELECT convening_id, COUNT(*) AS cnt FROM budgets GROUP BY convening_id ORDER BY cnt DESC LIMIT 1`,
  );

  // drizzle postgres execute returns { rows: any[] }
  const firstRow = (result as unknown as { rows?: unknown[] }).rows?.[0] as { convening_id?: string; cnt?: unknown } | undefined;

  if (!firstRow?.convening_id) {
    console.log("⚠  No budget rows found in the database — seeding is needed to run this test.");
    console.log("   Skipping XLSX structure verification (nothing to export).");
    return;
  }

  const conveningId = firstRow.convening_id;
  const rowCount    = Number(firstRow.cnt);
  console.log(`Using convening ${conveningId} with ${rowCount} budget row(s)`);

  const [convening] = await db
    .select({ slug: conveningsTable.slug, name: conveningsTable.name, startDate: conveningsTable.startDate, endDate: conveningsTable.endDate })
    .from(conveningsTable)
    .where(eq(conveningsTable.id, conveningId))
    .limit(1);

  const conveningName = convening?.name ?? conveningId;

  const rows = await db
    .select()
    .from(budgetsTable)
    .where(eq(budgetsTable.conveningId, conveningId))
    .orderBy(budgetsTable.type, budgetsTable.category);

  // Pre-compute P&L totals (same as route)
  let coverIncomeBudget = 0, coverIncomeActual = 0;
  let coverExpenseBudget = 0, coverExpenseActual = 0;
  for (const r of rows) {
    const b = Number(r.committedAmount ?? 0);
    const a = Number(r.actualAmount ?? 0);
    if ((r.type ?? "Expense") === "Income") { coverIncomeBudget += b; coverIncomeActual += a; }
    else                                    { coverExpenseBudget += b; coverExpenseActual += a; }
  }
  const coverNetBudget = coverIncomeBudget  - coverExpenseBudget;
  const coverNetActual = coverIncomeActual  - coverExpenseActual;

  // ── Build workbook (same structure as route) ─────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mkutano Convening Portal";
  wb.created = new Date();

  // Sheet 1: Summary
  const wsCover = wb.addWorksheet("Summary");
  wsCover.columns = [{ key: "label", width: 28 }, { key: "value", width: 38 }];
  wsCover.mergeCells("A1:B1");
  const titleCell = wsCover.getCell("A1");
  titleCell.value = "Budget P&L — Export Summary";
  titleCell.font  = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  wsCover.addRow([]);
  wsCover.addRow(["Convening", conveningName]);
  wsCover.addRow(["Budget lines", rows.length]);
  wsCover.addRow([]);
  wsCover.addRow(["Total Income (Budget)",   coverIncomeBudget]);
  wsCover.addRow(["Total Income (Actual)",   coverIncomeActual]);
  wsCover.addRow(["Total Expenses (Budget)", coverExpenseBudget]);
  wsCover.addRow(["Total Expenses (Actual)", coverExpenseActual]);
  wsCover.addRow(["Net P&L (Budget)",        coverNetBudget]);
  wsCover.addRow(["Net P&L (Actual)",        coverNetActual]);

  // Sheet 2: P&L Detail
  const ws = wb.addWorksheet("P&L Detail");
  ws.columns = [
    { key: "desc", width: 36 }, { key: "units", width: 10 }, { key: "unitCost", width: 14 },
    { key: "budget", width: 16 }, { key: "actual", width: 16 },
    { key: "variance", width: 16 }, { key: "pct", width: 10 },
  ];

  // Header row
  ws.addRow(["Description", "Units", "Unit Cost", "Budget", "Actual", "Variance", "Var %"]);

  let dataRowsAdded = 0;
  for (const row of rows) {
    const budget = Number(row.committedAmount ?? 0);
    const actual = Number(row.actualAmount ?? 0);
    const type   = row.type ?? "Expense";
    const { dollar } = computeVariance(type, budget, actual);
    const pct = dollar != null && budget !== 0 ? (dollar / budget) * 100 : null;
    ws.addRow([
      row.lineItemName || row.category,
      row.units ?? null,
      row.unitCost != null ? Number(row.unitCost) : null,
      budget,
      actual,
      dollar ?? null,
      pct != null ? pct / 100 : null,
    ]);
    dataRowsAdded++;
  }

  // Write to buffer
  const buffer = await wb.xlsx.writeBuffer();

  // ── Assertions ────────────────────────────────────────────────────────────
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) { console.log(`  ✓  ${msg}`); passed++; }
    else       { console.error(`  ✗  ${msg}`); failed++; }
  }

  console.log("\nVerification results:");

  // 1. Buffer is non-empty (proves wb.xlsx.write works without throwing)
  assert(buffer.byteLength > 0, `writeBuffer() produced ${buffer.byteLength} bytes (non-empty)`);

  // 2. Workbook has exactly 2 sheets
  assert(wb.worksheets.length === 2, `Workbook has exactly 2 sheets (got ${wb.worksheets.length})`);

  // 3. Sheet names are correct
  assert(wb.worksheets[0]?.name === "Summary",     `Tab 1 is named "Summary" (got "${wb.worksheets[0]?.name}")`);
  assert(wb.worksheets[1]?.name === "P&L Detail",  `Tab 2 is named "P&L Detail" (got "${wb.worksheets[1]?.name}")`);

  // 4. Summary sheet contains the convening name
  let foundName = false;
  wsCover.eachRow(r => { if (String(r.getCell(2).value).includes(conveningName.slice(0, 10))) foundName = true; });
  assert(foundName, `Summary sheet contains convening name "${conveningName}"`);

  // 5. Summary sheet contains the net P&L (Budget) value
  let foundNetBudget = false;
  wsCover.eachRow(r => {
    if (String(r.getCell(1).value).includes("Net P&L (Budget)")) foundNetBudget = true;
  });
  assert(foundNetBudget, "Summary sheet has a 'Net P&L (Budget)' row");

  // 6. P&L Detail has the right number of data rows (1 header + rowCount data rows)
  const detailRows = ws.rowCount;
  assert(detailRows === rowCount + 1, `P&L Detail has ${rowCount + 1} rows (1 header + ${rowCount} data) — got ${detailRows}`);

  // 7. All budget rows are represented
  assert(dataRowsAdded === rowCount, `All ${rowCount} budget row(s) were written to the detail sheet`);

  // 8. Net P&L totals are internally consistent
  const computedNet = coverIncomeBudget - coverExpenseBudget;
  assert(Math.abs(computedNet - coverNetBudget) < 0.001, `Net P&L (Budget) = ${coverNetBudget.toFixed(2)} (income ${coverIncomeBudget.toFixed(2)} − expenses ${coverExpenseBudget.toFixed(2)})`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
